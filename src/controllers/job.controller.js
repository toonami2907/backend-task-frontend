import Job from "../models/job.model.js";
import Company from "../models/Company.model.js";
import Team from "../models/team.model.js";
import Employee from "../models/employee.model.js";
import { CatchAsync } from "../middleware/CatchAsync.js";
import { sendNotificationToStaff, sendNotificationToAdmin } from '../../services/notification.service.js';
import Staff from "../models/staff.model.js";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import { emitToTaskMembers, emitToJobMembers } from '../../socketHelper.js';

const getEmployeeForStaff = async (staffId, companyId) => {
  return Employee.findOne({ staff: staffId, company: companyId, isDeleted: false });
};

const getStaffIdsForTask = async (task) => {
  const employeeIds = new Set((task.resources.employees || []).map(id => id.toString()));
  if (task.resources.teams?.length > 0) {
    const teams = await Team.find({ _id: { $in: task.resources.teams } });
    teams.forEach(team => {
      (team.employees || []).forEach(empId => employeeIds.add(empId.toString()));
    });
  }
  const employees = await Employee.find({ _id: { $in: Array.from(employeeIds) } });
  const staffIds = [];
  for (const employee of employees) {
    const staff = await Staff.findOne({ email: employee.email.toLowerCase() });
    if (staff) {
      staffIds.push(staff._id.toString());
    }
  }
  return staffIds;
};

const deleteUploadedFileSafely = (filePath) => {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error("Failed to delete uploaded file:", error);
  }
};

const toResourceDto = (resource) => ({
  id: resource._id,
  label: resource.label || "",
  fileUrl: resource.fileUrl,
  fileName: resource.fileName,
  fileSize: resource.fileSize,
  mimeType: resource.mimeType,
  uploadedBy: resource.uploadedBy,
  uploadedAt: resource.uploadedAt
});

/**
 * Create a new job
 * @route POST /api/jobs
 * @access Admin only
 */
export const createJob = CatchAsync(async (req, res) => {
  const { 
    jobTitle, 
    jobDescription, 
    jobDeadline, 
    tasks, 
    companyId 
  } = req.body;
  
  // Validate required fields
  if (!jobTitle || !jobDescription || !companyId) {
    return res.status(400).json({
      error: "Job title, description, and company ID are required"
    });
  }
  
  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
    return res.status(400).json({
      error: "At least one task is required"
    });
  }
  
  // Check if company exists
  const company = await Company.findById(companyId);
  if (!company) {
    return res.status(404).json({ error: "Company not found" });
  }
  const companySettings = company.settings || {};
  const companyTimezone = companySettings.timezone || "UTC";
  const defaultInterval = companySettings.defaultReminderIntervalMinutes ?? 60;
  
  // Process tasks
  const processedTasks = [];
  for (const task of tasks) {
    if (!task.title) {
      return res.status(400).json({ error: "Task title is required" });
    }
    
    // Validate resources
    if (!task.resources || 
        (!task.resources.teams || !task.resources.teams.length) && 
        (!task.resources.employees || !task.resources.employees.length)) {
      return res.status(400).json({ 
        error: "At least one team or employee must be assigned to each task" 
      });
    }
    
    // Verify teams exist and belong to the company
    if (task.resources.teams && task.resources.teams.length > 0) {
      const teamsExist = await Team.countDocuments({
        _id: { $in: task.resources.teams },
        company: companyId
      });
      
      if (teamsExist !== task.resources.teams.length) {
        return res.status(400).json({ 
          error: "One or more teams do not exist or do not belong to this company" 
        });
      }
    }
    
    // Verify employees exist and belong to the company
    if (task.resources.employees && task.resources.employees.length > 0) {
      const employeesExist = await Employee.countDocuments({
        _id: { $in: task.resources.employees },
        company: companyId
      });
      
      if (employeesExist !== task.resources.employees.length) {
        return res.status(400).json({ 
          error: "One or more employees do not exist or do not belong to this company" 
        });
      }
    }
    
    // Process reminder settings if provided
    let reminder = null;
    if (task.reminder) {
      reminder = {
        isActive: task.reminder.isActive !== false,
        frequency: task.reminder.frequency || 'once',
        channels: {
          email: task.reminder.channels?.email !== false,
          pwaNotification: task.reminder.channels?.pwaNotification !== false
        },
        daysOfWeek: {
          monday: task.reminder.daysOfWeek?.monday || false,
          tuesday: task.reminder.daysOfWeek?.tuesday || false,
          wednesday: task.reminder.daysOfWeek?.wednesday || false,
          thursday: task.reminder.daysOfWeek?.thursday || false,
          friday: task.reminder.daysOfWeek?.friday || false,
          saturday: task.reminder.daysOfWeek?.saturday || false,
          sunday: task.reminder.daysOfWeek?.sunday || false
        },
        startTime: task.reminder.startTime || '09:00',
        endTime: task.reminder.endTime || '17:00',
        interval: task.reminder.interval || defaultInterval,
        timezone: task.reminder.timezone || companyTimezone,
        continueAfterDeadline: task.reminder.continueAfterDeadline || false
      };
    }


    // Add task to processed tasks
    processedTasks.push({
      title: task.title,
      description: task.description || "",
      deadline: task.deadline || null,
      resources: {
        teams: task.resources.teams || [],
        employees: task.resources.employees || []
      },
      reminder: reminder
    });  }
  
  // Create job with processed tasks
  const job = await Job.create({
    jobTitle,
    jobDescription,
    jobDeadline: jobDeadline || null,
    tasks: processedTasks,
    assignedTeams: [...new Set(processedTasks.flatMap(task => task.resources.teams))],
    assignedEmployees: [...new Set(processedTasks.flatMap(task => task.resources.employees))],
    company: companyId
  });
  
  // Add job to company's jobs array (if needed)
  // This assumes Company model has a jobs field, which wasn't in the provided model
  // If needed, you can add this field to the Company model
  
  // Return the created job
  return res.status(201).json({
    message: "Job created successfully",
    job: {
      id: job._id,
      jobTitle: job.jobTitle,
      jobDescription: job.jobDescription,
      jobDeadline: job.jobDeadline,
      tasks: job.tasks,
      assignedTeams: job.assignedTeams,
      assignedEmployees: job.assignedEmployees,
      resources: (job.resources || []).map(toResourceDto),
      resourcesCount: (job.resources || []).length,
      company: job.company,
      createdAt: job.createdAt
    }
  });
});

/**
 * Get all jobs
 * @route GET /api/jobs
 * @access Admin only
 */
export const getAllJobs = CatchAsync(async (req, res) => {
  const { companyId } = req.query;
  
  let query = {};
  
  // If companyId is provided, filter by company
  if (companyId) {
    query.company = companyId;
  }
  
  const jobs = await Job.find(query)
    .populate('company', 'name')
    .populate('assignedTeams', 'name')
    .populate('assignedEmployees', 'fullName email')
    .sort({ createdAt: -1 });
  
  return res.status(200).json({
    count: jobs.length,
    jobs: jobs.map(job => ({
      id: job._id,
      jobTitle: job.jobTitle,
      jobDescription: job.jobDescription,
      jobDeadline: job.jobDeadline,
      tasksCount: job.tasks.length,
      resources: (job.resources || []).map(toResourceDto),
      resourcesCount: (job.resources || []).length,
      assignedTeams: job.assignedTeams,
      assignedEmployees: job.assignedEmployees,
      company: job.company,
      archived: job.archived || false,
      createdAt: job.createdAt
    }))
  });
});

