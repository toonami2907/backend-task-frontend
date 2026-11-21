import express from "express";
import { 
  createCompany, 
  getAllCompanies, 
  getCompanyById, 
  updateCompany, 
  deleteCompany,
  addTeamToCompany,
  removeTeamFromCompany
} from "../controllers/company.controller.js";
import { verify_admin_token } from "../middleware/admin_verify_token.js";
import { getEmployeesByCompany } from "../controllers/employee.controller.js";
import { getTeamsByCompany } from '../controllers/team.controller.js';
import { getJobsByCompany } from '../controllers/job.controller.js';
import { PERMISSIONS } from "../constants/permissions.js";
import { requireCompanyPermission } from "../middleware/company_permission.middleware.js";

const router = express.Router();

// Apply admin authentication middleware to all company routes
router.use(verify_admin_token);

// Company CRUD routes
router.post("/", createCompany);
router.get("/", getAllCompanies);
router.get("/:id", getCompanyById);
router.put("/:id", updateCompany);
router.delete("/:id", deleteCompany);

// Team management routes
router.post("/:id/teams", addTeamToCompany);
router.delete("/:id/teams/:teamId", removeTeamFromCompany);
// Add this to your existing company routes
router.get(
  "/:companyId/employees",
  requireCompanyPermission({
    permission: PERMISSIONS.EMPLOYEES_MANAGE,
    resolveCompanyId: (req) => req.params?.companyId
  }),
  getEmployeesByCompany
);
router.get(
  '/:companyId/teams',
  requireCompanyPermission({
    permission: PERMISSIONS.TEAMS_MANAGE,
    resolveCompanyId: (req) => req.params?.companyId
  }),
  getTeamsByCompany
);
router.get(
  '/:companyId/jobs',
  requireCompanyPermission({
    permission: PERMISSIONS.JOBS_MANAGE,
    resolveCompanyId: (req) => req.params?.companyId
  }),
  getJobsByCompany
);


export default router;
