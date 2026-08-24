const { getChannel } = require("../config/rabbitmq");
const { resolveEnvRoutingKey } = require("../utils/envRoutingKey");

/**
 * Publish to a topic exchange. The worker binds queues to routing keys.
 * Does not assert queues — that is the worker's job on boot.
 */
const publishMessage = async (
  exchange,
  routingKey,
  data,
  routingKeyUpdation = false,
) => {
  const channel = await getChannel();

  await channel.assertExchange(exchange, "topic", { durable: true });

  const resolvedRoutingKey = routingKeyUpdation
    ? routingKey
    : resolveEnvRoutingKey(routingKey);

  const payload = Buffer.from(JSON.stringify(data));

  const ok = channel.publish(exchange, resolvedRoutingKey, payload, {
    persistent: true,
    contentType: "application/json",
  });

  if (!ok) {
    console.warn(
      `⚠️ RabbitMQ write buffer full exchange=${exchange} routingKey=${resolvedRoutingKey}`,
    );
  } else {
    console.log(
      `📤 RabbitMQ published exchange=${exchange} routingKey=${resolvedRoutingKey}`,
    );
  }

  return ok;
};

module.exports = { publishMessage };
