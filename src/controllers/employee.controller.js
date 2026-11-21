import Employee from "../models/employee.model.js";
import Company from "../models/Company.model.js";
import Job from "../models/job.model.js";
import Team from "../models/team.model.js";
import { CatchAsync } from "../middleware/CatchAsync.js";
import { sendNotificationToStaff } from "../../services/notification.service.js";
import Staff from "../models/staff.model.js";
import Role from "../models/role.model.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendEmail } from "../../services/email/email.js";
import { PERMISSIONS } from "../constants/permissions.js";
import { ensureCompanyPermission } from "../services/rbac/dashboard-rbac.service.js";

const workerRoleQuery = {
  $or: [{ target: "worker" }, { target: { $exists: false } }]
};
const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Create a new employee
 * @route POST /api/employees
 * @access Admin with employees.manage
 */
export const createEmployee = CatchAsync(async (req, res) => {
  const { fullName, email, companyId, position, teams, roleId } = req.body;
  const adminId = req.user?._id;

  if (!fullName || !email || !companyId || !position) {
    return res.status(400).json({
      error: "Full name, email, company ID, and position are required"
    });
  }

  const access = await ensureCompanyPermission({
    adminId,
    companyId,
    permission: PERMISSIONS.EMPLOYEES_MANAGE
  });
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  const normalizedEmail = email.toLowerCase();
  const company = await Company.findById(companyId);
  if (!company) {
    return res.status(404).json({ error: "Company not found" });
  }

  const existingEmployee = await Employee.findOne({
    email: normalizedEmail,
    company: companyId
  });
  if (existingEmployee && !existingEmployee.isDeleted) {
    return res.status(409).json({ error: "An employee with this email already exists in this company" });
  }

  let staff = await Staff.findOne({ email: normalizedEmail });
  let tempPassword = null;

  if (!staff) {
    tempPassword = crypto.randomBytes(6).toString("base64url");
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    staff = await Staff.create({
      fullName,
      email: normalizedEmail,
      password: hashedPassword,
      status: "invited",
      emailVerified: false
    });
  } else if (staff.isDeleted || staff.status === "deleted") {
    staff.status = "invited";
    staff.isDeleted = false;
    staff.deletedAt = null;
    await staff.save();
  }

  let role = null;
  if (roleId) {
    const roleDoc = await Role.findOne({ _id: roleId, company: companyId, ...workerRoleQuery });
    if (!roleDoc) {
      return res.status(404).json({ error: "Worker role not found for this company" });
    }
    role = roleDoc._id;
  } else {
    const defaultRole = await Role.findOne({
      company: companyId,
      name: "Supervisor",
      ...workerRoleQuery
    });
    role = defaultRole ? defaultRole._id : null;
  }

  const inviteToken = crypto.randomBytes(32).toString("hex");
  const inviteTokenHash = crypto.createHash("sha256").update(inviteToken).digest("hex");
  const inviteExpiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

  let employee;
  if (existingEmployee && existingEmployee.isDeleted) {
    existingEmployee.fullName = fullName;
    existingEmployee.position = position;
    existingEmployee.teams = teams || [];
    existingEmployee.staff = staff._id;
    existingEmployee.role = role;
    existingEmployee.isDeleted = false;
    existingEmployee.deletedAt = null;
    existingEmployee.deletedBy = null;
    existingEmployee.status = "invited";
    existingEmployee.inviteToken = inviteTokenHash;
    existingEmployee.inviteExpiresAt = inviteExpiresAt;
    employee = await existingEmployee.save();
  } else {
    employee = await Employee.create({
      fullName,
      email: normalizedEmail,
      staff: staff._id,
      company: companyId,
      position,
      teams: teams || [],
      role,
      status: "invited",
      inviteToken: inviteTokenHash,
      inviteExpiresAt
    });
  }

  await Company.findByIdAndUpdate(companyId, { $addToSet: { employees: employee._id } });

  await sendNotificationToStaff(staff._id, {
    title: "Employee Profile Created",
    message: `Your employee profile has been created for ${company.name} company`,
    type: "success",
    data: {
      employeeId: employee._id,
      companyId: company._id,
      url: "/employee/profile"
    }
  });

  const appUrl = process.env.STAFF_APP_URL || process.env.FRONTEND_URL || "http://localhost:5173";
  const inviteUrl = `${appUrl}/accept-invite?token=${inviteToken}&companyId=${company._id}`;
  const inviteMessage = [
    `You have been invited to join ${company.name}.`,
    "",
    `Invite link: ${inviteUrl}`,
    tempPassword ? `Temporary password: ${tempPassword}` : "",
    "",
    "This invite expires in 48 hours."
  ]
    .filter(Boolean)
    .join("\n");

  await sendEmail({
    email: normalizedEmail,
    subject: `You're invited to ${company.name}`,
    message: inviteMessage
  });

  return res.status(201).json({
    message: "Employee created successfully",
    employee: {
      id: employee._id,
      fullName: employee.fullName,
      email: employee.email,
      company: employee.company,
      position: employee.position,
      teams: employee.teams,
      role: employee.role,
      status: employee.status,
      createdAt: employee.createdAt
    }
  });
});

