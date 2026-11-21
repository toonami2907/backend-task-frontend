import Team from "../models/team.model.js";
import Company from "../models/Company.model.js";
import Employee from "../models/employee.model.js";
import Staff from "../models/staff.model.js";
import { CatchAsync } from "../middleware/CatchAsync.js";
import { sendNotificationToStaff } from '../../services/notification.service.js';

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Create a new team
 * @route POST /api/teams
 * @access Admin only
 */
export const createTeam = CatchAsync(async (req, res) => {
  const { name, companyId, employees } = req.body;

  // Validate required fields
  if (!name || !companyId) {
    return res.status(400).json({
      error: "Team name and company ID are required"
    });
  }

  const company = await Company.findById(companyId);
  if (!company) {
    return res.status(404).json({ error: "Company not found" });
  }

  // Check if team with same name already exists in the company
  const existingTeam = await Team.findOne({
    name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
    company: companyId
  });

  if (existingTeam) {
    return res.status(409).json({ error: "A team with this name already exists in this company" });
  }

  // Create new team
  const team = await Team.create({
    name,
    company: companyId,
    employees: employees || []
  });

  // Add team to company's teams array
  company.teams.push(team._id);
  await company.save();

  // If employees are provided, update their team associations
  if (employees && employees.length > 0) {
    await Employee.updateMany(
      { _id: { $in: employees } },
      { $addToSet: { teams: team._id } }
    );
    
    // Get employee details to find corresponding staff members
    const employeeDetails = await Employee.find({ _id: { $in: employees } }, 'email');
    
    // Send notifications to each employee's corresponding staff member
    for (const employee of employeeDetails) {
      // Find staff member with the same email
      const staffMember = await Staff.findOne({ email: employee.email.toLowerCase() });
      
      if (staffMember) {
        // Send notification to the staff member
        await sendNotificationToStaff(staffMember._id, {
          title: 'Team Assignment',
          message: `You have been added to a new team: ${team.name} in ${company.name} company`,
          type: 'success',
          companyId: company._id,
          data: {
            teamId: team._id,
            url: '/teams'
          }
        });
      }
    }
  }

  return res.status(201).json({
    message: "Team created successfully",
    team: {
      id: team._id,
      name: team.name,
      company: team.company,
      employees: team.employees,
      createdAt: team.createdAt
    }
  });
});

/**
 * Get all teams
 * @route GET /api/teams
 * @access Admin only
 */
export const getAllTeams = CatchAsync(async (req, res) => {
  const { companyId } = req.query;

  if (!companyId) {
    return res.status(400).json({ error: "companyId query parameter is required" });
  }

  const query = { company: companyId };

  const teams = await Team.find(query)
    .populate('company', 'name')
    .populate('employees', 'fullName email position')
    .sort({ createdAt: -1 });

  return res.status(200).json({
    count: teams.length,
    teams: teams.map(team => ({
      id: team._id,
      name: team.name,
      company: team.company,
      employeesCount: team.employees.length,
      employees: team.employees,
      createdAt: team.createdAt
    }))
  });
});

/**
 * Get team by ID
 * @route GET /api/teams/:id
 * @access Admin only
 */
export const getTeamById = CatchAsync(async (req, res) => {
  const { id } = req.params;

  // Find team and verify admin has access to the company
  const team = await Team.findById(id)
    .populate('company', 'name')
    .populate('employees', 'fullName email position');

  if (!team) {
    return res.status(404).json({ error: "Team not found" });
  }

  return res.status(200).json({
    team: {
      id: team._id,
      name: team.name,
      company: team.company,
      employees: team.employees,
      createdAt: team.createdAt,
      updatedAt: team.updatedAt
    }
  });
});

/**
 * Update team
 * @route PUT /api/teams/:id
 * @access Admin only
 */
