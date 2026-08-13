const express = require("express");
const router = express.Router();
const {
  getTodos,
  getTodo,
  createTodo,
  updateTodo,
  deleteTodo,
} = require("../controller/todoController");
const { protect } = require("../middleware/auth");
const { getGeneralLimiter } = require("../config/rateLimiter");
const rateLimitMiddleware = require("../middleware/rateLimitMiddleware");

// Apply protect middleware to all routes in this router
router.use(protect);
router.use(
  rateLimitMiddleware(getGeneralLimiter, (req) => req.user_id || req.ip),
);

router.get("/", getTodos);
router.get("/:id", getTodo);
router.post("/", createTodo);
router.put("/:id", updateTodo);
router.delete("/:id", deleteTodo);

module.exports = router;
