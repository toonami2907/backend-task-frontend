import rateLimit from "express-rate-limit";
import User from "../models/user.model.js";

export const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 attempts per email
  keyGenerator: (req) => req.body.email || req.ip, // Use email or fallback to IP
  handler: async (req, res) => {
    const { email } = req.body;
    if (email) {
      // Block user for 30 minutes
      const user = await User.findOne({ email });
      if (user) {
        user.blockedUntil = new Date(Date.now() + 30 * 60 * 1000);
        await user.save();
      }
    }
    res.status(429).json({ message: "Too many login attempts. Account blocked for 30 minutes." });
  },
});

// Check if user is blocked
export const checkBlockStatus = async (req, res, next) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  const user = await User.findOne({ email });
  if (user && user.blockedUntil && user.blockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.blockedUntil - new Date()) / 1000 / 60);
    return res.status(429).json({ message: `Account blocked. Try again in ${minutesLeft} minutes.` });
  }

  next();
};