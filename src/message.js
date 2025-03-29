class Message{
    constructor(queue_name, message, options={}){
        this.queue_name = queue_name;
        this.message = message;
        this.status = 'waiting' //default lifecycle state
        this.timestamp_created = new Date()
        this.timestamp_updated = this.timestamp_created;
        this.options = {
            priority: options.priority || 0,
            retries: options.retries || 1,
            dead_letter_queue_enable: options.dead_letter_queue_enable || false,
        }
        this.retries_made = 0;
    }

    /*
        LifeCycle of Jobs/Messages
        1. Waiting --> Message is queued but not yet processed
        2. Processing --> Message is getting processed by consumer
        3. Processed --> Message is Processed by the consumer/worker
        4. Failed --> Message is failed during processing, in this case we will check if retries needed or we can simply drop it
        5. Requeued --> If message is failed then we will add it to Dead Letter Queue and processed again
    */
    updateLifecycleStatus (){

    }

    incrementRetries(){

    }

    tojson(){
        return {
            queue_name: this.queue_name,
            message: this.message,
            status: this.status,
            timestamp_created: this.timestamp_created,
            timestamp_updated: this.timestamp_updated,
            options: this.options,
            retries_made: this.retries_made,
          };
    }
}


module.exports = Message