/**
 * Get job by ID
 * @route GET /api/jobs/:id
 * @access Admin only
 */
export const getJobById = CatchAsync(async (req, res) => {
  const { id } = req.params;
  
  const job = await Job.findById(id)
    .populate('company', 'name')
    .populate('assignedTeams', 'name')
    .populate('assignedEmployees', 'fullName email')
    .populate('tasks.resources.teams', 'name')
    .populate('tasks.resources.employees', 'fullName email staff');
  
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  
  return res.status(200).json({
    job: {
      id: job._id,
      jobTitle: job.jobTitle,
      jobDescription: job.jobDescription,
      jobDeadline: job.jobDeadline,
      tasks: job.tasks,
      assignedTeams: job.assignedTeams,
      assignedEmployees: job.assignedEmployees,
      resources: (job.resources || []).map(toResourceDto),
      resourcesCount: (job.resources || []).length,
      company: job.company,
      jobMessages: job.jobMessages || [],
      archived: job.archived || false,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    }
  });
});

/**
 * Update job
 * @route PUT /api/jobs/:id
 * @access Admin only
 */
export const updateJob = CatchAsync(async (req, res) => {
  const { id } = req.params;
  const { 
    jobTitle, 
    jobDescription, 
    jobDeadline, 
    tasks 
  } = req.body;
  
  // Find job
  const job = await Job.findById(id);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  if (job.archived) {
    return res.status(403).json({ error: "Archived jobs are read-only" });
  }
  
  // Validate at least one field to update
  if (!jobTitle && !jobDescription && !jobDeadline && !tasks) {
    return res.status(400).json({
      error: "At least one field is required for update"
    });
  }
  
  // Process tasks if provided
  let processedTasks = job.tasks;
  let assignedTeams = job.assignedTeams;
  let assignedEmployees = job.assignedEmployees;
  
  if (tasks && Array.isArray(tasks) && tasks.length > 0) {
    processedTasks = [];
    
    for (const task of tasks) {
      if (!task.title) {
        return res.status(400).json({ error: "Task title is required" });
      }
      
      // Validate resources
      if (!task.resources || 
          (!task.resources.teams || !task.resources.teams.length) && 
          (!task.resources.employees || !task.resources.employees.length)) {
        return res.status(400).json({ 
          error: "At least one team or employee must be assigned to each task" 
        });
      }
      
      // Verify teams exist and belong to the company
      if (task.resources.teams && task.resources.teams.length > 0) {
        const teamsExist = await Team.countDocuments({
          _id: { $in: task.resources.teams },
          company: job.company
        });
        
        if (teamsExist !== task.resources.teams.length) {
          return res.status(400).json({ 
            error: "One or more teams do not exist or do not belong to this company" 
          });
        }
      }
      
      // Verify employees exist and belong to the company
      if (task.resources.employees && task.resources.employees.length > 0) {
        const employeesExist = await Employee.countDocuments({
          _id: { $in: task.resources.employees },
          company: job.company
        });
        
        if (employeesExist !== task.resources.employees.length) {
          return res.status(400).json({ 
            error: "One or more employees do not exist or do not belong to this company" 
          });
        }
      }
      
      // Add task to processed tasks
      processedTasks.push({
        title: task.title,
        description: task.description || "",
        deadline: task.deadline || null,
        resources: {
          teams: task.resources.teams || [],
          employees: task.resources.employees || []
        }
      });
    }
    
    // Update assigned teams and employees
    assignedTeams = [...new Set(processedTasks.flatMap(task => task.resources.teams))];
    assignedEmployees = [...new Set(processedTasks.flatMap(task => task.resources.employees))];
  }
  
  // Update job
  const updatedJob = await Job.findByIdAndUpdate(
    id,
    {
      ...(jobTitle && { jobTitle }),
      ...(jobDescription && { jobDescription }),
      ...(jobDeadline !== undefined && { jobDeadline }),
      ...(tasks && { 
        tasks: processedTasks,
        assignedTeams,
        assignedEmployees
      })
    },
    { new: true }
  )
  .populate('company', 'name')
  .populate('assignedTeams', 'name')
  .populate('assignedEmployees', 'fullName email');
  
  return res.status(200).json({
    message: "Job updated successfully",
    job: {
      id: updatedJob._id,
      jobTitle: updatedJob.jobTitle,
      jobDescription: updatedJob.jobDescription,
      jobDeadline: updatedJob.jobDeadline,
      tasks: updatedJob.tasks,
      assignedTeams: updatedJob.assignedTeams,
      assignedEmployees: updatedJob.assignedEmployees,
      resources: (updatedJob.resources || []).map(toResourceDto),
      resourcesCount: (updatedJob.resources || []).length,
      company: updatedJob.company,
      updatedAt: updatedJob.updatedAt
    }
  });
});

/**
 * Delete job
 * @route DELETE /api/jobs/:id
 * @access Admin only
 */
export const deleteJob = CatchAsync(async (req, res) => {
  const { id } = req.params;
  
  const job = await Job.findById(id);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  
  await Job.findByIdAndDelete(id);
  
  return res.status(200).json({
    message: "Job deleted successfully",
    id
  });
});

/**
 * Get jobs by company
 * @route GET /api/companies/:companyId/jobs
 * @access Admin only
 */
export const getJobsByCompany = CatchAsync(async (req, res) => {
  const { companyId } = req.params;
  
  // Check if company exists
  const company = await Company.findById(companyId);
  if (!company) {
    return res.status(404).json({ error: "Company not found" });
  }
  
  const jobs = await Job.find({ company: companyId })
    .populate('assignedTeams', 'name')
    .populate('assignedEmployees', 'fullName email')
    .sort({ createdAt: -1 });
  
  return res.status(200).json({
    count: jobs.length,
    jobs: jobs.map(job => ({
      id: job._id,
      jobTitle: job.jobTitle,
      tasks: job.tasks,
      status: job.status,
      jobDescription: job.jobDescription,
      jobDeadline: job.jobDeadline,
      tasksCount: job.tasks.length,
      resources: (job.resources || []).map(toResourceDto),
      resourcesCount: (job.resources || []).length,
      assignedTeams: job.assignedTeams,
      assignedEmployees: job.assignedEmployees,
      archived: job.archived || false,
      createdAt: job.createdAt
    }))
  });
});

/**
 * Upload job resource
 * @route POST /api/jobs/:jobId/resources
 * @access Admin only
 */
export const uploadJobResource = CatchAsync(async (req, res) => {
  const { jobId } = req.params;
  const { label } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const job = await Job.findById(jobId);
  if (!job) {
    deleteUploadedFileSafely(req.file.path);
    return res.status(404).json({ error: "Job not found" });
  }
  if (job.archived) {
    deleteUploadedFileSafely(req.file.path);
    return res.status(403).json({ error: "Archived jobs are read-only" });
  }

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const resource = {
    label: String(label || "").trim().slice(0, 120),
    fileUrl: `${baseUrl}/uploads/job-resources/${req.file.filename}`,
    fileName: req.file.originalname,
    fileSize: req.file.size,
    mimeType: req.file.mimetype,
    uploadedBy: req.user._id,
    uploadedAt: new Date()
  };

  job.resources.push(resource);
  await job.save();

  const savedResource = job.resources[job.resources.length - 1];
  return res.status(201).json({
    success: true,
    message: "Resource uploaded successfully",
    resource: toResourceDto(savedResource)
  });
});