/**
 * Get all employees in a company
 * @route GET /api/employees?companyId=...
 * @access Admin with employees.manage
 */
export const getAllEmployees = CatchAsync(async (req, res) => {
  const { companyId } = req.query;
  const adminId = req.user?._id;

  if (!companyId) {
    return res.status(400).json({ error: "companyId query parameter is required" });
  }

  const access = await ensureCompanyPermission({
    adminId,
    companyId,
    permission: PERMISSIONS.EMPLOYEES_MANAGE
  });
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  const employees = await Employee.find({ company: companyId })
    .populate("company", "name")
    .populate("teams", "name")
    .sort({ createdAt: -1 });

  return res.status(200).json({
    count: employees.length,
    employees: employees.map((employee) => ({
      id: employee._id,
      fullName: employee.fullName,
      email: employee.email,
      company: employee.company,
      position: employee.position,
      teams: employee.teams,
      role: employee.role,
      status: employee.status,
      isDeleted: employee.isDeleted,
      createdAt: employee.createdAt
    }))
  });
});

/**
 * Get employee by ID
 * @route GET /api/employees/:id
 * @access Admin with employees.manage
 */
export const getEmployeeById = CatchAsync(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user?._id;

  const employee = await Employee.findById(id).populate("company", "name").populate("teams", "name");
  if (!employee) {
    return res.status(404).json({ error: "Employee not found" });
  }

  const access = await ensureCompanyPermission({
    adminId,
    companyId: employee.company,
    permission: PERMISSIONS.EMPLOYEES_MANAGE
  });
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  return res.status(200).json({
    employee: {
      id: employee._id,
      fullName: employee.fullName,
      email: employee.email,
      company: employee.company,
      position: employee.position,
      teams: employee.teams,
      role: employee.role,
      status: employee.status,
      isDeleted: employee.isDeleted,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt
    }
  });
});

/**
 * Update employee
 * @route PUT /api/employees/:id
 * @access Admin with employees.manage
 */
export const updateEmployee = CatchAsync(async (req, res) => {
  const { id } = req.params;
  const { fullName, email, position, teams, roleId } = req.body;
  const adminId = req.user?._id;

  if (!fullName && !email && !position && !teams && !roleId) {
    return res.status(400).json({
      error: "At least one field (fullName, email, position, teams, or role) is required for update"
    });
  }

  const employee = await Employee.findById(id);
  if (!employee) {
    return res.status(404).json({ error: "Employee not found" });
  }

  const access = await ensureCompanyPermission({
    adminId,
    companyId: employee.company,
    permission: PERMISSIONS.EMPLOYEES_MANAGE
  });
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  if (email && email.toLowerCase() !== employee.email) {
    const existingEmployee = await Employee.findOne({
      _id: { $ne: id },
      company: employee.company,
      email: { $regex: new RegExp(`^${escapeRegex(email)}$`, "i") }
    });
    if (existingEmployee) {
      return res.status(409).json({ error: "An employee with this email already exists" });
    }
  }

  if (position && position !== employee.position) {
    const positionTaken = await Employee.findOne({
      _id: { $ne: id },
      company: employee.company,
      position
    });
    if (positionTaken) {
      return res.status(409).json({ error: "This position is already taken in the company" });
    }
  }

  if (roleId) {
    const roleDoc = await Role.findOne({
      _id: roleId,
      company: employee.company,
      ...workerRoleQuery
    });
    if (!roleDoc) {
      return res.status(404).json({ error: "Worker role not found for this company" });
    }
  }

  const updatedEmployee = await Employee.findByIdAndUpdate(
    id,
    {
      ...(fullName && { fullName }),
      ...(email && { email: email.toLowerCase() }),
      ...(position && { position }),
      ...(teams && { teams }),
      ...(roleId && { role: roleId })
    },
    { new: true }
  )
    .populate("company", "name")
    .populate("teams", "name");

  return res.status(200).json({
    message: "Employee updated successfully",
    employee: {
      id: updatedEmployee._id,
      fullName: updatedEmployee.fullName,
      email: updatedEmployee.email,
      company: updatedEmployee.company,
      position: updatedEmployee.position,
      teams: updatedEmployee.teams,
      role: updatedEmployee.role,
      status: updatedEmployee.status,
      isDeleted: updatedEmployee.isDeleted,
      updatedAt: updatedEmployee.updatedAt
    }
  });
});

