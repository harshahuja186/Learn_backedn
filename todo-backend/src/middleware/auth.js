const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Protect routes - verify access token
exports.protect = async (req, res, next) => {
  // Read access token from httpOnly cookie
  const token = req.cookies.accessToken;

  // Check if token exists
  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Not authorized to access this route",
    });
  }

  try {
    // Verify access token
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    // Find user by id from token
    const user = await User.findById(decoded.id).select("-password");
    req.user_id = user._id;

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "User not found",
      });
    }

    next();
  } catch (error) {
    // Token expired vs invalid — both should be 401 so the frontend
    // interceptor knows to attempt a refresh
    return res.status(401).json({
      success: false,
      error: "Not authorized to access this route",
      message: error.message, // e.g. "jwt expired" or "invalid signature"
    });
  }
};
