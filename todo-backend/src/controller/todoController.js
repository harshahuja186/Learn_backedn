const Todo = require("../models/Todo.js");
const { getCache, setCache, invalidateCache } = require("../utils/cache.js");

const todoListKey = (userId, page, limit) =>
  `todos:user:${userId}:page:${page}:limit:${limit}`;

const todoItemKey = (id) => `todo:${id}`;

// @route GET /api/todos for getting all todos created by a user
// Query: ?userId=&page=1&limit=10
exports.getTodos = async (req, res) => {
  try {
    const userId = req.user_id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit, 10) || 10),
    );
    const cacheKey = todoListKey(userId, page, limit);

    const cached = await getCache(cacheKey);
    if (cached) {
      const { data, total } = cached;
      return res.json({
        success: true,
        source: "cache",
        count: data.length,
        total,
        totalPages: Math.ceil(total / limit) || 0,
        data,
      });
    }

    const skip = (page - 1) * limit;
    const startTime = Date.now();

    const [todos, total] = await Promise.all([
      Todo.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Todo.countDocuments({ userId }),
    ]);

    const duration = Date.now() - startTime;
    console.log(`⏱️ DB Query Time: ${duration}ms`);

    await setCache(cacheKey, { data: todos, total });

    res.json({
      success: true,
      source: "database",
      queryTime: `${duration}ms`,
      count: todos.length,
      total,
      totalPages: Math.ceil(total / limit) || 0,
      data: todos,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

//@route GET /api/todos/:id for getting a single todo
exports.getTodo = async (req, res) => {
  try {
    const cacheKey = todoItemKey(req.params.id);

    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        source: "cache",
        data: cached,
      });
    }

    const startTime = Date.now();
    const todo = await Todo.findById(req.params.id).lean();

    if (!todo) {
      return res.status(404).json({ success: false, error: "Todo not found" });
    }

    const duration = Date.now() - startTime;
    console.log(`⏱️ DB Query Time: ${duration}ms`);

    await setCache(cacheKey, todo);

    res.json({
      success: true,
      source: "database",
      queryTime: `${duration}ms`,
      data: todo,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.createTodo = async (req, res) => {
  try {
    const { title, description, priority, tags, dueDate, ...rest } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        error: "Title, Description, and Tags are required",
      });
    }

    const todo = await Todo.create({
      title,
      description,
      priority,
      tags,
      dueDate,
      userId: req.user_id,
      ...rest,
    });

    console.log("✅ Todo created!");

    // New item isn't cached yet — only list pages are stale
    await invalidateCache(`todos:user:${req.user_id}:*`);

    res.status(201).json({
      success: true,
      message: "Todo created",
      data: todo,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

//@route PUT /api/todos/:id for updating a todo
exports.updateTodo = async (req, res) => {
  try {
    const { title, description, priority, tags, dueDate, ...rest } = req.body;
    const userId = req.user_id;
    if (!title || !description || !tags) {
      return res.status(400).json({
        success: false,
        error: "Title, Description, and Tags are required",
      });
    }

    const todo = await Todo.findByIdAndUpdate(
      req.params.id,
      { title, description, priority, tags, dueDate, ...rest },
      { new: true },
    ).lean();

    if (!todo) {
      return res.status(404).json({ success: false, error: "Todo not found" });
    }

    await invalidateCache(`todos:user:${userId}:*`, todoItemKey(todo._id));

    res.json({
      success: true,
      message: "Todo updated",
      data: todo,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

//@route DELETE /api/todos/:id for deleting a todo
exports.deleteTodo = async (req, res) => {
  try {
    const todo = await Todo.findByIdAndDelete(req.params.id).lean();

    if (!todo) {
      return res.status(404).json({ success: false, error: "Todo not found" });
    }

    const userId = req.user_id;

    await invalidateCache(`todos:user:${userId}:*`, todoItemKey(todo._id));

    res.json({
      success: true,
      message: "Todo deleted",
      data: todo,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
