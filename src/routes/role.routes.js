import { Router } from 'express';
import { verify_admin_token } from '../middleware/admin_verify_token.js';
import {
  createRole,
  getRolesByCompany,
  updateRole,
  deleteRole
} from '../controllers/role.controller.js';

const router = Router();

router.post('/', verify_admin_token, createRole);
router.get('/company/:companyId', verify_admin_token, getRolesByCompany);
router.put('/:id', verify_admin_token, updateRole);
router.delete('/:id', verify_admin_token, deleteRole);

export default router;
