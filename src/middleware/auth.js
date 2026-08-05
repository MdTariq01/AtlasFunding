const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * Protect routes — require valid JWT
 */
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: "Not authenticated. Please log in." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
    req.user = await User.findById(decoded.id).select("-password_hash");

    if (!req.user) {
      return res.status(401).json({ success: false, message: "User no longer exists." });
    }

    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token." });
  }
};

/**
 * Optional auth — attach user if token present, but don't block
 */
const optionalAuth = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
      req.user = await User.findById(decoded.id).select("-password_hash");
    } catch {
      // silently ignore invalid token for optional routes
    }
  }

  next();
};

/**
 * Generate a signed JWT for a user
 */
const signToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET || "dev_secret", {
    expiresIn: "30d",
  });
};

module.exports = { protect, optionalAuth, signToken };
