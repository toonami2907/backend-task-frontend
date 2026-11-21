import Staff from '../models/staff.model.js';
import { sendWelcomeEmail } from '../../services/email/email.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { CatchAsync } from '../middleware/CatchAsync.js';
import { EmgenerateAccessToken, EmgenerateRefreshToken } from '../../resources/employee.sign.js';
import Company from '../models/Company.model.js';
import Employee from '../models/employee.model.js';

// Get all staff members
export const getAllStaff = async (req, res) => {
  try {
    const staff = await Staff.find()
      .populate('company', 'name')
      .populate('teams', 'name');
    
    res.status(200).json({
      success: true,
      count: staff.length,
      data: staff
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch staff members',
      error: error.message
    });
  }
};

// Get staff by ID
export const getStaffById = async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id)
      .populate('company', 'name')
      .populate('teams', 'name');
    
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: staff
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch staff member',
      error: error.message
    });
  }
};

// Create new staff member
export const createStaff = CatchAsync(async (req, res) => {
  return res.status(403).json({
    success: false,
    message: 'Invite required. Please ask your company admin to invite you.'
  });
});

export const acceptInvite = CatchAsync(async (req, res) => {
  const { token, companyId, password } = req.body;

  if (!token || !companyId) {
    return res.status(400).json({ error: 'Invite token and company ID are required' });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const employee = await Employee.findOne({
    company: companyId,
    inviteToken: tokenHash,
    inviteExpiresAt: { $gt: new Date() },
    status: 'invited',
    isDeleted: false
  });

  if (!employee) {
    return res.status(400).json({ error: 'Invalid or expired invite token' });
  }

  const staff = await Staff.findById(employee.staff);
  if (!staff) {
    return res.status(404).json({ error: 'Staff account not found' });
  }

  const needsPassword = !staff.emailVerified || staff.status !== 'active';
  if (needsPassword && !password) {
    return res.status(400).json({ error: 'Password is required to activate this account' });
  }

  if (password) {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    staff.password = hashedPassword;
  }

  staff.status = 'active';
  staff.emailVerified = true;
  staff.isDeleted = false;
  staff.deletedAt = null;
  await staff.save();

  employee.status = 'active';
  employee.inviteToken = null;
  employee.inviteExpiresAt = null;
  await employee.save();

  return res.status(200).json({
    success: true,
    message: 'Invite accepted successfully'
  });
});

export const staffLogin = CatchAsync(async (req, res) => {
    try {
      const { email, password } = req.body;
      const lowerCaseEmail = email.toLowerCase();
      
      // Check if user exists
      const user = await Staff.findOne({ email: lowerCaseEmail });
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }
  
      // Check deleted/blocked/invited status
      if (user.isDeleted || user.status === 'deleted') {
        return res.status(403).json({
          success: false,
          message: 'Your account has been deleted. Contact your company admin.'
        });
      }
      const emailVerified = user.emailVerified !== false;
      if (!emailVerified || user.status === 'invited') {
        return res.status(403).json({
          success: false,
          message: 'Your account is not activated. Please check your invite email.'
        });
      }

      // Check if account is blocked
      if (user.blockedUntil && user.blockedUntil > new Date()) {
        return res.status(429).json({
          success: false,
          message: `Account is temporarily blocked. Try again after ${new Date(user.blockedUntil).toLocaleString()}`
        });
      }
  
      // Check if password is correct
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        // Increment login attempts
        user.loginAttempts = (user.loginAttempts || 0) + 1;
        
        // Block account after 5 failed attempts
        if (user.loginAttempts >= 5) {
          const blockDuration = 15 * 60 * 1000; // 15 minutes
          user.blockedUntil = new Date(Date.now() + blockDuration);
        }
        
        await user.save();
        
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }
  
      // Ensure staff has at least one active company membership
      const activeMemberships = await Employee.countDocuments({
        staff: user._id,
        isDeleted: false,
        status: { $ne: 'deleted' }
      });
      if (activeMemberships === 0) {
        return res.status(403).json({
          success: false,
          message: 'Your account has no active company membership.'
        });
      }

      // Reset login attempts on successful login
      user.loginAttempts = 0;
      user.blockedUntil = null;
  
      // Generate tokens
      const accessToken = EmgenerateAccessToken({ 
        id: user._id, 
        email: user.email
      });
      
      const refreshToken = EmgenerateRefreshToken({ 
        id: user._id, 
        email: user.email, 
      });
      
      // Hash and store the refresh token
      const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
      user.refreshToken = hashedRefreshToken;
      await user.save();
  
      // Set cookies
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        sameSite: "None",
        secure: process.env.NODE_ENV === "production",
        maxAge: 30 * 24 * 60 * 60 * 1000, 
      });
      
      res.cookie('accessToken', accessToken, {
        httpOnly: true,
        sameSite: "None",
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000, 
      }).json({
        success: true,
        message: 'Login successful',
        data: {
          staff: {
            id: user._id,
            fullName: user.fullName,
            email: user.email,
          },
          accessToken,
          refreshToken
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Login failed',
        error: error.message
      });
    }
  });

  export const staffLogout = CatchAsync(async (req, res) => {
    try {
      const { id } = req.user;
      
      // Find the staff member
      const staff = await Staff.findById(id);
      if (!staff) {
        return res.status(404).json({
          success: false,
          message: 'Staff member not found'
        });
      }
      
      // Clear the refresh token
      staff.refreshToken = null;
      await staff.save();
      
      // Clear cookies
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');
      
      res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Logout failed',
        error: error.message
      });
    }
  });
  
  

