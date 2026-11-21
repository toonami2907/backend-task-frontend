import jwt from "jsonwebtoken";
import Admin from "../models/admin.model.js";
import {config} from 'dotenv'
config()

const verifyJWT = (token, secret) => {
  if (!token || typeof token !== 'string' || token.trim() === '') {
    throw new Error('Invalid token format');
  }
  return jwt.verify(token, secret);
};

export const verify_admin_token = async (req, res, next) => {
  let token = req.cookies.admin_access_token || 
    (req.headers.authorization?.startsWith("Bearer") 
      ? req.headers.authorization.split(" ")[1] 
      : null);

  let refreshToken = req.cookies.admin_refresh_token || 
    (req.headers.authorization?.startsWith("Bearer") 
      ? req.headers.authorization.split(" ")[1] 
      : null);

  // console.log('------------------Token check:', token ? 'Token present' : 'Token missing');

  if (!token) {
    if (refreshToken) {
      return handleAdminRefreshToken(req, res, next);
    }
    return res.status(403).json({ error: "Admin authorization required" });
  }

  try {
    const decoded = verifyJWT(token, process.env.ADMIN_JWT_SECRET);
    // console.log('Decoded token:', decoded);
    // console.log(' token:', token);
    const admin = await Admin.findById(decoded.id);
    if (!admin) {
      return res.status(403).json({ error: "Invalid admin account" });
    }

    req.user = admin;
    return next();
  } catch (err) {
    console.log('Access token verification error:', err.name, err.message);
    
    if ((err.name === "TokenExpiredError" || err.name === "JsonWebTokenError") && refreshToken) {
      return handleAdminRefreshToken(req, res, next);
    }
    
    return res.status(401).json({ 
      error: "Invalid admin token", 
      details: process.env.NODE_ENV === 'development' ? err.message : undefined 
    });
  }
};

const handleAdminRefreshToken = async (req, res, next) => {
  let refreshToken = req.cookies.admin_refresh_token || 
    (req.headers.authorization?.startsWith("Bearer") 
      ? req.headers.authorization.split(" ")[1] 
      : null);

  console.log('------------------Refresh token check:', refreshToken ? 'Refresh token present' : 'Refresh token missing');

  if (!refreshToken) {
    return res.status(403).json({ error: "Admin authorization required" });
  }

  try {
    // Validate refresh token format before verification
    if (typeof refreshToken !== 'string' || refreshToken.trim() === '') {
      return res.status(401).json({ error: "Invalid refresh token format" });
    }
    
    const decodedRefreshToken = verifyJWT(refreshToken, process.env.ADMIN_JWT_SECRET_REFRESH);
    const admin = await Admin.findById(decodedRefreshToken.id);

    if (!admin) {
      return res.status(403).json({ error: "Invalid admin account" });
    }

    const newAccessToken = admin.generateAuthToken();
    const newRefreshToken = admin.generateRefreshToken();
    
    res.cookie("admin_access_token", newAccessToken, {
      httpOnly: true,
      sameSite: "None",
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000
    });

    res.cookie("admin_refresh_token", newRefreshToken, {
      httpOnly: true,
      sameSite: "None",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    req.user = admin;
    next();
  } catch (err) {
    console.log('Refresh token error:', err.name, err.message);
    return res.status(401).json({ 
      error: "Invalid admin refresh token", 
      details: process.env.NODE_ENV === 'development' ? err.message : undefined 
    });
  }
};
