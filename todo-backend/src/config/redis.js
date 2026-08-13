const { createClient } = require("redis");

let redisClient = null;

const connectRedis = async () => {
  try {
    redisClient = createClient({
      username: process.env.REDIS_USERNAME || "default",
      password:
        process.env.REDIS_PASSWORD || "y1Hpd7kIpSy8n0BbFHAl2cgUvinlDOy1",
      socket: {
        host:
          process.env.REDIS_HOST ||
          "redis-10217.c305.ap-south-1-1.ec2.cloud.redislabs.com",
        port: process.env.REDIS_PORT || 10217,
      },
    });

    console.log("🔌 Connecting to Redis...");

    redisClient.on("error", (err) => console.error("❌ Redis Error:", err));
    redisClient.on("ready", () => console.log("✅ Redis Connected!"));

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.error(`❌ Redis Connection Failed: ${error.message}`);
    console.log("⚠️ Running without cache...");
    return null;
  }
};

const getRedisClient = () => redisClient;

module.exports = { connectRedis, getRedisClient };