export const updateTeam = CatchAsync(async (req, res) => {
  const { id } = req.params;
  const { name, employees } = req.body;

  // Validate at least one field to update
  if (!name && !employees) {
    return res.status(400).json({
      error: "At least one field (name or employees) is required for update"
    });
  }

  // Find team
  const team = await Team.findById(id);
  if (!team) {
    return res.status(404).json({ error: "Team not found" });
  }

  const company = await Company.findById(team.company);
  if (!company) {
    return res.status(404).json({ error: "Company not found" });
  }

  // Check if new name already exists in the company
  if (name && name !== team.name) {
    const existingTeam = await Team.findOne({
      _id: { $ne: id },
      name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
      company: team.company
    });

    if (existingTeam) {
      return res.status(409).json({ error: "A team with this name already exists in this company" });
    }
  }

  // Handle employee updates if provided
  if (employees) {
    // Find employees that are being removed from the team
    const removedEmployees = team.employees.filter(
      empId => !employees.includes(empId.toString())
    );

    if (removedEmployees.length > 0) {
      await Employee.updateMany(
        { _id: { $in: removedEmployees } },
        { $pull: { teams: team._id } }
      );
      
      // Get employee details to find corresponding staff members
      const removedEmployeeDetails = await Employee.find({ _id: { $in: removedEmployees } }, 'email');
      
      // Send notifications to removed employees
      for (const employee of removedEmployeeDetails) {
        // Find staff member with the same email
        const staffMember = await Staff.findOne({ email: employee.email.toLowerCase() });
        
        if (staffMember) {
          // Send notification to the staff member
          await sendNotificationToStaff(staffMember._id, {
            title: 'Team Update',
            message: `You have been removed from the team: ${team.name} in ${company.name} company`,
            type: 'info',
            companyId: company._id,
            data: {
              teamId: team._id,
              url: '/teams'
            }
          });
        }
      }
    }

    // Find employees that are being added to the team
    const newEmployees = employees.filter(
      empId => !team.employees.includes(empId)
    );

    if (newEmployees.length > 0) {
      await Employee.updateMany(
        { _id: { $in: newEmployees } },
        { $addToSet: { teams: team._id } }
      );
      
      // Get employee details to find corresponding staff members
      const newEmployeeDetails = await Employee.find({ _id: { $in: newEmployees } }, 'email');
      
      // Send notifications to new employees
      for (const employee of newEmployeeDetails) {
        // Find staff member with the same email
        const staffMember = await Staff.findOne({ email: employee.email.toLowerCase() });
        
        if (staffMember) {
          // Send notification to the staff member
          await sendNotificationToStaff(staffMember._id, {
            title: 'Team Assignment',
            message: `You have been added to the team: ${team.name} in ${company.name} company`,
            type: 'success',
            companyId: company._id,
            data: {
              teamId: team._id,
              url: '/teams'
            }
          });
        }
      }
    }
  }

  // Update team
  const updatedTeam = await Team.findByIdAndUpdate(
    id,
    {
      ...(name && { name }),
      ...(employees && { employees })
    },
    { new: true }
  ).populate('company', 'name').populate('employees', 'fullName email position');

  return res.status(200).json({
    message: "Team updated successfully",
    team: {
      id: updatedTeam._id,
      name: updatedTeam.name,
      company: updatedTeam.company,
      employees: updatedTeam.employees,
      updatedAt: updatedTeam.updatedAt
    }
  });
});

/**
 * Delete team
 * @route DELETE /api/teams/:id
 * @access Admin only
 */
export const deleteTeam = CatchAsync(async (req, res) => {
  const { id } = req.params;

  // Find team
  const team = await Team.findById(id);
  if (!team) {
    return res.status(404).json({ error: "Team not found" });
  }

  const company = await Company.findById(team.company);
  if (!company) {
    return res.status(404).json({ error: "Company not found" });
  }

  // Remove team from company's teams array
  company.teams = company.teams.filter(teamId => teamId.toString() !== id);
  await company.save();

  // Remove team from all employees
  await Employee.updateMany(
    { teams: id },
    { $pull: { teams: id } }
  );

  // Delete team
  await Team.findByIdAndDelete(id);

  return res.status(200).json({
    message: "Team deleted successfully",
    id
  });
});

/**
 * Get teams by company
 * @route GET /api/companies/:companyId/teams
 * @access Admin only
 */
