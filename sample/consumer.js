const BizzMQ = require("../src/queue");

const mq = new BizzMQ('redis://localhost:6379')
mq.createQueue('firstqueue4', {config_dead_letter_queue:true});


  // for(let i=0;i<10;i++){
  //   const jobData = {
  //       type: "email-data - "+i,   // Job type
  //       to: "user#kjhwekhwkedhwkfle.com",
  //       subject: "Welcome to Our Platform!",
  //       body: "Thank yoewdkjewhewkjfhekfhjkwfh to have you onboard!",
  //       createdAt: Date.now(),
  //       priority: "high",
  //       retries: 3,       // Max retries if it fails
  //     };
  //   setTimeout(() => {
  //       mq.publishMessageToQueue('firstqueue' , jobData , {priority: "medium",})
  //       console.log(`${i} job added`)
  //     },i * 1000 );
    
  // }
//   mq.publishMessageToQueue('firstqueue' , jobData , {priority: "medium",})
let index = 0;
mq.consumeMessageFromQueue('firstqueue4' , (message)=>{
  console.log(message)
})
console.log("I am here")