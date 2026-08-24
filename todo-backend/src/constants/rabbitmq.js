const RABBIT_EXCHANGES = {
  TODO: {
    name: "todoExchange",
    type: "topic",
    options: { durable: true },
  },
};

const RABBIT_ROUTING_KEYS = {
  LOGIN: "todo.user.login",
  SIGNUP: "todo.user.signup",
  LOGOUT: "todo.user.logout",
  FORGOT_PASSWORD: "todo.user.forgot_password",
};

module.exports = {
  RABBIT_EXCHANGES,
  RABBIT_ROUTING_KEYS,
};
