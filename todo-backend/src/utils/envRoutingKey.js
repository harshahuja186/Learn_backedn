/**
 * Isolates routing keys per environment on a shared broker.
 * "todo.user.login" → "todo.user.login_development"
 * Must match worker-service.
 */
function resolveEnvRoutingKey(variable) {
  const explicit = process.env[variable]?.trim();
  if (explicit) return explicit;

  const nodeEnv = (process.env.NODE_ENV || "development")
    .trim()
    .replace(/^["']|["']$/g, "");

  return `${variable}_${nodeEnv}`;
}

module.exports = { resolveEnvRoutingKey };
