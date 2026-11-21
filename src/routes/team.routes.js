import express from 'express';
import { 
  createTeam, 
  getAllTeams, 
  getTeamById, 
  updateTeam, 
  deleteTeam, 
  getTeamsByCompany,
  addEmployeeToTeam,
  removeEmployeeFromTeam
} from '../controllers/team.controller.js';
import { verify_admin_token } from '../middleware/admin_verify_token.js';
import { PERMISSIONS } from '../constants/permissions.js';
import {
  requireCompanyPermission,
  requireTeamPermission
} from '../middleware/company_permission.middleware.js';

const router = express.Router();

// Team routes
router.post(
  '/',
  verify_admin_token,
  requireCompanyPermission({
    permission: PERMISSIONS.TEAMS_MANAGE,
    resolveCompanyId: (req) => req.body?.companyId
  }),
  createTeam
);
router.get(
  '/',
  verify_admin_token,
  requireCompanyPermission({
    permission: PERMISSIONS.TEAMS_MANAGE,
    resolveCompanyId: (req) => req.query?.companyId
  }),
  getAllTeams
);
router.get(
  '/:id',
  verify_admin_token,
  requireTeamPermission({
    permission: PERMISSIONS.TEAMS_MANAGE,
    resolveTeamId: (req) => req.params?.id
  }),
  getTeamById
);
router.put(
  '/:id',
  verify_admin_token,
  requireTeamPermission({
    permission: PERMISSIONS.TEAMS_MANAGE,
    resolveTeamId: (req) => req.params?.id
  }),
  updateTeam
);
router.delete(
  '/:id',
  verify_admin_token,
  requireTeamPermission({
    permission: PERMISSIONS.TEAMS_MANAGE,
    resolveTeamId: (req) => req.params?.id
  }),
  deleteTeam
);

// Team employee management
router.post(
  '/:id/employees',
  verify_admin_token,
  requireTeamPermission({
    permission: PERMISSIONS.TEAMS_MANAGE,
    resolveTeamId: (req) => req.params?.id
  }),
  addEmployeeToTeam
);
router.delete(
  '/:id/employees/:employeeId',
  verify_admin_token,
  requireTeamPermission({
    permission: PERMISSIONS.TEAMS_MANAGE,
    resolveTeamId: (req) => req.params?.id
  }),
  removeEmployeeFromTeam
);

export default router;
