const Redis = require("ioredis");

class RedisClient {
  constructor(redisUrl) {
    if (!redisUrl) throw new Error("Redis URL is required");
    
    this.redis = new Redis(redisUrl);

    this.redis.on("connect", () => console.log("🔌 Connected to Redis Database"));
    this.redis.on("error", (err) => console.error("❌ Redis Error:", err));
  }

  getClient() {
    return this.redis;
  }
}

module.exports = RedisClient;
