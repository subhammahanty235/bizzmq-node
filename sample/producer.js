const BizzMQ = require("../src/queue");

const mq = new BizzMQ('redis://localhost:6379')
mq.createQueue('firstqueue4', { config_dead_letter_queue: true });
function addJobs(priority, prefix) {
  for (let i = 0; i < 10; i++) {
    const jobData = {
      type: `${prefix} - email-data - ${i}`,
      to: "user#kjhwekhwkedhwkfle.com",
      body: "Thank yoewdkjewhewkjfhekfhjkwfh to have you onboard!",
      createdAt: Date.now(),
      priority: "high",
      retries: 3,
    };

    setTimeout(() => {
      mq.publishMessageToQueue("firstqueue4", jobData, { priority });
      console.log(`${prefix} - ${i} job added`);
    }, i * 500);
  }
}

addJobs(0, "high")
addJobs(1, "medium")
addJobs(2, "low")
// mq.publishMessageToQueue('firstqueue' , jobData , {priority: "medium",})
console.log("I am here")