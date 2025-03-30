const RedisClient = require('./redis')
const Message = require('./message')
class BizzMQ {
    constructor(redisuri) {
        this.redisClient = new RedisClient(redisuri);
        this.redis = this.redisClient.getClient();
    }

    //function to create a queue, It will create a HSET , 
    // it will check if there's any queue exists in the redis instance as same name, if yes then it will skip the operation, else it will create the queue

    async createQueue(queuename, options = {}) {

        const queue_meta_key = `queue_meta:${queuename}`
        //check if queue exists
        const isExists = await this.redis.exists(queue_meta_key)
        if (isExists) {
            console.log(`✅ Queue "${queuename}" already exists.`)
            return;
        }

        await this.redis.hset(queue_meta_key, { createdAt: Date.now(), ...options });

        if (options.config_dead_letter_queue) {
            const dlq_name = `${queuename}_dlq`;
            const dlq_meta_key = `queue_meta:${dlq_name}`;
            const dlq_exists = await this.redis.exists(dlq_meta_key)
            if (!dlq_exists) {
                await this.redis.hset(dlq_meta_key, {
                    createdAt: Date.now(),
                    isDeadLetterQueue: true,
                    parentQueue: queuename,
                    retry: options.retry || 0,
                    maxRetries: options.maxRetries || 0,
                })
            }
        }
        console.log(`📌 Queue "${queuename}" created successfully.`)
    }


    // function to add a message to queue, message should be in json format
    async publishMessageToQueue(queuename, message, options) {
        const queue_meta_key = `queue_meta:${queuename}`;
        const queueKey = `queue:${queuename}`;
        const isExists = await this.redis.exists(queue_meta_key)
        if (!isExists) {
            throw new Error(`❌ Queue "${queuename}" does not exist. Create it first!`);
        }

        const messageId = `message:${Date.now()}`;
        const messageobj = new Message(queuename, messageId, message, options);
        await this.redis.lpush(queueKey, JSON.stringify(messageobj.tojson()));
        this.redis.publish(queueKey, messageId);
        console.log(`📩 Job added to queue "${queuename}" - ID: ${messageId}`);
    }

    async consumeMessageFromQueue(queuename, callback) {
        const queueKey = `queue:${queuename}`;
        const subscriber = this.redis.duplicate();

        // this function will process the jobs or messages using the provided callback
        const processJob = async (message) => {
            try {
                const parsedMessage = JSON.parse(message);
                await callback(parsedMessage); // Execute job callback
            } catch (err) {

                console.error("❌ Error processing job:", err);
            }
        };

        // this function will process all the existing elements that are in the queue
        const processExistingJobs = async () => {
            let message = await this.redis.rpop(queueKey);
            while (message) {
                await processJob(message);
                message = await this.redis.rpop(queueKey);
            }
        };

        await processExistingJobs();
        await subscriber.subscribe(queueKey, async (messageId) => {
            console.log(`🔔 New job notification received: ${messageId}`);
            const message = await this.redis.rpop(queueKey);
            if (message) {
                await processJob(message);
            }
        });


        const fallbackInterval = setInterval(async () => {
            const message = await this.redis.rpop(queueKey);
            if (message) {
                console.log(`⚠️ Fallback found unprocessed job`);
                await processJob(message);
                await processExistingJobs();
            }
        }, 5000);
        console.log(`📡 Listening for jobs on ${queuename}...`);
        return () => {
            clearInterval(fallbackInterval);
            subscriber.unsubscribe(queueKey);
            subscriber.quit();
        };

    }

    async moveMessageToDLQ(queuename, message, error) {
        const queue_meta_key = `queue_meta:${queuename}`;
        const queueOptions = await this.redis.hgetall(queue_meta_key);

        if (!queueOptions.dead_letter_queue) {
            console.log(`⚠️ No Dead Letter Queue configured for "${queuename}". Failed message discarded.`);
            return;
        }

        const dlqName = `${queuename}_dlq`;
        const parsedMessage = typeof message === 'string' ? JSON.parse(message) : message;

        parsedMessage.error = {
            message: error.message,
            stack: error.stack,
            timestamp: Date.now()
        };

        await this.publishMessageToQueue(dlqName, parsedMessage.data, {
            ...parsedMessage.options,
            originalQueue: queuename,
            failedAt: Date.now()
        });


    }

    async requeueMessage(queuename, message, error) {
        const queue_meta_key = `queue_meta:${queuename}`;
        const queueOptions = await this.redis.hgetall(queue_meta_key);
        const maxRetries = parseInt(queueOptions.maxRetries || 3);
        let parsedMessage = typeof message === 'string' ? JSON.parse(message) : message;
        const retryCount = (parsedMessage.options?.retryCount || 0) + 1;
        if (retryCount <= maxRetries) {
            parsedMessage.options = {
                ...parsedMessage.options,
                retryCount,
                lastError: error.message,
                retryTimestamp: Date.now()
            };
            await this.redis.lpush(`queue:${queuename}`, JSON.stringify(parsedMessage));
            console.log(`🔄 Message requeued for retry (${retryCount}/${maxRetries}) - ID: ${parsedMessage.id}`);
            return true;
        } else {
            await this.moveToDeadLetterQueue(queuename, parsedMessage, error);
            return false;
        }

    }
}

module.exports = BizzMQ