export const getTeamsByCompany = CatchAsync(async (req, res) => {
  const { companyId } = req.params;
  const company = await Company.findById(companyId);

  if (!company) {
    return res.status(404).json({ error: "Company not found" });
  }

  const teams = await Team.find({ company: companyId })
    .populate('employees', 'fullName email position')
    .sort({ createdAt: -1 });

  return res.status(200).json({
    count: teams.length,
    teams: teams.map(team => ({
      id: team._id,
      name: team.name,
      employeesCount: team.employees.length,
      employees: team.employees,
      createdAt: team.createdAt
    }))
  });
});

/**
 * Add employee to team
 * @route POST /api/teams/:id/employees
 * @access Admin only
 */
export const addEmployeeToTeam = CatchAsync(async (req, res) => {
  const { id } = req.params;
  const { employeeId } = req.body;

  if (!employeeId) {
    return res.status(400).json({ error: "Employee ID is required" });
  }

  // Find team
  const team = await Team.findById(id);
  if (!team) {
    return res.status(404).json({ error: "Team not found" });
  }

  const company = await Company.findById(team.company);
  if (!company) {
    return res.status(404).json({ error: "Company not found" });
  }

  // Check if employee exists and belongs to the same company
  const employee = await Employee.findOne({
    _id: employeeId,
    company: team.company
  });

  if (!employee) {
    return res.status(404).json({ error: "Employee not found or not in the same company" });
  }

  // Check if employee is already in the team
  if (team.employees.includes(employeeId)) {
    return res.status(409).json({ error: "Employee is already in this team" });
  }

  // Add employee to team
  team.employees.push(employeeId);
  await team.save();

  // Add team to employee's teams
  employee.teams.push(id);
  await employee.save();

  // Find staff member with the same email to send notification
  const staffMember = await Staff.findOne({ email: employee.email.toLowerCase() });
  
  if (staffMember) {
    // Send notification to the staff member
    await sendNotificationToStaff(staffMember._id, {
      title: 'Team Assignment',
      message: `You have been added to the team: ${team.name} in ${company.name} company`,
      type: 'success',
      companyId: company._id,
      data: {
        teamId: team._id,
        url: '/teams'
      }
    });
  }

  return res.status(200).json({
    message: "Employee added to team successfully",
    team: {
      id: team._id,
      name: team.name,
      employees: team.employees
    }
  });
});

/**
 * Remove employee from team
 * @route DELETE /api/teams/:id/employees/:employeeId
 * @access Admin only
 */
export const removeEmployeeFromTeam = CatchAsync(async (req, res) => {
  const { id, employeeId } = req.params;

  // Find team
  const team = await Team.findById(id);
  if (!team) {
    return res.status(404).json({ error: "Team not found" });
  }

  const company = await Company.findById(team.company);
  if (!company) {
    return res.status(404).json({ error: "Company not found" });
  }

  // Check if employee is in the team
  if (!team.employees.includes(employeeId)) {
    return res.status(404).json({ error: "Employee is not in this team" });
  }

  // Get employee details before removing
  const employee = await Employee.findById(employeeId);
  if (!employee) {
    return res.status(404).json({ error: "Employee not found" });
  }

  // Remove employee from team
  team.employees = team.employees.filter(empId => empId.toString() !== employeeId);
  await team.save();

  // Remove team from employee's teams
  await Employee.updateOne(
    { _id: employeeId },
    { $pull: { teams: id } }
  );

  // Find staff member with the same email to send notification
  const staffMember = await Staff.findOne({ email: employee.email.toLowerCase() });
  
  if (staffMember) {
    // Send notification to the staff member
    await sendNotificationToStaff(staffMember._id, {
      title: 'Team Update',
      message: `You have been removed from the team: ${team.name} in ${company.name} company`,
      type: 'info',
      companyId: company._id,
      data: {
        teamId: team._id,
        url: '/teams'
      }
    });
  }

  return res.status(200).json({
    message: "Employee removed from team successfully",
    team: {
      id: team._id,
      name: team.name,
      employees: team.employees
    }
  });
});
