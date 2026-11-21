import Admin from "../models/admin.model.js";
import Company from "../models/Company.model.js";
import jwt from "jsonwebtoken";
import { config } from 'dotenv';
config();

// Create initial superadmin (already defined in routes)
export const createInitialSuperadmin = async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
    if (existingAdmin) {
      return res.status(400).json({ error: "Admin with this email already exists" });
    }

    // Create new admin
    const admin = new Admin({
      fullName,
      email: email.toLowerCase(), // Store email in lowercase
      password,
    });

    await admin.save();

    // Generate tokens
    const accessToken = jwt.sign(
      { id: admin._id },
      process.env.ADMIN_JWT_SECRET,
      { expiresIn: "1h" }
    );

    const refreshToken = jwt.sign(
      { id: admin._id },
      process.env.ADMIN_JWT_SECRET_REFRESH,
      { expiresIn: "7d" }
    );

    // Set cookies
    res.cookie("admin_access_token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 1000, // 1 hour
    });

    res.cookie("admin_refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(201).json({
      message: "Admin created successfully",
      admin: {
        id: admin._id,
        fullName: admin.fullName,
        email: admin.email,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("Error creating admin:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Admin signup
export const signupAdmin = async (req, res) => {
  try {
    const { fullName, email, password, companyId } = req.body;

    // Validate required fields
    if (!fullName || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
    if (existingAdmin) {
      return res.status(400).json({ error: "Admin with this email already exists" });
    }

    // Create admin with company if provided
    const adminData = {
      fullName,
      email: email.toLowerCase(),
      password,
    };

    if (companyId) {
      // Verify company exists
      const company = await Company.findById(companyId);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      adminData.company = companyId;
    }

    // Create new admin
    const admin = await Admin.create(adminData);

    // If company was provided, update the company to link to this admin
    if (companyId) {
      await Company.findByIdAndUpdate(companyId, { admin: admin._id });
    }

    // Generate tokens
    const accessToken = jwt.sign(
      { id: admin._id },
      process.env.ADMIN_JWT_SECRET,
      { expiresIn: "1d" }
    );

    const refreshToken = jwt.sign(
      { id: admin._id },
      process.env.ADMIN_JWT_SECRET_REFRESH,
      { expiresIn: "7d" }
    );

    // Set cookies
    res.cookie("admin_access_token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 1000, // 1 hour
    });

    res.cookie("admin_refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(201).json({
      message: "Admin created successfully",
      admin: {
        id: admin._id,
        fullName: admin.fullName,
        email: admin.email,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("Error creating admin:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
// Admin login
export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find admin by email (case insensitive)
    const admin = await Admin.findOne({ email: email.toLowerCase() }).select("+password");
    
    if (!admin) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Verify password
    const isPasswordValid = await admin.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate tokens
    const accessToken = jwt.sign(
      { id: admin._id },
      process.env.ADMIN_JWT_SECRET,
      { expiresIn: "1d" }
    );

    const refreshToken = jwt.sign(
      { id: admin._id },
      process.env.ADMIN_JWT_SECRET_REFRESH,
      { expiresIn: "7d" }
    );

    // Set cookies
    res.cookie("admin_access_token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 1000, // 1 hour
    });

    res.cookie("admin_refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Remove password from response
    admin.password = undefined;

    return res.status(200).json({
      message: "Login successful",
      admin: {
        id: admin._id,
        fullName: admin.fullName,
        email: admin.email,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("Error logging in admin:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Get admin profile
export const getAdminProfile = async (req, res) => {
  try {
    const admin = await Admin.findById(req.user._id);
    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    return res.status(200).json({
      success: true,
      message: "admin is authenticated",
      admin: {
        id: admin._id,
        fullName: admin.fullName,
        email: admin.email,
        company: admin.company,
      }
    });
  } catch (error) {
    console.error("Error getting admin profile:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Refresh admin token
export const refreshAdminToken = async (req, res) => {
  try {
    const admin = req.user;

    // Generate new access token
    const accessToken = jwt.sign(
      { id: admin._id },
      process.env.ADMIN_JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Set new access token cookie
    res.cookie("admin_access_token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 1000, // 1 hour
    });

    return res.status(200).json({
      message: "Token refreshed successfully",
      accessToken,
    });
  } catch (error) {
    console.error("Error refreshing token:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Get all admins
export const getAllAdmins = async (req, res) => {
  try {
    const admins = await Admin.find().select('-password');
    return res.status(200).json({ admins });
  } catch (error) {
    console.error("Error getting all admins:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Get admin by ID
export const getAdminById = async (req, res) => {
  try {
    const { id } = req.params;
    const admin = await Admin.findById(id).select('-password');
    
    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }
    
    return res.status(200).json({ admin });
  } catch (error) {
    console.error("Error getting admin by ID:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Get admin dashboard stats
export const getAdminDashboardStats = async (req, res) => {
  try {
    // Implement dashboard statistics logic here
    // This could include counts of users, tasks, or other relevant metrics
    
    return res.status(200).json({
      stats: {
        // Example stats
        totalUsers: 0,
        totalTasks: 0,
        completedTasks: 0,
        pendingTasks: 0,
      }
    });
  } catch (error) {
    console.error("Error getting dashboard stats:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
// Add this new function to admin.controller.js
export const linkAdminToCompany = async (req, res) => {
  try {
    const { adminId, companyId } = req.body;

    // Validate required fields
    if (!adminId || !companyId) {
      return res.status(400).json({ error: "Admin ID and Company ID are required" });
    }

    // Check if admin exists
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    // Check if company exists
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    // Update admin with company
    admin.company = companyId;
    await admin.save();

    // Update company with admin
    company.admin = adminId;
    await company.save();

    return res.status(200).json({
      message: "Admin linked to company successfully",
      admin: {
        id: admin._id,
        fullName: admin.fullName,
        email: admin.email,
        company: admin.company
      },
      company: {
        id: company._id,
        name: company.name,
        nature: company.nature,
        admin: company.admin
      }
    });
  } catch (error) {
    console.error("Error linking admin to company:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};