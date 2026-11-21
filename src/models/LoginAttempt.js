import mongoose from "mongoose";

const loginAttemptSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    UserAgent: {
      type: String,
      default: "",
    },
    success: {
      type: Boolean,
      required: true,
    },
    ipAddress: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Index for efficient querying of recent attempts
loginAttemptSchema.index({ email: 1, createdAt: -1 });
const LoginAttempt = mongoose.model("LoginAttempt", loginAttemptSchema);
export default LoginAttempt;
// export default mongoose.model("LoginAttempt", loginAttemptSchema);