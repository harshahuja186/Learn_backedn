const { createClient } = require("redis");

let redisClient = null;

// Shared credentials for node-redis (cache/rate-limit) and ioredis (BullMQ).
const getRedisConnection = () => ({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
});

const connectRedis = async () => {
  try {
    const { host, port, username, password } = getRedisConnection();

    redisClient = createClient({
      username,
      password,
      socket: {
        host,
        port,
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

module.exports = { connectRedis, getRedisClient, getRedisConnection };
