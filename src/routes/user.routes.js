import express from "express";
import {
  validateSignup,
  validateLogin,
} from "../../resources/validate.helper.js";
import {
  SIGNUPUSER,
  LOGINUSER,
  GET_USER_PROFILE,
  UPDATE_USER_PROFILE,
  CHANGE_PASSWORD,
  GET_PROFILE_COMPLETION,
  DELETE_ACCOUNT,
} from "../controllers/user.controller.js";
import {
  checkBlockStatus,
  loginLimiter,
} from "../middleware/ratelimit.js"; // Assuming you have a rate limit middleware
import { verify_token } from "../middleware/verify_token.js";
import { CatchAsync } from "../middleware/CatchAsync.js";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../../resources/sign.js";
import { UserUpload } from "../../resources/user.multer.js";

const _UserRoute = express.Router();

_UserRoute.post("/auth/signup", validateSignup, SIGNUPUSER);
_UserRoute.post(
  "/auth/login",
  validateLogin,
  checkBlockStatus,
  loginLimiter,
  LOGINUSER
);
_UserRoute.get(
  "/auth/isauth",
  verify_token,
  CatchAsync(async (req, res) => {
    res
      .status(200)
      .json({ status: true, message: "User is authenticated" });
  })
);
_UserRoute.post(
  "/auth/logout",
  verify_token,
  CatchAsync(async (req, res) => {
    res.clearCookie("access_token");
    res.clearCookie("refresh_token");
    res
      .status(200)
      .json({
        status: true,
        message: "User logged out successfully",
      });
  })
);

_UserRoute.post("/refresh-token", verify_token, (req, res) => {
  const user = req.user;
  const payload = {
    UserId: user._id,
    email: user.email,
  };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  res.cookie("access_token", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
  return res.status(200).json({
    status: true,
    message: "Token refreshed successfully",
    accessToken,
    refreshToken,
  });
});
_UserRoute.put('/profile', verify_token, UserUpload.single('profilePicture'), UPDATE_USER_PROFILE);
_UserRoute.get('/profile-completion', verify_token, GET_PROFILE_COMPLETION);

// USER PROFILE

_UserRoute.get('/profile', verify_token, GET_USER_PROFILE);

export default _UserRoute;
