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
        if(options.dead_letter_queue){
            console.log("Dead Letter queue wanted")
        }
        //check if queue exists
        const isExists = await this.redis.exists(queue_meta_key)
        if (isExists) {
            console.log(`✅ Queue "${queuename}" already exists.`)
            return;
        }

        await this.redis.hset(queue_meta_key, { createdAt: Date.now(), ...options });
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
        const subscriber = this.redis.duplicate(); // Separate connection for Pub/Sub

        // Set up the actual job processing function
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


}

module.exports = BizzMQ