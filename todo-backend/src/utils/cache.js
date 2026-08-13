const { getRedisClient } = require("../config/redis");

const getCache = async (key) => {
  const redisClient = getRedisClient();
  if (!redisClient || !redisClient.isOpen || !key) return null;

  try {
    const cachedData = await redisClient.get(key);
    if (!cachedData) return null;
    return JSON.parse(cachedData);
  } catch (error) {
    console.error("Error getting cache:", error);
    return null;
  }
};

const setCache = async (key, data, ttl = process.env.CACHE_TTL || 3600) => {
  const redisClient = getRedisClient();
  if (!redisClient || !redisClient.isOpen || !key) return;

  try {
    await redisClient.setEx(key, Number(ttl), JSON.stringify(data));
    console.log(`💾 Cached: ${key}`);
  } catch (error) {
    console.error("Error setting cache:", error);
  }
};

// Supports exact keys and * patterns
const invalidateCache = async (...keys) => {
  const redisClient = getRedisClient();
  const validKeys = keys.filter(Boolean).map(String);
  if (!redisClient || !redisClient.isOpen || validKeys.length === 0) return;

  try {
    const toDelete = [];

    for (const key of validKeys) {
      if (key.includes("*")) {
        // scanIterator yields a batch (string[]) per iteration — flatten it
        for await (const batch of redisClient.scanIterator({
          MATCH: key,
          COUNT: 100,
        })) {
          toDelete.push(...batch);
        }
      } else {
        toDelete.push(key);
      }
    }

    if (toDelete.length === 0) return;

    await redisClient.del(toDelete);
    console.log(`🗑️ Cache invalidated: ${toDelete.join(", ")}`);
  } catch (error) {
    console.error("Error invalidating cache:", error);
  }
};

module.exports = { getCache, setCache, invalidateCache };
