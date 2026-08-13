function rateLimitMiddleware(limiterFn, keyFn) {
  return async (req, res, next) => {
    try {
      const limiter = limiterFn();
      const key = keyFn(req);
      await limiter.consume(key);
      next();
    } catch (error) {
      console.error("error", error);
      res.setHeader("Retry-After", Math.ceil(error.msBeforeNext / 1000) || 1);
      res.status(429).json({
        success: false,
        message: "Too many requests, please try again later.",
      });
    }
  };
}

module.exports = rateLimitMiddleware;
