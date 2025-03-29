const RedisClient = require('./redis')
const Message = require('./message')
class BizzMQ{
    constructor(redisuri){
        this.redisClient = new RedisClient(redisuri);
        this.redis = this.redisClient.getClient();
    }

    //function to create a queue, It will create a HSET , 
    // it will check if there's any queue exists in the redis instance as same name, if yes then it will skip the operation, else it will create the queue


   async createQueue(queuename , options={}){
        const queue_meta_key = `queue_meta:${queuename}`

        //check if queue exists
        const isExists = await this.redis.exists(queue_meta_key)
        if(isExists){
            console.log(`✅ Queue "${queuename}" already exists.`)
            return;
        }

        await this.redis.hset(queue_meta_key , {createdAt:Date.now() , ...options});
        console.log(`📌 Queue "${queuename}" created successfully.`)
    }


    // function to add a message to queue, message should be in json format
    async publishMessageToQueue(queuename, message , options){
        const queue_meta_key = `queue_meta:${queuename}`;
        const queueKey = `queue:${queuename}`;
        const isExists = await this.redis.exists(queue_meta_key)
        if(!isExists){
            throw new Error(`❌ Queue "${queuename}" does not exist. Create it first!`);
        }

        const messageId = `message:${Date.now()}`;
        const messageobj = new Message(queuename, messageId , message , options);
        await this.redis.lpush(queueKey, JSON.stringify(messageobj.tojson()));
        console.log(`📩 Job added to queue "${queuename}" - ID: ${messageId}`);
    }

    async consumeMessageFromQueue(queuename, callback){
        const queueKey = `queue:${queuename}`;
        while(true){
            const message = await this.redis.brpop(queueKey , 0);
            if(message){
                console.log(message);
            }
        }
    }
}

module.exports = BizzMQ