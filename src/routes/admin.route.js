import {Router} from 'express'
import { verify_admin_token } from '../middleware/admin_verify_token.js'
import { 
  createInitialSuperadmin, 
  signupAdmin,
  getAllAdmins,
  getAdminById, 
  loginAdmin, 
  getAdminProfile, 
  refreshAdminToken, 
  getAdminDashboardStats,
  linkAdminToCompany
} from '../controllers/admin.controller.js'

const ADMINROUTE = Router()

ADMINROUTE.post('/create/super/admin', createInitialSuperadmin)
ADMINROUTE.post('/signup', signupAdmin)
ADMINROUTE.post('/login', loginAdmin)
ADMINROUTE.get('/profile', verify_admin_token, getAdminProfile)
ADMINROUTE.get('/refresh-token', verify_admin_token, refreshAdminToken)
ADMINROUTE.get('/dashboard', verify_admin_token, getAdminDashboardStats)
ADMINROUTE.get('/admins', verify_admin_token, getAllAdmins)
ADMINROUTE.get('/:id/admin', verify_admin_token, getAdminById)
// In your admin routes file
ADMINROUTE.post("/link-company", verify_admin_token, linkAdminToCompany);


export default ADMINROUTE