/**
 * Delete job resource
 * @route DELETE /api/jobs/:jobId/resources/:resourceId
 * @access Admin only
 */
export const deleteJobResource = CatchAsync(async (req, res) => {
  const { jobId, resourceId } = req.params;

  const job = await Job.findById(jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  if (job.archived) {
    return res.status(403).json({ error: "Archived jobs are read-only" });
  }

  const resource = job.resources.id(resourceId);
  if (!resource) {
    return res.status(404).json({ error: "Resource not found" });
  }

  const uploadSegment = "/uploads/";
  const fileUrl = resource.fileUrl || "";
  const uploadIndex = fileUrl.indexOf(uploadSegment);
  if (uploadIndex >= 0) {
    const relativeUploadPath = fileUrl.slice(uploadIndex + 1);
    const absoluteUploadPath = path.join(process.cwd(), relativeUploadPath);
    deleteUploadedFileSafely(absoluteUploadPath);
  }

  await resource.deleteOne();
  await job.save();

  return res.status(200).json({
    success: true,
    message: "Resource deleted successfully",
    resourceId
  });
});

/**
 * Archive job
 * @route PATCH /api/jobs/:id/archive
 * @access Admin only
 */
export const archiveJob = CatchAsync(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user._id;

  const job = await Job.findById(id);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  job.archived = true;
  job.archivedAt = new Date();
  job.archivedBy = adminId;
  job.tasks.forEach(task => {
    if (task.reminder) {
      task.reminder.isActive = false;
      task.reminder.nextReminder = null;
    }
  });
  await job.save();

  return res.status(200).json({
    message: "Job archived successfully",
    jobId: job._id,
    archived: true
  });
});

/**
 * Get jobs by employee
 * @route GET /api/jobs/employee/:employeeId
 * @access Employee only
 */

export const getJobsByEmployee = CatchAsync(async (req, res) => {
  const { employeeId } = req.params; // Staff ID from client
  const { companyId } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: "companyId is required" });
  }

  const staffId = req.user?._id || employeeId;
  const staff = await Staff.findById(staffId);
  if (!staff) {
    return res.status(404).json({ success: false, message: "Staff member not found" });
  }

  const employee = await Employee.findOne({
    staff: staff._id,
    company: companyId,
    isDeleted: false
  });
  if (!employee) {
    return res.status(404).json({ success: false, message: "No active employee record for this company" });
  }

  const employeeIdStr = employee._id.toString();
  const employeeTeamIds = employee.teams.map((id) => id.toString());

  const jobs = await Job.find({
    company: companyId,
    $or: [
      { assignedEmployees: employee._id },
      { assignedTeams: { $in: employee.teams } },
      { "tasks.resources.employees": employee._id },
      { "tasks.resources.teams": { $in: employee.teams } }
    ]
  })
    .populate("company", "name")
    .populate("tasks.resources.teams", "name")
    .populate({
      path: "tasks.resources.employees",
      select: "fullName email isDeleted",
      model: "Employee"
    })
    .sort({ createdAt: -1 });

  const processedJobs = jobs
    .map((job) => {
      const employeeTasks = job.tasks.filter((task, index) => {
        let taskEmployeeIds = [];
        if (
          task.resources.employees &&
          task.resources.employees.length > 0 &&
          task.resources.employees[0]._id
        ) {
          taskEmployeeIds = task.resources.employees.map((emp) => emp._id.toString());
        } else {
          const rawTask = job.tasks[index];
          taskEmployeeIds =
            rawTask?.resources?.employees?.map((emp) => emp.toString()) || [];
        }

        const taskTeamIds = task.resources.teams.map((team) =>
          team._id ? team._id.toString() : team.toString()
        );

        const isEmployeeAssigned = taskEmployeeIds.includes(employeeIdStr);
        const isTeamAssigned = taskTeamIds.some((teamId) =>
          employeeTeamIds.includes(teamId)
        );

        return isEmployeeAssigned || isTeamAssigned;
      });

      return {
        _id: job._id,
        jobTitle: job.jobTitle,
        jobDescription: job.jobDescription,
        jobDeadline: job.jobDeadline,
        resources: (job.resources || []).map(toResourceDto),
        resourcesCount: (job.resources || []).length,
        tasks: employeeTasks,
        company: job.company,
        createdAt: job.createdAt,
      };
    })
    .filter((job) => job.tasks.length > 0);

  return res.status(200).json({
    success: true,
    count: processedJobs.length,
    jobs: processedJobs,
  });
});



/**
 * Get a specific task
 * @route GET /api/tasks/:taskId
 * @access Employee only
 */
export const getTaskById = CatchAsync(async (req, res) => {
  const { taskId } = req.params;
  
  const job = await Job.findOne({
    'tasks._id': taskId
  })
  .populate('company', 'name')
  .populate('tasks.resources.teams', 'name')
  .populate('tasks.resources.employees', 'fullName email staff')
  .populate('tasks.responses.staffId', 'fullName');
  
  if (!job) {
    return res.status(404).json({ error: "Task not found" });
  }
  
  const task = job.tasks.find(t => t._id.toString() === taskId);
  
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }

  if (req.user && req.user.constructor.modelName === 'Staff') {
    const employee = await getEmployeeForStaff(req.user._id, job.company._id);
    if (!employee) {
      return res.status(403).json({ error: "No employee record found for this company" });
    }
    const isDirectlyAssigned = task.resources.employees.some(
      empId => empId._id?.toString() === employee._id.toString() || empId.toString() === employee._id.toString()
    );
    const isTeamAssigned = task.resources.teams.some(
      teamId => employee.teams.map(id => id.toString()).includes(teamId._id?.toString() || teamId.toString())
    );
    if (!isDirectlyAssigned && !isTeamAssigned) {
      return res.status(403).json({ error: "You are not assigned to this task" });
    }
  }
  
  return res.status(200).json({
    task: {
      _id: task._id,
      title: task.title,
      description: task.description,
      deadline: task.deadline,
      status: task.status || 'pending',
      resources: task.resources,
      responses: task.responses || [],
      messages: task.messages || [],
      completion: task.completion || {},
      job: job._id,
      jobTitle: job.jobTitle,
      jobDescription: job.jobDescription,
      jobDeadline: job.jobDeadline,
      jobResources: (job.resources || []).map(toResourceDto),
      company: job.company,
      createdAt: task.createdAt || job.createdAt
    }
  });
});

/**
 * Update task status
 * @route PATCH /api/tasks/:taskId/status
 * @access Employee only
 */