/**
 * Delete employee (soft delete)
 * @route DELETE /api/employees/:id
 * @access Admin with employees.manage
 */
export const deleteEmployee = CatchAsync(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user?._id;

  const employee = await Employee.findById(id);
  if (!employee) {
    return res.status(404).json({ error: "Employee not found" });
  }

  const access = await ensureCompanyPermission({
    adminId,
    companyId: employee.company,
    permission: PERMISSIONS.EMPLOYEES_MANAGE
  });
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  const company = await Company.findById(employee.company);
  if (!company) {
    return res.status(404).json({ error: "Company not found" });
  }

  employee.isDeleted = true;
  employee.status = "deleted";
  employee.deletedAt = new Date();
  employee.deletedBy = adminId || null;
  await employee.save();

  await Company.findByIdAndUpdate(company._id, { $pull: { employees: employee._id } });
  await Team.updateMany({ employees: employee._id }, { $pull: { employees: employee._id } });
  await Job.updateMany(
    {},
    {
      $pull: {
        assignedEmployees: employee._id,
        "tasks.$[].resources.employees": employee._id
      }
    }
  );

  const staffMember = await Staff.findOne({ email: employee.email.toLowerCase() });
  if (staffMember) {
    await sendNotificationToStaff(staffMember._id, {
      title: "Employee Profile Removed from company",
      message: `Your employee profile has been removed from ${company.name} company space`,
      type: "success",
      data: {
        employeeId: employee._id,
        companyId: company._id,
        url: "/employee/profile"
      }
    });

    const activeMemberships = await Employee.countDocuments({
      staff: staffMember._id,
      isDeleted: false,
      status: "active"
    });
    if (activeMemberships === 0) {
      staffMember.status = "deleted";
      staffMember.isDeleted = true;
      staffMember.deletedAt = new Date();
      await staffMember.save();
    }
  }

  return res.status(200).json({
    message: "Employee deleted successfully",
    id
  });
});

/**
 * Get employees by company
 * @route GET /api/companies/:companyId/employees
 * @access Admin with employees.manage
 */
export const getEmployeesByCompany = CatchAsync(async (req, res) => {
  const { companyId } = req.params;
  const adminId = req.user._id;

  const access = await ensureCompanyPermission({
    adminId,
    companyId,
    permission: PERMISSIONS.EMPLOYEES_MANAGE
  });
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  const employees = await Employee.find({ company: companyId }).populate("teams", "name").sort({ createdAt: -1 });

  return res.status(200).json({
    count: employees.length,
    employees: employees.map((employee) => ({
      id: employee._id,
      fullName: employee.fullName,
      email: employee.email,
      position: employee.position,
      teams: employee.teams,
      role: employee.role,
      status: employee.status,
      isDeleted: employee.isDeleted,
      createdAt: employee.createdAt
    }))
  });
});

/**
 * Add employee to team
 * @route POST /api/employees/:id/teams
 * @access Admin with teams.manage
 */
export const addEmployeeToTeam = CatchAsync(async (req, res) => {
  const { id } = req.params;
  const { teamId } = req.body;
  const adminId = req.user?._id;

  if (!teamId) {
    return res.status(400).json({ error: "Team ID is required" });
  }

  const employee = await Employee.findById(id);
  if (!employee) {
    return res.status(404).json({ error: "Employee not found" });
  }

  const access = await ensureCompanyPermission({
    adminId,
    companyId: employee.company,
    permission: PERMISSIONS.TEAMS_MANAGE
  });
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  if (employee.teams.includes(teamId)) {
    return res.status(409).json({ error: "Employee is already in this team" });
  }

  employee.teams.push(teamId);
  await employee.save();

  return res.status(200).json({
    message: "Employee added to team successfully",
    employee: {
      id: employee._id,
      fullName: employee.fullName,
      teams: employee.teams
    }
  });
});

/**
 * Remove employee from team
 * @route DELETE /api/employees/:id/teams/:teamId
 * @access Admin with teams.manage
 */
export const removeEmployeeFromTeam = CatchAsync(async (req, res) => {
  const { id, teamId } = req.params;
  const adminId = req.user?._id;

  const employee = await Employee.findById(id);
  if (!employee) {
    return res.status(404).json({ error: "Employee not found" });
  }

  const access = await ensureCompanyPermission({
    adminId,
    companyId: employee.company,
    permission: PERMISSIONS.TEAMS_MANAGE
  });
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  if (!employee.teams.includes(teamId)) {
    return res.status(404).json({ error: "Employee is not in this team" });
  }

  employee.teams = employee.teams.filter((team) => team.toString() !== teamId);
  await employee.save();

  return res.status(200).json({
    message: "Employee removed from team successfully",
    employee: {
      id: employee._id,
      fullName: employee.fullName,
      teams: employee.teams
    }
  });
});
