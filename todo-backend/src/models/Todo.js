const mongoose = require("mongoose");

const TodoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Please add title"],
      trim: true,
      maxLength: [100, "Title cannot be more than 100 characters"],
    },
    description: {
      type: String,
      trim: true,
    },
    completed: {
      type: Boolean,
      default: false,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: function (tags) {
          // Check if all tags are valid
          const validTags = ["work", "personal", "urgent", "others"];
          return tags.every((tag) => validTags.includes(tag));
        },
        message: "Invalid tag. Must be: work, personal, urgent, or others",
      },
    },
    dueDate: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

TodoSchema.index({ userId: 1, completed: 1 });
TodoSchema.index({ userId: 1, createdAt: -1 });
TodoSchema.index({ userId: 1, priority: 1 });

TodoSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Todo", TodoSchema);