export const updateTaskStatus = CatchAsync(async (req, res) => {
  const { taskId } = req.params;
  const { status, employeeId, companyId } = req.body;

  // Step 1: Validate inputs
  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }
  if (!companyId) {
    return res.status(400).json({ error: 'Company ID is required' });
  }
  const staffId = req.user?._id || employeeId;
  if (!staffId) {
    return res.status(400).json({ error: 'Staff ID is required' });
  }
  if (!mongoose.isValidObjectId(taskId)) {
    return res.status(400).json({ error: 'Invalid task ID' });
  }

  // Validate status
  const validStatuses = ['pending', 'acknowledged', 'in-progress', 'completed'];
  console.log(status);
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
    });
  }

  // Step 2: Find the Staff by staffId
  const staff = await Staff.findById(staffId);
  if (!staff) {
    return res.status(404).json({
      success: false,
      message: 'Staff member not found',
    });
  }

  // Step 4: Find the job containing the task and populate teams
  const job = await Job.findOne(
    { 'tasks._id': taskId },
    {
      'tasks.$': 1, // Only return the matching task
      jobTitle: 1,
      company: 1,
    }
  ).populate('company', 'name settings admin').populate({
    path: 'tasks.resources.employees',
    select: 'fullName email',
    model: 'Employee',
  }).populate({
    path: 'tasks.resources.teams',
    select: 'name employees',
    model: 'Team',
  });

  if (!job) {
    return res.status(404).json({ error: 'Task not found' });
  }
  if (job.archived) {
    return res.status(403).json({ error: 'Archived jobs are read-only' });
  }
  if (job.company && job.company._id && job.company._id.toString() !== companyId.toString()) {
    return res.status(400).json({ error: 'Company mismatch for this task' });
  }

  // Step 5: Resolve employee record for this company
  const employee = await getEmployeeForStaff(staff._id, companyId);
  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'No matching employee record found for this company',
    });
  }

  const employeeIdStr = employee._id.toString();

  const task = job.tasks[0];
  console.log('Task resources:', JSON.stringify(task.resources, null, 2));

  // Step 6: Check if employee is assigned directly or via a team
  const isEmployeeAssigned = task.resources.employees.some(
    (emp) => emp._id.toString() === employeeIdStr
  );
  let isTeamAssigned = false;

  if (!isEmployeeAssigned && task.resources.teams.length > 0) {
    // Find the teams the employee belongs to
    const employeeTeams = await Team.find({
      employees: employee._id,
    });
    console.log('Employee teams:', employeeTeams.map(t => t._id));

    // Check if any of the employee's teams are assigned to the task
    isTeamAssigned = task.resources.teams.some((team) =>
      employeeTeams.some((empTeam) => empTeam._id.toString() === team._id.toString())
    );
    console.log('Is team assigned:', isTeamAssigned);
  }

  if (!isEmployeeAssigned && !isTeamAssigned) {
    return res.status(403).json({ error: 'Task not assigned to this employee or their team' });
  }

  // Step 7: Update the task status (completion requires approval)
  const requireApproval = job.company?.settings?.requireCompletionApproval !== false;
  const taskUpdate = {};
  const now = new Date();

  if (status === 'completed' && requireApproval) {
    taskUpdate['tasks.$.status'] = 'pending-approval';
    taskUpdate['tasks.$.completion.status'] = 'pending';
    taskUpdate['tasks.$.completion.requestedBy'] = staff._id;
    taskUpdate['tasks.$.completion.requestedAt'] = now;
    taskUpdate['tasks.$.completion.previousStatus'] = task.status;
    taskUpdate['tasks.$.lastResponseAt'] = now;
    taskUpdate['tasks.$.isCompleted'] = false;
  } else {
    taskUpdate['tasks.$.status'] = status;
    taskUpdate['tasks.$.lastResponseAt'] = now;
    taskUpdate['tasks.$.isCompleted'] = status === 'completed';
  }

  const updateResult = await Job.updateOne(
    { 'tasks._id': taskId },
    { $set: taskUpdate }
  );

  if (updateResult.matchedCount === 0) {
    return res.status(500).json({ error: 'Failed to update task status' });
  }

  // Step 8: Fetch the updated task for response
  const updatedJob = await Job.findOne(
    { 'tasks._id': taskId },
    { 'tasks.$': 1 }
  ).populate({
    path: 'tasks.resources.employees',
    select: 'fullName email',
    model: 'Employee',
  }).populate({
    path: 'tasks.resources.teams',
    select: 'name employees',
    model: 'Team',
  });

  const updatedTask = updatedJob?.tasks[0];

  if (status === 'completed' && requireApproval && job.company?.admin) {
    await sendNotificationToAdmin(job.company.admin, {
      title: 'Completion Approval Required',
      message: `Task "${updatedTask.title}" is awaiting approval.`,
      type: 'task_update',
      data: {
        taskId: updatedTask._id,
        jobId: job._id,
        companyId: job.company._id,
        url: `/admin/tasks/${updatedTask._id}`
      },
      companyId: job.company._id
    });
  }

  return res.status(200).json({
    message: 'Task status updated successfully',
    task: {
      _id: updatedTask._id,
      title: updatedTask.title,
      description: updatedTask.description,
      deadline: updatedTask.deadline,
      status: updatedTask.status,
      isCompleted: updatedTask.isCompleted,
      lastResponseAt: updatedTask.lastResponseAt,
      resources: updatedTask.resources,
      completion: updatedTask.completion
    },
  });
});;

/**
 * Approve task completion
 * @route PATCH /api/jobs/tasks/:taskId/approve
 * @access Admin only
 */
export const approveTaskCompletion = CatchAsync(async (req, res) => {
  const { taskId } = req.params;
  const adminId = req.user._id;

  const job = await Job.findOne({ 'tasks._id': taskId }).populate('company', 'name admin');
  if (!job) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const task = job.tasks.find(t => t._id.toString() === taskId);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  if (task.status !== 'pending-approval') {
    return res.status(400).json({ error: 'Task is not pending approval' });
  }

  task.status = 'completed';
  task.isCompleted = true;
  task.completion.status = 'approved';
  task.completion.decidedBy = adminId;
  task.completion.decidedAt = new Date();
  task.lastResponseAt = new Date();

  if (task.reminder) {
    task.reminder.isActive = false;
    task.reminder.nextReminder = null;
  }

  await job.save();

  const staffIds = await getStaffIdsForTask(task);
  for (const staffId of staffIds) {
    await sendNotificationToStaff(staffId, {
      title: 'Task Completion Approved',
      message: `Your task "${task.title}" was approved as completed.`,
      type: 'task_update',
      data: {
        taskId: task._id,
        jobId: job._id,
        companyId: job.company._id,
        url: `/task/${task._id}`
      }
    });
  }

  await emitToTaskMembers(job._id, task._id, 'task-approved', {
    jobId: job._id,
    taskId: task._id,
    status: task.status
  });

  return res.status(200).json({
    message: 'Task completion approved',
    task
  });
});

/**
 * Reject task completion
 * @route PATCH /api/jobs/tasks/:taskId/reject
 * @access Admin only
 */
export const rejectTaskCompletion = CatchAsync(async (req, res) => {
  const { taskId } = req.params;
  const { reason } = req.body;
  const adminId = req.user._id;

  if (!reason) {
    return res.status(400).json({ error: 'Rejection reason is required' });
  }

  const job = await Job.findOne({ 'tasks._id': taskId }).populate('company', 'name admin');
  if (!job) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const task = job.tasks.find(t => t._id.toString() === taskId);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  if (task.status !== 'pending-approval') {
    return res.status(400).json({ error: 'Task is not pending approval' });
  }

  const previousStatus = task.completion?.previousStatus || 'in-progress';
  task.status = previousStatus;
  task.isCompleted = false;
  task.completion.status = 'rejected';
  task.completion.decidedBy = adminId;
  task.completion.decidedAt = new Date();
  task.completion.rejectionReason = reason;
  task.lastResponseAt = new Date();

  await job.save();

  const staffIds = await getStaffIdsForTask(task);
  for (const staffId of staffIds) {
    await sendNotificationToStaff(staffId, {
      title: 'Task Completion Rejected',
      message: `Your task "${task.title}" was rejected. Reason: ${reason}`,
      type: 'task_update',
      data: {
        taskId: task._id,
        jobId: job._id,
        companyId: job.company._id,
        url: `/task/${task._id}`
      }
    });
  }

  await emitToTaskMembers(job._id, task._id, 'task-rejected', {
    jobId: job._id,
    taskId: task._id,
    status: task.status,
    reason
  });

  return res.status(200).json({
    message: 'Task completion rejected',
    task
  });
});

