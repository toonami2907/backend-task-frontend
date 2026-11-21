import { Router } from 'express';
import { verify_admin_token } from '../middleware/admin_verify_token.js';
import {
  grantCompanyAdminAccess,
  listCompanyAdminMembers,
  revokeCompanyAdminAccess,
  updateCompanyAdminAccess
} from '../controllers/company-admin-member.controller.js';

const router = Router();

router.use(verify_admin_token);

router.get('/', listCompanyAdminMembers);
router.post('/', grantCompanyAdminAccess);
router.patch('/:membershipId', updateCompanyAdminAccess);
router.delete('/:membershipId', revokeCompanyAdminAccess);

export default router;
