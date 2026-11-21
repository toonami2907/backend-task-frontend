import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from 'dotenv';
config();

const adminSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      minlength: [2, "Full name must be at least 2 characters"],
      maxlength: [100, "Full name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // Don't return password in queries by default
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
    },
    companies: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: []
    }]
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
adminSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT token
adminSchema.methods.generateAuthToken = function () {
  return jwt.sign(
    { id: this._id },
    process.env.ADMIN_JWT_SECRET,
    {
      expiresIn: "1d",
    }
  );
};
adminSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    { id: this._id },
    process.env.ADMIN_JWT_SECRET_REFRESH,
    {
      expiresIn: "7d",
    }
  );
};

const Admin = mongoose.model("Admin", adminSchema);

export default Admin;