/**
 * Add response to a task
 * @route POST /api/tasks/:taskId/responses
 * @access Employee only
 */
export const addTaskResponse = CatchAsync(async (req, res) => {
  const { taskId } = req.params;
  const { staffId, responseType, responseText, standardReplyId } = req.body;
  
  if (!responseText) {
    return res.status(400).json({ error: "Response text is required" });
  }
  const currentStaffId = req.user?._id || staffId;
  if (!currentStaffId) {
    return res.status(400).json({ error: "Staff ID is required" });
  }

  const staff = await Staff.findById(currentStaffId);
  if (!staff) {
    return res.status(404).json({ error: "Staff not found" });
  }

  const job = await Job.findOne({ 'tasks._id': taskId }).populate('tasks.resources.teams');
  if (!job) {
    return res.status(404).json({ error: "Task not found" });
  }
  if (job.archived) {
    return res.status(403).json({ error: "Archived jobs are read-only" });
  }

  const task = job.tasks.find(t => t._id.toString() === taskId);
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }

  const employee = await getEmployeeForStaff(staff._id, job.company);
  if (!employee) {
    return res.status(403).json({ error: "No employee record found for this company" });
  }

  const isDirectlyAssigned = task.resources.employees.some(
    empId => empId.toString() === employee._id.toString()
  );
  let isTeamAssigned = false;
  if (!isDirectlyAssigned && task.resources.teams && task.resources.teams.length > 0) {
    const employeeTeams = await Team.find({ employees: employee._id });
    isTeamAssigned = task.resources.teams.some(teamId =>
      employeeTeams.some(team => team._id.toString() === teamId.toString())
    );
  }

  if (!isDirectlyAssigned && !isTeamAssigned) {
    return res.status(403).json({ error: "Task not assigned to this employee" });
  }
  
  const response = {
    staffId: staff._id,
    responseType: responseType || 'text',
    responseText,
    standardReplyId: standardReplyId || null,
    timestamp: new Date()
  };
  
  // Add the response to the task
  await Job.updateOne(
    { 'tasks._id': taskId },
    { 
      $push: { 'tasks.$.responses': response },
      $set: { 'tasks.$.lastResponseAt': new Date() }
    }
  );
  
  return res.status(201).json({
    message: "Response added successfully",
    response
  });
});

/**
 * Add a message to a job (job-level chat)
 * @route POST /api/jobs/:jobId/messages
 * @access Admin and Staff
 */
