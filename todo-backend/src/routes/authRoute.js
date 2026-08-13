const express = require("express");
const router = express.Router();
const {
  register,
  login,
  refreshToken,
  getMe,
  updateProfile,
  updatePassword,
  deleteAccount,
} = require("../controller/userController");
const { protect } = require("../middleware/auth");
const { getLoginLimiter } = require("../config/rateLimiter");
const rateLimitMiddleware = require("../middleware/rateLimitMiddleware");

// Public routes
router.post("/register", register);
router.post(
  "/login",
  rateLimitMiddleware(getLoginLimiter, (req) => req?.body?.email || req.ip),
  login,
);
router.post("/refresh", refreshToken);

// Protected routes (require authentication)
router.get("/me", protect, getMe);
router.put("/profile", protect, updateProfile);
router.put("/password", protect, updatePassword);
router.delete("/me", protect, deleteAccount);

module.exports = router;
