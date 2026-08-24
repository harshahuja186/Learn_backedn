const amqp = require("amqplib");

let connection = null;
let channel = null;

const getRabbitUrl = () => process.env.RABBITMQ_URL;

function formatConnectError(error, url) {
  if (error?.code === "ECONNREFUSED") {
    return `Cannot connect to RabbitMQ at ${url}. Start the broker (docker start rabbitmq) then retry.`;
  }

  const nested = error?.errors?.map((err) => err.message).filter(Boolean);
  if (nested?.length) {
    return nested.join("; ");
  }

  return error?.message || String(error);
}

const connectRabbit = async () => {
  if (channel) return channel;

  const url = getRabbitUrl();
  if (!url) {
    throw new Error("RABBITMQ_URL is not set");
  }

  console.log("🔌 Connecting to RabbitMQ...");

  try {
    connection = await amqp.connect(url);
    channel = await connection.createChannel();
  } catch (error) {
    throw new Error(formatConnectError(error, url), { cause: error });
  }

  connection.on("error", (err) => {
    console.error("❌ RabbitMQ connection error:", err.message);
  });
  connection.on("close", () => {
    console.warn("⚠️ RabbitMQ connection closed");
    connection = null;
    channel = null;
  });

  console.log("✅ RabbitMQ Connected!");
  return channel;
};

const getChannel = async () => {
  if (!channel) return connectRabbit();
  return channel;
};

const closeRabbit = async () => {
  try {
    if (channel) await channel.close();
  } catch {
    // ignore
  }
  try {
    if (connection) await connection.close();
  } catch {
    // ignore
  }
  channel = null;
  connection = null;
};

module.exports = { connectRabbit, getChannel, closeRabbit, getRabbitUrl };
