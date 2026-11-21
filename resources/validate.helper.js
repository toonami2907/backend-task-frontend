import { body, validationResult } from "express-validator";

export const validateSignup = [
  body("firstName")
    .trim()
    .notEmpty()
    .withMessage("First name is required")
    .isLength({ min: 1, max: 50 })
    .withMessage("First name must be 1-50 characters"),
  body("lastName")
    .trim()
    .notEmpty()
    .withMessage("Last name is required")
    .isLength({ min: 1, max: 50 })
    .withMessage("Last name must be 1-50 characters"),
  body("email")
    .trim()
    .isEmail()
    .withMessage("Invalid email address")
    .matches(/^\S+@\S+\.\S+$/)
    .withMessage("Please enter a valid email address")
    .normalizeEmail(),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),
  body("National_ID")
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage("National ID must be at least 1 character"),
  body("passportNumber")
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage("Passport number must be at least 1 character"),
  body("terms")
    .equals("on")
    .withMessage("You must agree to the terms"),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array().map((err) => err.msg) });
    }
    next();
  },
];

export const validateLogin = [
  body("email")
    .trim()
    .isEmail()
    .withMessage("Invalid email address")
    .matches(/^\S+@\S+\.\S+$/)
    .withMessage("Invalid email address")
    .normalizeEmail(),
  body("password").notEmpty().withMessage("Password is required"),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array().map((err) => err.msg) });
    }
    next();
  },
];