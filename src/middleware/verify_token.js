import jwt from "jsonwebtoken";
import  User  from "../models/user.model.js";
import bcrypt from "bcryptjs";
import Staff from '../models/staff.model.js';
import { CatchAsync } from "./CatchAsync.js";
import { EmgenerateAccessToken, EmgenerateRefreshToken } from "../../resources/employee.sign.js";

const SECRET_ACCESS_KEY = process.env.EMPLOYEE_JWT_SECRET || "access_secret";
const SECRET_REFRESH_KEY = process.env.EMPLOYEE_JWT_SECRET_REFRESH || "refresh_secret";
const verifyJWT = (token, secret) => jwt.verify(token, secret);




export const verify_token = CatchAsync(async (req, res, next) => {
  let token =
    req.cookies.accessToken ||
    (req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
      ? req.headers.authorization.split(" ")[1]
      : null);

  let refreshToken =
    req.cookies.refreshToken ||
    (req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
      ? req.headers.authorization.split(" ")[1]
      : null);

  if (!token) {
    if (refreshToken) {
      return handleRefreshToken(req, res, next);
    }
    // console.log("---------------------cookies",req.cookies)
    return res
      .status(403)
      .json({ error: "Unauthorized, please sign in" });
  }

  try {
    const decoded = verifyJWT(token, SECRET_ACCESS_KEY);
    const user = await Staff.findById(decoded.id);

    if (user) {
      if (user.isDeleted || user.status === 'deleted') {
        return res
          .status(403)
          .json({ error: "Account deleted. Contact your company admin." });
      }
      const emailVerified = user.emailVerified !== false;
      if (!emailVerified || user.status === 'invited') {
        return res
          .status(403)
          .json({ error: "Account not activated. Check your invite email." });
      }
      req.user = user;
      return next();
    } else {
      return res
        .status(403)
        .json({ error: "User not found, please login again" });
    }
  } catch (err) {
    if (
      (err.name === "TokenExpiredError" ||
        err.name === "JsonWebTokenError") &&
      refreshToken
    ) {
      return handleRefreshToken(req, res, next);
    }
    return res
      .status(401)
      .json({ error: "Invalid token provided, please login again" });
  }
});

const handleRefreshToken = async (req, res, next) => {
  let refreshToken =
    req.cookies.refreshToken || // Changed from refresh_token to match what you set
    (req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
      ? req.headers.authorization.split(" ")[1]
      : null);

  if (!refreshToken) {
    return res
      .status(403)
      .json({ error: "Unauthorized, please sign in" });
  }

  try {
    const decodedRefreshToken = verifyJWT(
      refreshToken,
      SECRET_REFRESH_KEY
    );
    const user = await Staff.findById(decodedRefreshToken.id);

    if (!user) {
      return res
        .status(403)
        .json({ error: "User not found, please login again" });
    }
    if (user.isDeleted || user.status === 'deleted') {
      return res.status(403).json({ error: "Account deleted. Contact your company admin." });
    }
    const emailVerified = user.emailVerified !== false;
    if (!emailVerified || user.status === 'invited') {
      return res.status(403).json({ error: "Account not activated. Check your invite email." });
    }
    if (!user.refreshToken) {
      return res.status(401).json({ error: "No stored refresh token" });
    }

    const isRefreshTokenValid = await bcrypt.compare(
      refreshToken,
      user.refreshToken
    );

    if (!isRefreshTokenValid) {
      return res.status(401).json({ error: "Invalid refresh token, please login again" });
    }

    const newAccessToken = EmgenerateAccessToken({
      id: user._id,
      email: user.email
    });
    const newRefreshToken = EmgenerateRefreshToken({
      id: user._id,
      email: user.email
    });

    user.refreshToken = await bcrypt.hash(newRefreshToken, 10);
    await user.save();

    res.cookie("accessToken", newAccessToken, {
      httpOnly: true,
      sameSite: "None",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      sameSite: "None",
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    req.user = user;
    next();
  } catch (err) {
    console.error("Refresh token verification failed:", err.message);
    return res
      .status(401)
      .json({ error: "Invalid refresh token, please login again" });
  }
};
