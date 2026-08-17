const { getQueue } = require("../config/bullmq");

const TODO_QUEUE = process.env.BULLMQ_QUEUE || "todo";

const getTodoQueue = () => getQueue(TODO_QUEUE);

/**
 * Enqueue a todo domain event.
 * Queue name = project ("todo"), job name = event ("login").
 * Worker will route with handlers[queueName][job.name](job.data).
 */
const enqueueTodoEvent = async (event, data, opts = {}) => {
  if (!event) {
    throw new Error("enqueueTodoEvent: event is required");
  }

  return getTodoQueue().add(event, data, opts);
};

module.exports = { getTodoQueue, enqueueTodoEvent, TODO_QUEUE };