export const addJobMessage = CatchAsync(async (req, res) => {
  const { jobId } = req.params;
  const { text } = req.body;
  const user = req.user;

  if (!text) {
    return res.status(400).json({ error: "Message text is required" });
  }

  const job = await Job.findById(jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  if (job.archived) {
    if (req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(403).json({ error: "Archived jobs are read-only" });
  }
  if (job.archived) {
    return res.status(403).json({ error: "Archived jobs are read-only" });
  }

  let sender = 'staff';
  let senderId = null;
  let senderModel = null;
  let staffEmployee = null;

  if (user.constructor.modelName === 'Admin') {
    sender = 'admin';
    senderId = user._id;
    senderModel = 'Admin';
  } else if (user.constructor.modelName === 'Staff') {
    sender = 'staff';
    senderId = user._id;
    senderModel = 'Staff';

    staffEmployee = await getEmployeeForStaff(user._id, job.company);
    if (!staffEmployee) {
      return res.status(403).json({ error: "No employee record found for this company" });
    }

    const isAssignedToJob = job.tasks.some(task => {
      const direct = (task.resources.employees || []).some(empId => empId.toString() === staffEmployee._id.toString());
      const team = (task.resources.teams || []).some(teamId => staffEmployee.teams.map(id => id.toString()).includes(teamId.toString()));
      return direct || team;
    });

    if (!isAssignedToJob) {
      return res.status(403).json({ error: "You are not assigned to this job" });
    }
  } else {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const message = {
    sender,
    senderId,
    senderModel,
    messageType: 'text',
    text,
    createdAt: new Date()
  };

  job.jobMessages.push(message);
  await job.save();
  const senderName = sender === 'admin'
    ? 'Administrator'
    : staffEmployee?.fullName || user.fullName || 'Staff Member';

  await emitToJobMembers(jobId, 'new-job-message', {
    jobId,
    message: {
      id: job.jobMessages[job.jobMessages.length - 1]._id,
      sender,
      senderId,
      senderModel,
      senderName,
      messageType: 'text',
      text,
      createdAt: message.createdAt
    }
  });

  return res.status(201).json({
    message: "Job message added successfully",
    data: {
      id: job.jobMessages[job.jobMessages.length - 1]._id,
      sender,
      senderId,
      senderModel,
      senderName,
      messageType: 'text',
      text,
      createdAt: message.createdAt
    }
  });
});

/**
 * Get all messages for a job
 * @route GET /api/jobs/:jobId/messages
 * @access Admin and Staff
 */
export const getJobMessages = CatchAsync(async (req, res) => {
  const { jobId } = req.params;
  const user = req.user;

  const job = await Job.findById(jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  if (user.constructor.modelName === 'Staff') {
    const employee = await getEmployeeForStaff(user._id, job.company);
    if (!employee) {
      return res.status(403).json({ error: "No employee record found for this company" });
    }

    const isAssignedToJob = job.tasks.some(task => {
      const direct = (task.resources.employees || []).some(empId => empId.toString() === employee._id.toString());
      const team = (task.resources.teams || []).some(teamId => employee.teams.map(id => id.toString()).includes(teamId.toString()));
      return direct || team;
    });

    if (!isAssignedToJob) {
      return res.status(403).json({ error: "You are not assigned to this job" });
    }
  }

  const senderIds = (job.jobMessages || [])
    .filter((msg) => msg.sender === 'staff' && msg.senderId)
    .map((msg) => msg.senderId);
  const uniqueSenderIds = [...new Set(senderIds.map((id) => id.toString()))];

  const staffMembers = await Staff.find({ _id: { $in: uniqueSenderIds } }).select('_id fullName');
  const staffNameMap = {};
  staffMembers.forEach((staff) => {
    staffNameMap[staff._id.toString()] = staff.fullName;
  });

  const employeeMembers = await Employee.find({
    company: job.company,
    staff: { $in: uniqueSenderIds },
  }).select('staff fullName name');
  const employeeNameMap = {};
  employeeMembers.forEach((employee) => {
    if (employee.staff) {
      employeeNameMap[employee.staff.toString()] = employee.fullName || employee.name || 'Staff Member';
    }
  });

  return res.status(200).json({
    success: true,
    messages: (job.jobMessages || []).map((msg) => {
      const senderId = msg.senderId?.toString();
      const senderName = msg.sender === 'admin'
        ? 'Administrator'
        : employeeNameMap[senderId] || staffNameMap[senderId] || 'Staff Member';
      return {
        ...msg.toObject(),
        senderName,
      };
    }),
  });
});

/**
 * Upload file for job chat message
 * @route POST /api/jobs/:jobId/upload
 * @access Admin and Staff
 */
export const uploadJobChatFile = CatchAsync(async (req, res) => {
  const { jobId } = req.params;
  const user = req.user;

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const job = await Job.findById(jobId);
  if (!job) {
    if (req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(404).json({ error: "Job not found" });
  }

  let sender = 'staff';
  let senderId = null;
  let senderModel = null;
  let staffEmployee = null;

  if (user.constructor.modelName === 'Admin') {
    sender = 'admin';
    senderId = user._id;
    senderModel = 'Admin';
  } else if (user.constructor.modelName === 'Staff') {
    sender = 'staff';
    senderId = user._id;
    senderModel = 'Staff';

    staffEmployee = await getEmployeeForStaff(user._id, job.company);
    if (!staffEmployee) {
      if (req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(403).json({ error: "No employee record found for this company" });
    }

    const isAssignedToJob = job.tasks.some(task => {
      const direct = (task.resources.employees || []).some(empId => empId.toString() === staffEmployee._id.toString());
      const team = (task.resources.teams || []).some(teamId => staffEmployee.teams.map(id => id.toString()).includes(teamId.toString()));
      return direct || team;
    });

    if (!isAssignedToJob) {
      if (req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(403).json({ error: "You are not assigned to this job" });
    }
  } else {
    if (req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(403).json({ error: "Unauthorized" });
  }

  let messageType = 'file';
  if (req.file.mimetype.startsWith('image/')) {
    messageType = 'image';
  } else if (req.file.mimetype.startsWith('audio/')) {
    messageType = 'voice';
  }

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const message = {
    sender,
    senderId,
    senderModel,
    messageType,
    fileUrl: `${baseUrl}/uploads/chat/${req.file.filename}`,
    fileName: req.file.originalname,
    fileSize: req.file.size,
    mimeType: req.file.mimetype,
    createdAt: new Date()
  };

  job.jobMessages.push(message);
  await job.save();
  const senderName = sender === 'admin'
    ? 'Administrator'
    : staffEmployee?.fullName || user.fullName || 'Staff Member';

  await emitToJobMembers(jobId, 'new-job-message', {
    jobId,
    message: {
      id: job.jobMessages[job.jobMessages.length - 1]._id,
      sender,
      senderId,
      senderModel,
      senderName,
      messageType,
      fileUrl: message.fileUrl,
      fileName: message.fileName,
      fileSize: message.fileSize,
      mimeType: message.mimeType,
      createdAt: message.createdAt
    }
  });

  return res.status(201).json({
    success: true,
    message: "File uploaded successfully",
    data: {
      id: job.jobMessages[job.jobMessages.length - 1]._id,
      sender,
      senderId,
      senderModel,
      senderName,
      messageType,
      fileUrl: message.fileUrl,
      fileName: message.fileName,
      fileSize: message.fileSize,
      mimeType: message.mimeType,
      createdAt: message.createdAt
    }
  });
});

/**
 * Add a message to a task
 * @route POST /api/jobs/:jobId/tasks/:taskId/messages
 * @access Admin and Staff
 */
export const addMessageToTask = CatchAsync(async (req, res) => {
  const { jobId, taskId } = req.params;
  const { text } = req.body;
  const user = req.user;
  
  if (!text) {
    return res.status(400).json({ error: "Message text is required" });
  }
  
  // Find the job and task
  const job = await Job.findOne({ 
    _id: jobId,
    'tasks._id': taskId
  });
  
  if (!job) {
    return res.status(404).json({ error: "Job or task not found" });
  }
  if (job.archived) {
    return res.status(403).json({ error: "Archived jobs are read-only" });
  }
  
  // Find the specific task
  const task = job.tasks.find(t => t._id.toString() === taskId);
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  
  // Determine if sender is admin or staff
  let sender, senderId, senderModel;
  let staffEmployee = null;
  
  if (user.constructor.modelName === 'Admin') {
    sender = 'admin';
    senderId = user._id;
    senderModel = 'Admin';
  } else if (user.constructor.modelName === 'Staff') {
    sender = 'staff';
    senderId = user._id;
    senderModel = 'Staff';
    
    // Find the employee record for this staff member to verify task assignment
    staffEmployee = await getEmployeeForStaff(user._id, job.company);
    if (!staffEmployee) {
      return res.status(403).json({ error: "No employee record found for this staff member" });
    }
    
    // Verify employee is assigned to this task (directly or via team)
    const isDirectlyAssigned = task.resources.employees.some(
      empId => empId.toString() === staffEmployee._id.toString()
    );
    
    let isTeamAssigned = false;
    if (!isDirectlyAssigned && task.resources.teams && task.resources.teams.length > 0) {
      // Check if employee belongs to any of the assigned teams
      const employeeTeams = await Team.find({ employees: staffEmployee._id });
      isTeamAssigned = task.resources.teams.some(teamId =>
        employeeTeams.some(team => team._id.toString() === teamId.toString())
      );
    }
    
    if (!isDirectlyAssigned && !isTeamAssigned) {
      return res.status(403).json({ error: "You are not assigned to this task" });
    }
  } else {
    return res.status(403).json({ error: "Unauthorized" });
  }
  
  // Add the message to the task
  const message = {
    sender,
    senderId,
    senderModel,
    messageType: 'text',
    text,
    createdAt: new Date()
  };
  
  task.messages.push(message);
  await job.save();
  
  // If the message is from admin, notify all staff assigned to the task
  if (sender === 'admin') {
    const staffIds = await getStaffIdsForTask(task);
    for (const staffId of staffIds) {
      await sendNotificationToStaff(staffId, {
        title: 'New Message from Admin',
        message: `You have a new message for task: ${task.title}`,
        type: 'message',
        data: {
          jobId,
          taskId,
          url: `/task/${taskId}`
        }
      });
    }
  } 
  // If message is from staff, notify the admin
  else if (sender === 'staff') {
    // Find the admin of the company
    const company = await Company.findById(job.company).populate('admin');
    if (company && company.admin) {
      await sendNotificationToAdmin(company.admin._id, {
        title: 'New Task Message',
        message: `New message on task: ${task.title}`,
        type: 'message',
        data: {
          jobId,
          taskId,
          url: `/admin/tasks/${taskId}`
        },
        companyId: company._id
      });
    }
  }
  

  let senderName = sender === 'admin' ? 'Administrator' : 'Staff Member';
  if (sender === 'staff' && staffEmployee) {
    senderName = staffEmployee.fullName || staffEmployee.name || 'Staff Member';
  }
  const messageData = {
    id: task.messages[task.messages.length - 1]._id,
    sender,
    senderId,
    senderName,
    messageType: message.messageType || 'text',
    text: message.text,
    fileUrl: message.fileUrl,
    fileName: message.fileName,
    fileSize: message.fileSize,
    mimeType: message.mimeType,
    createdAt: message.createdAt
  };

  await emitToTaskMembers(jobId, taskId, 'new-task-message', {
    jobId,
    taskId,
    message: messageData
  });

  return res.status(201).json({
    message: "Message added successfully",
    data: {
      id: task.messages[task.messages.length - 1]._id,
      sender,
      senderId,
      text,
      createdAt: message.createdAt
    }
  });
});

/**
 * Get all messages for a task
 * @route GET /api/jobs/:jobId/tasks/:taskId/messages
 * @access Admin and Staff
 */
export const getTaskMessages = CatchAsync(async (req, res) => {
  const { jobId, taskId } = req.params;
  const user = req.user;
  
  // Find the job and task
  const job = await Job.findOne({
    _id: jobId,
    'tasks._id': taskId
  });
  
  if (!job) {
    return res.status(404).json({ error: "Job or task not found" });
  }
  
  // Find the specific task
  const task = job.tasks.find(t => t._id.toString() === taskId);
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  
  // If user is staff, verify they are assigned to this task
  let currentEmployee = null;
  if (user.constructor.modelName === 'Staff') {
    currentEmployee = await getEmployeeForStaff(user._id, job.company);
    
    if (!currentEmployee) {
      return res.status(403).json({ error: "No employee record found for this staff member" });
    }
    
    // Check if the employee is assigned to this task
    const isAssigned = task.resources.employees.some(
      empId => empId.toString() === currentEmployee._id.toString()
    );
    
    // Also check if any of the employee's teams are assigned to this task
    const isTeamAssigned = currentEmployee.teams && currentEmployee.teams.length > 0 &&
      task.resources.teams.some(teamId =>
        currentEmployee.teams.map(id => id.toString()).includes(teamId.toString())
      );
    
    if (!isAssigned && !isTeamAssigned) {
      return res.status(403).json({ error: "You are not assigned to this task" });
    }
  }
  
  // Collect all sender IDs to fetch their details in bulk
  const senderIds = task.messages
    .filter(msg => msg.senderId && msg.sender === 'staff')
    .map(msg => msg.senderId);

  const staffMembers = await Staff.find({ _id: { $in: senderIds } }).select('_id fullName');
  const staffMap = {};
  staffMembers.forEach(staff => {
    staffMap[staff._id.toString()] = staff.fullName;
  });

  const employeesByStaff = await Employee.find({
    company: job.company,
    staff: { $in: senderIds },
  }).select('staff fullName name');
  const employeeStaffMap = {};
  employeesByStaff.forEach((employee) => {
    if (employee.staff) {
      employeeStaffMap[employee.staff.toString()] = employee.fullName || employee.name || 'Staff Member';
    }
  });

  const employeesById = await Employee.find({
    company: job.company,
    _id: { $in: senderIds },
  }).select('_id fullName name');
  const employeeIdMap = {};
  employeesById.forEach((employee) => {
    employeeIdMap[employee._id.toString()] = employee.fullName || employee.name || 'Staff Member';
  });
  
  // Return the messages with proper formatting
  return res.status(200).json({
    success: true,
    messages: (task.messages || []).map(msg => {
      let senderName = 'Unknown';
      
      if (msg.sender === 'staff') {
        if (msg.senderId) {
          // Look up the staff name from our map
          const senderId = msg.senderId.toString();
          
          if (staffMap[senderId]) {
            senderName = staffMap[senderId];
          } else if (employeeStaffMap[senderId]) {
            senderName = employeeStaffMap[senderId];
          } else if (employeeIdMap[senderId]) {
            senderName = employeeIdMap[senderId];
          } else if (user && senderId === user._id.toString()) {
            senderName = user.fullName;
          } else {
            senderName = 'Staff Member';
          }
        }
      } else if (msg.sender === 'admin') {
        senderName = 'Administrator';
      }
      
      return {
        id: msg._id,
        sender: msg.sender,
        senderId: msg.senderId,
        senderName: senderName,
        messageType: msg.messageType || 'text',
        text: msg.text,
        fileUrl: msg.fileUrl,
        fileName: msg.fileName,
        fileSize: msg.fileSize,
        mimeType: msg.mimeType,
        createdAt: msg.createdAt
      };
    })
  });
});



/**
 * Get task by job ID and task ID
 * @route GET /api/jobs/:jobId/tasks/:taskId
 * @access Admin and Staff
 */
export const getTaskByJobAndTaskId = CatchAsync(async (req, res) => {
  const { jobId, taskId } = req.params;
  
  const job = await Job.findById(jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  
  const task = job.tasks.find(t => t._id.toString() === taskId);
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  
  // Populate employee and team references
  await job.populate('tasks.resources.teams', 'name');
  await job.populate('tasks.resources.employees', 'fullName email staff');
  
  // If user is staff, verify they are assigned to this task
  if (req.user.constructor.modelName === 'Staff') {
    const employee = await getEmployeeForStaff(req.user._id, job.company);
    if (!employee) {
      return res.status(403).json({ error: "No employee record found for this company" });
    }
    const isAssigned = task.resources.employees.some(
      empId => empId._id?.toString() === employee._id.toString() || empId.toString() === employee._id.toString()
    );
    const isTeamAssigned = task.resources.teams.some(
      teamId => employee.teams.map(id => id.toString()).includes(teamId._id?.toString() || teamId.toString())
    );
    if (!isAssigned && !isTeamAssigned) {
      return res.status(403).json({ error: "You are not assigned to this task" });
    }
  }
  
  return res.status(200).json({
    success: true,
    task: {
      _id: task._id,
      title: task.title,
      description: task.description,
      deadline: task.deadline,
      status: task.status || 'pending',
      isCompleted: task.isCompleted || false,
      resources: task.resources,
      responses: task.responses || [],
      messages: task.messages || [],
      completion: task.completion || {},
      reminder: task.reminder,
      job: {
        _id: job._id,
        title: job.jobTitle,
        description: job.jobDescription,
        deadline: job.jobDeadline
      },
      jobResources: (job.resources || []).map(toResourceDto),
      createdAt: task.createdAt || job.createdAt,
      updatedAt: task.updatedAt || job.updatedAt
    }
  });
});

/**
 * Upload file for chat message
 * @route POST /api/jobs/:jobId/tasks/:taskId/upload
 * @access Admin and Staff
 */
export const uploadChatFile = CatchAsync(async (req, res) => {
  const { jobId, taskId } = req.params;
  const user = req.user;
  
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  
  // Find the job and task
  const job = await Job.findOne({ 
    _id: jobId,
    'tasks._id': taskId
  });
  
  if (!job) {
    // Delete the uploaded file if job/task not found
    if (req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(404).json({ error: "Job or task not found" });
  }
  if (job.archived) {
    if (req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(403).json({ error: "Archived jobs are read-only" });
  }
  
  // Find the specific task
  const task = job.tasks.find(t => t._id.toString() === taskId);
  if (!task) {
    // Delete the uploaded file if task not found
    if (req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(404).json({ error: "Task not found" });
  }
  
  // Determine if sender is admin or staff
  let sender, senderId, senderModel;
  
  if (user.constructor.modelName === 'Admin') {
    sender = 'admin';
    senderId = user._id;
    senderModel = 'Admin';
  } else if (user.constructor.modelName === 'Staff') {
    sender = 'staff';
    
    // Find the employee record for this staff member
    const employee = await getEmployeeForStaff(user._id, job.company);
    if (!employee) {
      // Delete the uploaded file if no employee record found
      if (req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(403).json({ error: "No employee record found for this staff member" });
    }
    
    senderId = user._id; // Use staff ID directly
    senderModel = 'Staff';
    
    // Verify employee is assigned to this task (directly or via team)
    const isDirectlyAssigned = task.resources.employees.some(
      empId => empId.toString() === employee._id.toString()
    );
    
    let isTeamAssigned = false;
    if (!isDirectlyAssigned && task.resources.teams && task.resources.teams.length > 0) {
      // Check if employee belongs to any of the assigned teams
      const employeeTeams = await Team.find({ employees: employee._id });
      isTeamAssigned = task.resources.teams.some(teamId =>
        employeeTeams.some(team => team._id.toString() === teamId.toString())
      );
    }
    
    if (!isDirectlyAssigned && !isTeamAssigned) {
      // Delete the uploaded file if not authorized
      if (req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(403).json({ error: "You are not assigned to this task" });
    }
  } else {
    // Delete the uploaded file if unauthorized
    if (req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(403).json({ error: "Unauthorized" });
  }
  
  // Determine message type based on file type
  let messageType = 'file';
  if (req.file.mimetype.startsWith('image/')) {
    messageType = 'image';
  } else if (req.file.mimetype.startsWith('audio/')) {
    messageType = 'voice';
  }
  
  // Add the file message to the task
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  console.log('file path url', baseUrl);
  const message = {
    sender,
    senderId,
    senderModel,
    messageType,
    fileUrl: `${baseUrl}/uploads/chat/${req.file.filename}`,
    fileName: req.file.originalname,
    fileSize: req.file.size,
    mimeType: req.file.mimetype,
    createdAt: new Date()
  };
  
  task.messages.push(message);
  await job.save();
  
  // If the message is from admin, notify all staff assigned to the task
  if (sender === 'admin') {
    const staffIds = await getStaffIdsForTask(task);
    for (const staffId of staffIds) {
      await sendNotificationToStaff(staffId, {
        title: 'New File from Admin',
        message: `You have received a new file for task: ${task.title}`,
        type: 'message',
        data: {
          jobId,
          taskId,
          url: `/task/${taskId}`
        }
      });
    }
  } else if (sender === 'staff') {
    const company = await Company.findById(job.company).populate('admin');
    if (company && company.admin) {
      await sendNotificationToAdmin(company.admin._id, {
        title: 'New Task File',
        message: `New file uploaded for task: ${task.title}`,
        type: 'message',
        data: {
          jobId,
          taskId,
          url: `/admin/tasks/${taskId}`
        },
        companyId: company._id
      });
    }
  }
  
  // Emit socket event for real-time updates using helper function
  // Get proper sender name
  let senderName = sender === 'admin' ? 'Administrator' : 'Staff Member';
  if (sender === 'staff') {
    // Find the employee record for this staff member to get the name
    const employee = await getEmployeeForStaff(user._id, job.company);
    if (employee) {
      senderName = employee.fullName || employee.name || 'Staff Member';
    }
  }

  const messageData = {
    id: task.messages[task.messages.length - 1]._id,
    sender: message.sender,
    senderId: message.senderId,
    senderName: senderName,
    messageType: message.messageType,
    text: message.text,
    fileUrl: message.fileUrl,
    fileName: message.fileName,
    fileSize: message.fileSize,
    mimeType: message.mimeType,
    createdAt: message.createdAt
  };

  await emitToTaskMembers(jobId, taskId, 'new-task-message', {
    jobId,
    taskId,
    message: messageData
  });

  return res.status(201).json({
    success: true,
    message: "File uploaded successfully",
    data: {
      id: task.messages[task.messages.length - 1]._id,
      sender,
      senderId,
      messageType,
      fileUrl: message.fileUrl,
      fileName: message.fileName,
      fileSize: message.fileSize,
      mimeType: message.mimeType,
      createdAt: message.createdAt
    }
  });
});

/**
 * Delete a message from a task
 * @route DELETE /api/jobs/:jobId/tasks/:taskId/messages/:messageId
 * @access Admin and Staff (only their own messages)
 */
export const deleteTaskMessage = CatchAsync(async (req, res) => {
  const { jobId, taskId, messageId } = req.params;
  const user = req.user;
  console.log('jobId, taskId, messageId', jobId, taskId, messageId)
  
  // Find the job and task
  const job = await Job.findOne({
    _id: jobId,
    'tasks._id': taskId
  });
  
  if (!job) {
    return res.status(404).json({ error: "Job or task not found" });
  }
  
  // Find the specific task
  const task = job.tasks.find(t => t._id.toString() === taskId);
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  
  // Find the message
  const message = task.messages.find(m => m._id.toString() === messageId);
  if (!message) {
    console.log('Message not found. Available message IDs:', task.messages.map(m => m._id.toString()));
    return res.status(404).json({ error: "Message not found" });
  }
  
  // Check authorization
  let canDelete = false;
  let currentEmployee = null;
  
  if (user.constructor.modelName === 'Admin') {
    // Admin can only delete admin messages
    if (message.sender === 'admin') {
      canDelete = true;
    }
  } else if (user.constructor.modelName === 'Staff') {
    // Find the employee record for this staff member
    currentEmployee = await getEmployeeForStaff(user._id, job.company);
    
    if (!currentEmployee) {
      return res.status(403).json({ error: "No employee record found for this staff member" });
    }
    
    // Check if staff is assigned to this task (directly or via team)
    const isDirectlyAssigned = task.resources.employees.some(
      empId => empId.toString() === currentEmployee._id.toString()
    );
    
    let isTeamAssigned = false;
    if (!isDirectlyAssigned && task.resources.teams && task.resources.teams.length > 0) {
      // Check if employee belongs to any of the assigned teams
      const employeeTeams = await Team.find({ employees: currentEmployee._id });
      isTeamAssigned = task.resources.teams.some(teamId =>
        employeeTeams.some(team => team._id.toString() === teamId.toString())
      );
    }
    
    if (!isDirectlyAssigned && !isTeamAssigned) {
      return res.status(403).json({ error: "You are not assigned to this task" });
    }
    
    // Staff can only delete their own messages
    // Compare staff ID with staff ID (since message.senderId is now the staff ID)
    if (message.sender === 'staff' && message.senderId.toString() === user._id.toString()) {
      canDelete = true;
    }
  }
  console.log('Sender IDS', 
    message.senderId,
    user._id,
    currentEmployee ? currentEmployee._id : 'N/A (Admin)'
  )
  if (!canDelete) {
    return res.status(403).json({ error: "You can only delete your own messages" });
  }
  
  // Delete the file if it's a file/voice/image message
  if (message.fileUrl && (message.messageType === 'voice' || message.messageType === 'file' || message.messageType === 'image')) {
    try {
      const filePath = message.fileUrl.replace(/^.*\/uploads\//, 'uploads/');
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('Deleted file:', filePath);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      // Continue with message deletion even if file deletion fails
    }
  }
  
  // Remove the message from the array
  task.messages = task.messages.filter(m => m._id.toString() !== messageId);
  await job.save();
  
  // Emit socket event for real-time updates using helper function
  // Exclude the user who triggered the deletion
  const excludeUserId = user.constructor.modelName === 'Admin' ? 'admin' : user._id;
  await emitToTaskMembers(jobId, taskId, 'message-deleted', {
    jobId,
    taskId,
    messageId
  }, excludeUserId);
  
  return res.status(200).json({
    success: true,
    message: "Message deleted successfully"
  });
});
