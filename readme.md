# BizzMQ

A lightweight Redis-based message queue with Dead Letter Queue support

## Features

- **Simple Redis-Based Queue**: Leverage the power and reliability of Redis for message storage and processing
- **Real-Time Processing**: Utilizes Redis Pub/Sub for immediate job notification with fallback polling
- **Dead Letter Queue**: Automatic handling of failed messages with configurable DLQ
- **Retry Mechanism**: Configurable retry attempts for failed jobs before they're moved to DLQ
- **Message Persistence**: Jobs are safely stored in Redis until successfully processed
- **Low Overhead**: Minimal dependencies and lightweight design for optimal performance
- **Error Handling**: Robust error handling with detailed error tracking in failed messages
- **Easy Integration**: Simple API that integrates easily with existing Node.js applications

## Installation

```bash
npm install bizzmq
```

## Prerequisites

- Node.js (v14 or higher)
- Redis server (v5 or higher)

## Quick Start

### Basic Usage

```javascript
const BizzMQ = require('bizzmq');

async function main() {
  // Initialize with Redis connection string
  const mq = new BizzMQ('redis://localhost:6379');
  
  // Create a queue
  await mq.createQueue('email-queue');
  
  // Add a job to the queue
  const jobData = {
    to: "user@example.com",
    subject: "Welcome to Our Service",
    body: "Thank you for signing up!"
  };
  
  await mq.publishMessageToQueue('email-queue', jobData);
  
  // Process jobs
  const cleanup = await mq.consumeMessageFromQueue('email-queue', async (data) => {
    console.log(`Sending email to ${data.to}`);
    // Your job processing logic here
    await sendEmail(data);
    console.log('Email sent successfully');
  });
  
  // When you're done, call the cleanup function
  // cleanup();
}

main().catch(console.error);
```

### Using Dead Letter Queue

```javascript
const BizzMQ = require('bizzmq');

async function main() {
  const mq = new BizzMQ('redis://localhost:6379');
  
  // Create a queue with Dead Letter Queue enabled
  await mq.createQueue('email-queue', {
    dead_letter_queue: true,  // Enable DLQ
    maxRetries: 3             // Try 3 times before moving to DLQ
  });
  
  // Add a job
  const jobData = {
    to: "user@example.com",
    subject: "Welcome to Our Service",
    body: "Thank you for signing up!"
  };
  
  await mq.publishMessageToQueue('email-queue', jobData, {
    priority: "high"  // Optional job-specific options
  });
  
  // Process jobs with error handling
  const cleanup = await mq.consumeMessageFromQueue('email-queue', async (data, fullMessage) => {
    try {
      console.log(`Sending email to ${data.to}`);
      await sendEmail(data);
      console.log('Email sent successfully');
    } catch (error) {
      // This will trigger the retry mechanism
      // After maxRetries, it will go to the DLQ
      throw error;
    }
  });
  
  // Check failed jobs in DLQ
  const failedJobs = await mq.getDeadLetterMessages('email-queue');
  console.log(`Found ${failedJobs.length} failed jobs`);
  
  // Retry a specific failed job
  if (failedJobs.length > 0) {
    await mq.retryDeadLetterMessage('email-queue', failedJobs[0].id);
  }
}

main().catch(console.error);
```

## Complete Example

```javascript
const BizzMQ = require('bizzmq');

async function example() {
  // Initialize the queue system
  const mq = new BizzMQ('redis://localhost:6379');
  
  // Create a queue with DLQ enabled
  await mq.createQueue('firstqueue', {dead_letter_queue: true});
  
  // Prepare job data
  const jobData = {
    type: "email-data",
    to: "user@example.com",
    subject: "Welcome to Our Platform!",
    body: "Thank you for joining. We're excited to have you onboard!",
    createdAt: Date.now(),
    priority: "high"
  };
  
  // Publish message to queue with additional options
  await mq.publishMessageToQueue('firstqueue', jobData, {
    priority: "medium",
  });
  
  console.log("Job published successfully");
  
  // Set up consumer
  const cleanup = await mq.consumeMessageFromQueue('firstqueue', async (data) => {
    console.log(`Processing ${data.type} job for ${data.to}`);
    
    // Simulate sending email
    if (data.to.includes('#') || !data.to.includes('@')) {
      throw new Error('Invalid email address');
    }
    
    // Email sent successfully
    console.log(`Email sent to ${data.to}`);
  });
  
  // Later, check if any messages failed
  setTimeout(async () => {
    const failedJobs = await mq.getDeadLetterMessages('firstqueue');
    console.log(`Found ${failedJobs.length} failed email jobs`);
    
    // Cleanup when done
    cleanup();
  }, 10000);
}

example().catch(err => console.error('Error in example:', err));
```

## API Reference

### Constructor

#### `new BizzMQ(redisUri)`

Creates a new BizzMQ instance connected to the specified Redis server.

- `redisUri` (String): Redis connection string (e.g., 'redis://localhost:6379')

### Queue Management

#### `async createQueue(queueName, options)`

Creates a new queue. If the queue already exists, this operation is skipped.

- `queueName` (String): Name of the queue to create
- `options` (Object): Queue configuration options
  - `dead_letter_queue` (Boolean): Whether to create a DLQ for this queue (default: false)
  - `maxRetries` (Number): Maximum number of retry attempts before sending to DLQ (default: 3)

#### `async publishMessageToQueue(queueName, message, options)`

Publishes a message to the specified queue.

- `queueName` (String): Name of the queue
- `message` (Object): The message/job data to be processed
- `options` (Object): Optional message-specific settings
  - `priority` (String): Message priority (e.g., "high", "medium", "low")
  - Any additional custom metadata for the message

Returns the generated message ID.

#### `async consumeMessageFromQueue(queueName, callback)`

Starts consuming messages from the specified queue.

- `queueName` (String): Name of the queue to consume from
- `callback` (Function): Async function to process each message
  - Called with `(data, fullMessage)` parameters
  - `data` contains the message data
  - `fullMessage` contains the complete message object including metadata

Returns a cleanup function that should be called to stop consuming.

### Dead Letter Queue Management

#### `async getDeadLetterMessages(queueName, limit)`

Retrieves messages from the dead letter queue without removing them.

- `queueName` (String): Name of the original queue
- `limit` (Number): Maximum number of messages to retrieve (default: 100)

Returns an array of failed message objects.

#### `async retryDeadLetterMessage(queueName, messageId)`

Moves a message from the dead letter queue back to the original queue for retry.

- `queueName` (String): Name of the original queue
- `messageId` (String): ID of the message to retry

Returns `true` if the message was successfully moved.

## Error Handling

When job processing fails (callback throws an error):

1. The error is caught and logged
2. If retry is enabled, the job retry count is incremented
3. If retry count < maxRetries, the job is added back to the queue
4. If retry count >= maxRetries, the job is moved to the DLQ (if enabled)
5. Error details are preserved with the job for debugging

## Best Practices

1. **Enable Dead Letter Queues** for production workloads to capture failed jobs
2. **Set appropriate maxRetries** based on the transient nature of expected failures
3. **Include relevant metadata** in your job data for easier debugging
4. **Check your DLQ regularly** for repeated failures that might indicate systemic issues
5. **Implement graceful shutdown** by calling the cleanup function returned by `consumeMessageFromQueue`

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.