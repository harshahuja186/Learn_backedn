const { RateLimiterRedis } = require("rate-limiter-flexible");
const { getRedisClient } = require("./redis");

let generalLimiter = null;
let loginLimiter = null;
function initRateLimiters() {
  generalLimiter = new RateLimiterRedis({
    storeClient: getRedisClient(),
    keyPrefix: "rateLimiter:general",
    points: 10, // 100 requests
    duration: 60, // per 60 seconds
    useRedisPackage: true,
  });

  loginLimiter = new RateLimiterRedis({
    storeClient: getRedisClient(),
    keyPrefix: "rateLimiter:login",
    points: 5,
    duration: 900, // 15 minutes
    useRedisPackage: true,
  });
}

function getGeneralLimiter() {
  return generalLimiter;
}

function getLoginLimiter() {
  return loginLimiter;
}

module.exports = {
  initRateLimiters,
  getGeneralLimiter,
  getLoginLimiter,
};
