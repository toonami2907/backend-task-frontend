import express from 'express';
import {
  getAllStaff,
  getStaffById,
  createStaff,
  acceptInvite,
  updateStaff,
  deleteStaff,
  getStaffProfile,
  staffLogin,
  StorefcmToken,
  getStaffByCompany,
  getStaffCompanies
} from '../controllers/staff.controller.js';
import { verify_token } from '../middleware/verify_token.js';
import { verify_admin_token } from '../middleware/admin_verify_token.js';
// import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication middleware to all routes
// router.use(authenticateToken);

// Staff routes
router.post("/register", createStaff);
router.post("/accept-invite", acceptInvite);
router.get('/profile', verify_token, getStaffProfile);
router.get('/companies', verify_token, getStaffCompanies);
router.post('/login', staffLogin)
router.post('/update-fcm-token', verify_token, StorefcmToken)

// router.route('/:id')
//   .get(getStaffById)
//   .put(updateStaff)
//   .delete(deleteStaff);

// Get staff by company
router.get('/company/:companyId', verify_admin_token, getStaffByCompany);

export default router;
