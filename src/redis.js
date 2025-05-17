const Redis = require("ioredis");

class RedisClient {
  constructor(redisUrl) {
    if (!redisUrl) throw new Error("Redis URL is required");
    
    this.redis = new Redis(redisUrl);
    printWelcomeMessage()
    this.redis.on("connect", () => console.log("🔌 Connected to Redis Database"));
    this.redis.on("error", (err) => console.error("❌ Redis Error:", err));
  }

  getClient() {
    return this.redis;
  }

  
}

function printWelcomeMessage() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                                                            ║");
  console.log("║   🚀 BizzMQ Queue System v1.2.0 (Early Release)            ║");
  console.log("║         A lightweight message queue for node.js            ║");
  console.log("║                                                            ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║                                                            ║");
  console.log("║   ⚠️  EARLY VERSION NOTICE                                  ║");
  console.log("║       This is an early version and may contain bugs.       ║");
  console.log("║       Please report any issues you encounter to:           ║");
  console.log("║       github.com/subhammahanty235/bizzmq-go/issues         ║");
  console.log("║                                                            ║");
  console.log("║   💡 USAGE                                                 ║");
  console.log("║       1. Create queues                                     ║");
  console.log("║       2. Publish messages                                  ║");
  console.log("║       3. Set up consumers                                  ║");
  console.log("║                                                            ║");
  console.log("║   📚 For documentation visit:                              ║");
  console.log("║       https://www.npmjs.com/package/bizzmq                 ║");
  console.log("║                                                            ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
}



module.exports = RedisClient;
