import express from "express";
import { 
  createEmployee, 
  getAllEmployees, 
  getEmployeeById, 
  updateEmployee, 
  deleteEmployee,
  getEmployeesByCompany,
  addEmployeeToTeam,
  removeEmployeeFromTeam
} from "../controllers/employee.controller.js";
import { verify_admin_token } from "../middleware/admin_verify_token.js";

const router = express.Router();

// Apply admin authentication middleware to all employee routes
router.use(verify_admin_token);

// Employee CRUD routes
router.post("/", createEmployee);
router.get("/", getAllEmployees);
router.get("/:id", getEmployeeById);
router.put("/:id", updateEmployee);
router.delete("/:id", deleteEmployee);

// Team management routes
router.post("/:id/teams", addEmployeeToTeam);
router.delete("/:id/teams/:teamId", removeEmployeeFromTeam);
// Add this to your existing company routes
router.get("/:companyId/employees", getEmployeesByCompany);


export default router;