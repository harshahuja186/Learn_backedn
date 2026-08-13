require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const connectDB = require("./src/config/database");
const { connectRedis } = require("./src/config/redis");
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const PORT = process.env.PORT || 5000;

const todoRoutes = require("./src/routes/todoRoute");
const authRoutes = require("./src/routes/authRoute");
const { initRateLimiters } = require("./src/config/rateLimiter");
// Middleware
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`\n📝 ${req.method} ${req.path}`);
  next();
});

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "🚀 Todo API with Redis",
    endpoints: {
      todos: "GET /api/todos",
      createTodo: "POST /api/todos",
      updateTodo: "PUT /api/todos/:id",
      deleteTodo: "DELETE /api/todos/:id",
      toggleTodo: "PATCH /api/todos/:id/toggle",
    },
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/todos", todoRoutes);

const startServer = async () => {
  try {
    await connectDB();
    await connectRedis();
    initRateLimiters();

    app.listen(PORT, () => {
      console.log(`\n${"=".repeat(50)}`);
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📍 API: http://localhost:${PORT}/api/todos`);
      console.log(`${"=".repeat(50)}\n`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
