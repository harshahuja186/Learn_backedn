const { Queue } = require("bullmq");
const { getRedisConnection } = require("./redis"); // Shared credentials for node-redis (cache/rate-limit) and ioredis (BullMQ).

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 2000,
  },
  removeOnComplete: {
    count: 1000,
    age: 24 * 3600,
  },
  removeOnFail: {
    count: 5000,
    age: 7 * 24 * 3600,
  },
};

const queues = new Map();

const getQueue = (name) => {
  if (!queues.has(name)) {
    const queue = new Queue(name, {
      connection: getRedisConnection(),
      defaultJobOptions,
    });

    queue.on("error", (err) => {
      console.error(`❌ BullMQ queue [${name}] error:`, err.message);
    });

    queues.set(name, queue);
  }

  return queues.get(name);
};

const closeQueues = async () => {
  await Promise.all([...queues.values()].map((queue) => queue.close()));
  queues.clear();
};

module.exports = { getQueue, closeQueues };
