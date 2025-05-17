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
        if (options.config_dead_letter_queue) {
            options.dead_letter_queue = true
        }
        await this.redis.hset(queue_meta_key, { createdAt: Date.now(), ...options });

        if (options.config_dead_letter_queue) {
            const dlq_name = `${queuename}_dlq`;
            const dlq_meta_key = `queue_meta:${dlq_name}`;
            const dlq_exists = await this.redis.exists(dlq_meta_key)
            if (!dlq_exists) {

                await this.redis.hset(dlq_meta_key, {
                    createdAt: Date.now(),
                    dead_letter_queue: true,
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
        if (!options.priority) {
            options.priority = 0;
        }

        const timestamp = Date.now();
        const score = options.priority * 1e10 + timestamp;
       

        const messageobj = new Message(queuename, messageId, message, options);
        //Previous implementation : List based implementation
        // await this.redis.lpush(queueKey, JSON.stringify(messageobj.tojson()));
        //New implementation : Sorted set based implementation
        await this.redis.zadd(queueKey, score, JSON.stringify(messageobj.tojson()));

        this.redis.publish(queueKey, messageId);
        console.log(`📩 Job added to queue "${queuename}" - ID: ${messageId}`);
    }

    async consumeMessageFromQueue(queuename, callback) {
        const queueKey = `queue:${queuename}`;
        const subscriber = this.redis.duplicate();
        const queue_meta_key = `queue_meta:${queuename}`;

        //get queue options
        const queueOptions = await this.redis.hgetall(queue_meta_key);

        const useDeadLetterQueue = queueOptions.dead_letter_queue === 'true' || queueOptions.dead_letter_queue === true;
        const maxRetries = parseInt(queueOptions.maxRetries || 3);



        // this function will process the jobs or messages using the provided callback
        const processJob = async (messageString) => {
            try {
                let parsedMessage = JSON.parse(messageString);
                let messageObj = new Message(
                    parsedMessage.queue_name,
                    parsedMessage.message_id,
                    parsedMessage.message,
                    parsedMessage.options
                );
                //Lifecycle update ====  waiting ---> processing 
                messageObj.updateLifecycleStatus('processing');

                await callback(parsedMessage.message);

                //Lifecycle update ====  processing ---> processed
                messageObj.updateLifecycleStatus('processed');
            } catch (err) {
                try {

                    const parsedMessage = JSON.parse(messageString);
                    let messageObj = new Message(
                        parsedMessage.queue_name,
                        parsedMessage.message_id,
                        parsedMessage.message,
                        parsedMessage.options
                    );

                    //Lifecycle update ====  processing ---> failed
                    messageObj.updateLifecycleStatus("failed")

                    messageObj.retries_made = parsedMessage.retries_made || 0;
                    if (useDeadLetterQueue) {
                        if (maxRetries > 0) {
                            await this.requeueMessage(queuename, messageObj, err);
                        } else {
                            await this.moveMessageToDLQ(queuename, messageObj, err);
                        }
                    } else {
                        console.log(`⚠️ Message failed but no DLQ configured `);
                    }
                } catch (dlqerror) {
                    console.error(`❌ Error handling failed message:`, dlqerror);
                }
            }
        };



        // this function will process all the existing elements that are in the queue
        const processExistingJobs = async () => {
            //Previous implementation : List based implementation
            // let message = await this.redis.rpop(queueKey);
            // while (message) {
            //     await processJob(message);
            //     message = await this.redis.rpop(queueKey);
            // }

            let entries = await this.redis.zrange(queueKey, 0, 0); // get the highest-priority (lowest-score) job
            while (entries.length > 0) {
                const message = entries[0];

                // Remove it before processing (to avoid duplicate processing if crash occurs during callback)
                await this.redis.zrem(queueKey, message);

                await processJob(message);

                entries = await this.redis.zrange(queueKey, 0, 0);
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

        //Previous implementation : List based implementation
        // const fallbackInterval = setInterval(async () => {
        //     const message = await this.redis.rpop(queueKey);
        //     if (message) {
        //         console.log(`⚠️ Fallback found unprocessed job`);
        //         await processJob(message);
        //         await processExistingJobs();
        //     }
        // }, 5000);

        //New implementation : Sorted set based implementation
        const fallbackInterval = setInterval(async () => {
            const entries = await this.redis.zrange(queueKey, 0, 0); // get highest-priority job
            if (entries.length > 0) {
                const message = entries[0];
        
                // Remove before processing
                await this.redis.zrem(queueKey, message);
        
                console.log(`⚠️ Fallback found unprocessed job`);
                await processJob(message);
        
                // Continue processing any remaining jobs
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

    async moveMessageToDLQ(queuename, messageObj, error) {
        const queue_meta_key = `queue_meta:${queuename}`;
        const queueOptions = await this.redis.hgetall(queue_meta_key);

        if (!queueOptions.dead_letter_queue) {
            console.log(`⚠️ No Dead Letter Queue configured for "${queuename}". Failed message discarded.`);
            return;
        }

        const dlqName = `${queuename}_dlq`;
        const parsedMessage = typeof messageObj === 'string' ? JSON.parse(messageObj) : messageObj;

        messageObj.updateLifecycleStatus('failed', error);
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

    async requeueMessage(queuename, messageObj, error) {
        const queue_meta_key = `queue_meta:${queuename}`;
        const queueOptions = await this.redis.hgetall(queue_meta_key);
        const maxRetries = parseInt(queueOptions.maxRetries || 3);
        let parsedMessage = typeof messageObj === 'string' ? JSON.parse(messageObj) : messageObj;
        const retryCount = (messageObj.retries_made || 0) + 1;
        messageObj.updateLifecycleStatus('requeued');
        if (!messageObj.options) {
            messageObj.options = {
                priority: 0
            };
        }
        messageObj.retries_made = messageObj.retries_made + 1;
        if (retryCount <= maxRetries) {

            parsedMessage.options = {
                ...messageObj.options,
                lastError: error.message,
                retryTimestamp: Date.now()
            };
            const timestamp = Date.now();
            const score = messageObj.options.priority * 1e10 + timestamp;
            //Previous implementation : List based implementation
            // await this.redis.lpush(`queue:${queuename}`, JSON.stringify(parsedMessage));
            //New implementation : Sorted set based implementation
            await this.redis.zadd(`queue:${queuename}`, score, JSON.stringify(parsedMessage));

            return true;
        } else {
            await this.moveMessageToDLQ(queuename, parsedMessage, error);
            return false;
        }

    }

    // Utility function to get DLQ messages for inspection or reprocessing
    async getDeadLetterMessages(queuename, limit = 100) {
        const dlq_name = `${queuename}_dlq`;
        const dlq_key = `queue:${dlq_name}`;
        const dlq_meta_key = `queue_meta:${dlq_name}`
        const isExists = await this.redis.exists(dlq_meta_key);
        if (!isExists) {
            throw new Error(`❌ Dead Letter Queue for "${queuename}" does not exist.`);
        }
        const messages = await this.redis.zrange(dlq_key, 0, limit - 1);
        return messages.map(msg => JSON.parse(msg));
    }

    //utility function to retry a fail message from dead letter queue using the messageId, for manual use
    async retryDeadLetterMessage(queuename, messageId) {
        const dlq_name = `${queuename}_dlq`;
        const dlq_key = `queue:${dlq_name}`;
        const dlq_meta_key = `queue_meta:${dlq_name}`
        
        // Get all messages from DLQ
        const messages = await this.redis.zrange(dlq_key, 0, -1);
        
        for (let i = 0; i < messages.length; i++) {
            const message = JSON.parse(messages[i]);

            if (message.message_id === messageId) {
                // Remove the message from DLQ
                await this.redis.zrem(dlq_key, messages[i]);

                // Reset retry count and publish back to original queue
                message.retries_made = 0;
                message.timestamp_updated = Date.now();

                const messageObj = new Message(
                    message.queue_name,
                    message.message_id,
                    message.message,
                    message.options
                );

                messageObj.updateLifecycleStatus('waiting');

                // Publish to the original queue
                await this.publishMessageToQueue(queuename, message.message, message.options);
                console.log(`🔄 Message ${messageId} moved from DLQ back to "${queuename}"`);
                return true;
            }
        }
    }
}

module.exports = BizzMQ