// Update staff member
export const updateStaff = async (req, res) => {
  try {
    const { fullName, email, companyId, teamIds } = req.body;
    
    // Check if company exists if provided
    if (companyId) {
      const company = await Company.findById(companyId);
      if (!company) {
        return res.status(404).json({
          success: false,
          message: 'Company not found'
        });
      }
    }
    
    // Check if email already exists for another staff member
    if (email) {
      const existingStaff = await Staff.findOne({ 
        email, 
        _id: { $ne: req.params.id } 
      });
      
      if (existingStaff) {
        return res.status(400).json({
          success: false,
          message: 'Another staff member with this email already exists'
        });
      }
    }
    
    const updatedStaff = await Staff.findByIdAndUpdate(
      req.params.id,
      {
        ...(fullName && { fullName }),
        ...(email && { email }),
        ...(companyId && { company: companyId }),
        ...(teamIds && { teams: teamIds }),
        updatedAt: Date.now()
      },
      { new: true, runValidators: true }
    ).populate('company', 'name').populate('teams', 'name');
    
    if (!updatedStaff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: updatedStaff
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update staff member',
      error: error.message
    });
  }
};

// Delete staff member
export const deleteStaff = async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id);
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
    }

    staff.status = 'deleted';
    staff.isDeleted = true;
    staff.deletedAt = new Date();
    await staff.save();
    
    res.status(200).json({
      success: true,
      message: 'Staff member deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete staff member',
      error: error.message
    });
  }
};

// Get staff members by company
export const getStaffByCompany = async (req, res) => {
  try {
    const { companyId } = req.params;

    const employees = await Employee.find({ company: companyId, isDeleted: false })
      .populate('staff', 'fullName email status');

    res.status(200).json({
      success: true,
      count: employees.length,
      data: employees
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch staff members by company',
      error: error.message
    });
  }
};

export const getStaffProfile = async (req, res) => {
  try {
    const Isstaff = await Staff.findById(req.user._id);
    if (!Isstaff) {
      return res.status(404).json({ error: "Staff not found" });
    }

    return res.status(200).json({
      success: true,
      message: "staff is authenticated",
      admin: {
        id: Isstaff._id,
        fullName: Isstaff.fullName,
        email: Isstaff.email,
      }
    });
  } catch (error) {
    console.error("Error getting admin profile:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
export const StorefcmToken = async (req, res) => {
 const { staffId, fcmToken } = req.body;
 const clientId = req.user?._id || staffId;
 if (!clientId || !fcmToken) {
   return res.status(400).json({ error: 'Invalid request' });
 }
  try {
    await Staff.findByIdAndUpdate(clientId, { fcmToken });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error updating FCM token:', error);
    res.status(500).json({ error: 'Failed to update FCM token' });
  }
};

export const getStaffCompanies = CatchAsync(async (req, res) => {
  const staffId = req.user._id;
  const employees = await Employee.find({ staff: staffId, isDeleted: false })
    .populate('company', 'name nature settings')
    .populate('role', 'name permissions');

  return res.status(200).json({
    success: true,
    companies: employees.map(emp => ({
      employeeId: emp._id,
      company: emp.company,
      role: emp.role,
      status: emp.status,
      position: emp.position
    }))
  });
});
