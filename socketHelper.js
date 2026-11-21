import { Server } from 'socket.io';
import Job from './src/models/job.model.js';
import Staff from './src/models/staff.model.js';
import Team from './src/models/team.model.js';
import cron from 'node-cron';
import { initNotificationService, sendNotificationToStaff } from './services/notification.service.js';
import Employee from './src/models/employee.model.js';
import { DateTime } from 'luxon';
import { sendEmailNotification } from './services/mail.not.js';

let io;

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

const resolveSenderDisplayName = async ({ senderId, senderType, companyId }) => {
  if (senderType === 'admin') {
    return 'Administrator';
  }

  if (!senderId) {
    return 'Staff Member';
  }

  const senderIdString = senderId.toString();
  let staff = await Staff.findById(senderIdString).select('_id fullName email');

  if (!staff) {
    const employeeById = await Employee.findById(senderIdString).select('fullName name staff');
    if (employeeById) {
      if (employeeById.staff) {
        staff = await Staff.findById(employeeById.staff).select('_id fullName email');
      }
      return employeeById.fullName || employeeById.name || staff?.fullName || 'Staff Member';
    }
    return 'Staff Member';
  }

  let employee = null;
  if (companyId) {
    employee = await Employee.findOne({ staff: staff._id, company: companyId }).select('fullName name');
  }
  if (!employee && staff.email) {
    const email = staff.email.toLowerCase();
    employee = companyId
      ? await Employee.findOne({ email, company: companyId }).select('fullName name')
      : await Employee.findOne({ email }).select('fullName name');
  }

  return employee?.fullName || employee?.name || staff.fullName || 'Staff Member';
};

// Helper function to emit socket events
export const emitSocketEvent = (event, data) => {
  if (io) {
    console.log(`Emitting ${event} event:`, data);
    io.emit(event, data);
  } else {
    console.warn(`Socket.io not available for ${event} emission`);
  }
};

// Helper function to emit to specific room
export const emitToRoom = (room, event, data) => {
  if (io) {
    console.log(`Emitting ${event} to room ${room}:`, data);
    io.to(room).emit(event, data);
  } else {
    console.warn(`Socket.io not available for ${event} emission to room ${room}`);
  }
};

// Helper function to get all team members for a task and emit to them
export const emitToTaskMembers = async (jobId, taskId, event, data, excludeUserId = null) => {
  if (!io) {
    console.warn(`Socket.io not available for ${event} emission to task members`);
    return;
  }

  try {
    // Find the job and task
    const job = await Job.findOne({ 
      _id: jobId,
      'tasks._id': taskId
    });
    
    if (!job) {
      console.warn(`Job not found for ${event} emission:`, jobId);
      return;
    }
    
    const task = job.tasks.find(t => t._id.toString() === taskId);
    if (!task) {
      console.warn(`Task not found for ${event} emission:`, taskId);
      return;
    }
    
    // Get all employee IDs (direct and from teams)
    const employeeIds = new Set(
      (task.resources.employees || []).map(id => id.toString())
    );
    
    // Fetch teams and their employees
    if (task.resources.teams?.length > 0) {
      const teams = await Team.find({ 
        _id: { $in: task.resources.teams }
      });
      
      teams.forEach(team => {
        if (team.employees?.length > 0) {
          team.employees.forEach(empId => employeeIds.add(empId.toString()));
        }
      });
    }
    
    console.log(`Employee IDs to notify for ${event}:`, Array.from(employeeIds));
    
    // Send to all relevant employees (excluding the user who triggered the event)
    for (const empId of employeeIds) {
      const employee = await Employee.findById(empId);
      if (employee) {
        const staff = await Staff.findOne({ email: employee.email.toLowerCase() });
        if (staff) {
          // Skip if this is the user who triggered the event
          if (excludeUserId && staff._id.toString() === excludeUserId.toString()) {
            console.log(`Skipping ${event} for sender:`, staff._id.toString());
            continue;
          }
          console.log(`Sending ${event} to staff:`, staff._id.toString());
          io.to(staff._id.toString()).emit(event, data);
        }
      }
    }
    
    // Also send to admin (unless admin is the one who triggered the event)
    if (!excludeUserId || excludeUserId.toString() !== 'admin') {
      console.log(`Sending ${event} to admin`);
      io.to('admin').emit(event, data);
    }
    
  } catch (error) {
    console.error(`Error emitting ${event} to task members:`, error);
  }
};

// Helper function to emit to all members of a job (employees across all tasks and teams)
export const emitToJobMembers = async (jobId, event, data, excludeUserId = null) => {
  if (!io) {
    console.warn(`Socket.io not available for ${event} emission to job members`);
    return;
  }

  try {
    const job = await Job.findById(jobId);
    if (!job) {
      console.warn(`Job not found for ${event} emission:`, jobId);
      return;
    }

    const employeeIds = new Set();
    const teamIds = new Set();

    job.tasks.forEach(task => {
      (task.resources.employees || []).forEach(id => employeeIds.add(id.toString()));
      (task.resources.teams || []).forEach(id => teamIds.add(id.toString()));
    });

    if (teamIds.size > 0) {
      const teams = await Team.find({ _id: { $in: Array.from(teamIds) } });
      teams.forEach(team => {
        (team.employees || []).forEach(empId => employeeIds.add(empId.toString()));
      });
    }

    const employees = await Employee.find({ _id: { $in: Array.from(employeeIds) } });
    for (const employee of employees) {
      const staff = await Staff.findOne({ email: employee.email.toLowerCase() });
      if (!staff) continue;
      if (excludeUserId && staff._id.toString() === excludeUserId.toString()) {
        continue;
      }
      io.to(staff._id.toString()).emit(event, data);
    }

    if (!excludeUserId || excludeUserId.toString() !== 'admin') {
      io.to('admin').emit(event, data);
    }
  } catch (error) {
    console.error(`Error emitting ${event} to job members:`, error);
  }
};

export const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: ['http://localhost:5173','http://localhost:5174', process.env.FRONTEND_URL],
      methods: ['GET', 'POST'],
      credentials: true,
      allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
    },
  });

  // Initialize notification service with io instance
  initNotificationService(io);

  io.on('connection', (socket) => {
    console.log(`Staff connected: ${socket.id}`);

    socket.on('join', (staffId) => {
      socket.join(staffId);
      console.log(`Staff ${staffId} joined room`);
    });

    socket.on('response', async ({ staffId, taskId, responseType, responseText, standardReplyId }) => {
      try {
        const job = await Job.findOne({ 'tasks._id': taskId });
        if (!job) throw new Error('Job not found');
    
        const task = job.tasks.find(t => t._id.toString() === taskId);
        if (!task) throw new Error('Task not found');
    
        task.responses.push({
          staffId,
          responseType,
          responseText,
          standardReplyId,
        });
    
        const allStaffResponded = task.resources.employees.every(empId =>
          task.responses.some(r => r.staffId.toString() === empId.toString())
        );
        
        if (allStaffResponded) {
          task.status = 'in-progress';
        }
    
        await job.save();
        io.to(staffId).emit('responseConfirmation', { taskId, message: 'Response recorded' });
        io.to('admin').emit('taskUpdate', { taskId, status: task.status });
      } catch (err) {
        console.error('Error processing response:', err);
        socket.emit('error', { message: err.message });
      }
    });

socket.on('task-message', async ({ jobId, taskId, text, senderId, senderType, messageType = 'text', fileUrl, fileName, fileSize, mimeType }) => {
  console.log("MESSAGE RECEIVED", { jobId, taskId, text, senderId, senderType, messageType, fileUrl, fileName });
  try {
    // Validate senderType
    if (!['admin', 'staff'].includes(senderType)) {
      console.error("Invalid senderType:", senderType);
      throw new Error('Invalid sender type');
    }

    // Validate messageType
    if (!['text', 'voice', 'file', 'image'].includes(messageType)) {
      console.error("Invalid messageType:", messageType);
      throw new Error('Invalid message type');
    }

    // Find the job and task
    const job = await Job.findOne({ 
      _id: jobId,
      'tasks._id': taskId
    });
    
    if (!job) {
      console.error("Job not found for jobId:", jobId);
      throw new Error('Job or task not found');
    }
    
    const task = job.tasks.find(t => t._id.toString() === taskId);
    if (!task) {
      console.error("Task not found for taskId:", taskId);
      throw new Error('Task not found');
    }
    
    // Handle admin senderId - for admin, we'll use a special ObjectId or null
    let actualSenderId = senderId;
    if (senderType === 'admin') {
      // For admin messages, we can use null or a special admin ObjectId
      // Since the schema expects ObjectId, we'll use null and handle it in the schema
      actualSenderId = null;
    }
    
    // Add the message
    const message = {
      sender: senderType, // 'admin' or 'staff'
      senderId: actualSenderId,
      messageType,
      text: messageType === 'text' ? text : undefined,
      fileUrl: ['voice', 'file', 'image'].includes(messageType) ? fileUrl : undefined,
      fileName: ['voice', 'file', 'image'].includes(messageType) ? fileName : undefined,
      fileSize: ['voice', 'file', 'image'].includes(messageType) ? fileSize : undefined,
      mimeType: ['voice', 'file', 'image'].includes(messageType) ? mimeType : undefined,
      createdAt: new Date()
    };
    
    task.messages.push(message);
    await job.save();
    
    // Fetch sender name for messageData
    const senderName = await resolveSenderDisplayName({
      senderId,
      senderType,
      companyId: job.company,
    });
    
    // Broadcast the message
    const messageData = {
      id: task.messages[task.messages.length - 1]._id,
      sender: message.sender,
      senderId: message.senderId,
      senderName, // Include senderName
      type: message.type || 'individual',
      messageType: message.messageType,
      text: message.text,
      fileUrl: message.fileUrl,
      fileName: message.fileName,
      fileSize: message.fileSize,
      mimeType: message.mimeType,
      createdAt: message.createdAt
    };
    
    // Get all employee IDs (direct and from teams)
    const employeeIds = new Set(
      (task.resources.employees || []).map(id => id.toString())
    );
    
    // Fetch teams and their employees
    let hasTeams = false;
    if (task.resources.teams?.length > 0) {
      hasTeams = true;
      const teams = await Team.find({ 
        _id: { $in: task.resources.teams }
      });
      console.log("TEAMS", teams);
      
      // Add team employees to the set
      teams.forEach(team => {
        if (team.employees?.length > 0) {
          team.employees.forEach(empId => employeeIds.add(empId.toString()));
        }
      });
    } else {
      console.log("No teams assigned to task.resources.teams");
    }
    
    console.log('Employee IDs to notify:', Array.from(employeeIds), 'Sender:', senderId);
    
    if (employeeIds.size === 0) {
      console.warn("No employees found for message broadcast");
    }
    const taskTitle = task.title || 'Untitled Task';

    // Always emit to staff members so the sender sees their own message
    for (const empId of employeeIds) {
      const employee = await Employee.findById(empId);
      console.log("EMPLOYEE", employee);
      if (!employee) {
        console.warn(`Employee not found for ID: ${empId}`);
        continue;
      }
      const staff = await Staff.findOne({ email: employee.email.toLowerCase() });
      if (!staff) {
        console.warn(`Staff not found for email: ${employee.email.toLowerCase()}`);
        continue;
      }

      const isSender = senderType === 'staff' && staff._id.toString() === senderId.toString();
      if ((senderType === 'admin' || hasTeams) && !isSender) {
        await sendNotificationToStaff(staff._id.toString(), {
          title: senderType === 'admin' ? 'New Message from Admin' : `New Team Message for ${taskTitle}`,
          message: `You have a new message for task: ${taskTitle}`,
          type: 'message',
          section: 'team',
          data: {
            jobId,
            taskId,
            url: `/task/${taskId}`
          }
        });
      }

      io.to(staff._id.toString()).emit('new-task-message', {
        jobId,
        taskId,
        type: "team",
        message: messageData
      });
    }
    
    // Send to admin room
    io.to('admin').emit('new-task-message', {
      jobId,
      taskId,
      type: "team",
      message: messageData
    });
    
    // Confirm receipt to sender
    socket.emit('message-sent', { success: true, messageId: messageData.id });
  } catch (err) {
    console.error('Error processing task message:', err);
    socket.emit('error', { message: err.message });
  }
});

// Handle typing indicators
socket.on('typing-start', async ({ jobId, taskId, senderId, senderType }) => {
  console.log('Typing started:', { jobId, taskId, senderId, senderType });
  
  // Get all employee IDs (direct and from teams), excluding senderId
  const broadcastTyping = async () => {
    try {
      const job = await Job.findOne({ 
        _id: jobId,
        'tasks._id': taskId
      });
      
      if (!job) return;
      
      const task = job.tasks.find(t => t._id.toString() === taskId);
      if (!task) return;
      const senderName = await resolveSenderDisplayName({
        senderId,
        senderType,
        companyId: job.company,
      });
      
      // Convert staff ID to employee ID if needed
      let actualSenderId = senderId;
      if (senderType === 'staff') {
        const employee = await Employee.findOne({ staff: senderId, company: job.company }).select('_id');
        if (employee) {
          actualSenderId = employee._id;
        }
      }
      
      const employeeIds = new Set(
        (task.resources.employees?.filter(id => id.toString() !== actualSenderId.toString()) || [])
          .map(id => id.toString())
      );
      
      // Fetch teams and their employees
      if (task.resources.teams?.length > 0) {
        const teams = await Team.find({ 
          _id: { $in: task.resources.teams }
        });
        
        teams.forEach(team => {
          if (team.employees?.length > 0) {
            team.employees
              .filter(empId => empId.toString() !== actualSenderId.toString())
              .forEach(empId => employeeIds.add(empId.toString()));
          }
        });
      }
      
      // Broadcast typing indicator to all relevant users
      for (const empId of employeeIds) {
        const employee = await Employee.findById(empId);
        if (employee) {
          const staff = await Staff.findOne({ email: employee.email.toLowerCase() });
          if (staff) {
            io.to(staff._id.toString()).emit('user-typing', {
              jobId,
              taskId,
              senderId,
              senderType,
              senderName,
              isTyping: true
            });
          }
        }
      }
      
      // Send to admin room only when sender is not admin
      if (senderType !== 'admin') {
        io.to('admin').emit('user-typing', {
          jobId,
          taskId,
          senderId,
          senderType,
          senderName,
          isTyping: true
        });
      }
    } catch (err) {
      console.error('Error broadcasting typing indicator:', err);
    }
  };
  
  broadcastTyping();
});

socket.on('typing-stop', async ({ jobId, taskId, senderId, senderType }) => {
  console.log('Typing stopped:', { jobId, taskId, senderId, senderType });
  
  // Get all employee IDs (direct and from teams), excluding senderId
  const broadcastTypingStop = async () => {
    try {
      const job = await Job.findOne({ 
        _id: jobId,
        'tasks._id': taskId
      });
      
      if (!job) return;
      
      const task = job.tasks.find(t => t._id.toString() === taskId);
      if (!task) return;
      const senderName = await resolveSenderDisplayName({
        senderId,
        senderType,
        companyId: job.company,
      });
      
      // Convert staff ID to employee ID if needed
      let actualSenderId = senderId;
      if (senderType === 'staff') {
        const employee = await Employee.findOne({ staff: senderId, company: job.company }).select('_id');
        if (employee) {
          actualSenderId = employee._id;
        }
      }
      
      const employeeIds = new Set(
        (task.resources.employees?.filter(id => id.toString() !== actualSenderId.toString()) || [])
          .map(id => id.toString())
      );
      
      // Fetch teams and their employees
      if (task.resources.teams?.length > 0) {
        const teams = await Team.find({ 
          _id: { $in: task.resources.teams }
        });
        
        teams.forEach(team => {
          if (team.employees?.length > 0) {
            team.employees
              .filter(empId => empId.toString() !== actualSenderId.toString())
              .forEach(empId => employeeIds.add(empId.toString()));
          }
        });
      }
      
      // Broadcast typing stop to all relevant users
      for (const empId of employeeIds) {
        const employee = await Employee.findById(empId);
        if (employee) {
          const staff = await Staff.findOne({ email: employee.email.toLowerCase() });
          if (staff) {
            io.to(staff._id.toString()).emit('user-typing', {
              jobId,
              taskId,
              senderId,
              senderType,
              senderName,
              isTyping: false
            });
          }
        }
      }
      
      // Send to admin room only when sender is not admin
      if (senderType !== 'admin') {
        io.to('admin').emit('user-typing', {
          jobId,
          taskId,
          senderId,
          senderType,
          senderName,
          isTyping: false
        });
      }
    } catch (err) {
      console.error('Error broadcasting typing stop:', err);
    }
  };
  
  broadcastTypingStop();
});

    socket.on('disconnect', () => {
      console.log(`Staff disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const checkReminders = async () => {
  console.log('Checking reminders at:', new Date().toISOString());
  const jobs = await Job.find().populate('tasks.resources.teams');
  let remindersProcessed = 0;

  for (const job of jobs) {
    for (const task of job.tasks) {
      if (!task.reminder || task.isCompleted || !task.reminder.isActive) {
        continue;
      }

      // Recalculate if nextReminder is missing or in the past
      if (!task.reminder.nextReminder || new Date(task.reminder.nextReminder) < new Date()) {
        const recalculated = calculateNextReminder(task);
        task.reminder.nextReminder = recalculated;
      }

      if (!task.reminder.nextReminder) {
        continue;
      }

      const tz = task.reminder.timezone || 'UTC';
      const now = DateTime.now().setZone(tz);
      const reminderTime = DateTime.fromJSDate(task.reminder.nextReminder).setZone(tz);
      const timeDifferenceMinutes = reminderTime.diff(now, 'minutes').minutes;

      if (timeDifferenceMinutes >= -1 && timeDifferenceMinutes <= 5) {
        console.log(`Reminder triggered for Task: ${task.title} (Job: ${job.jobTitle}, Task ID: ${task._id})`);

        const staffIds = await getStaffIdsForTask(task);
        if (task.reminder.channels.pwaNotification && staffIds.length > 0) {
          await Promise.all(staffIds.map(async staffId => {
            global.io.to(staffId.toString()).emit('notification', {
              id: `reminder-${task._id}-${Date.now()}`,
              title: `Reminder: ${task.title}`,
              message: `Reminder for task: ${task.title} at ${reminderTime.toLocaleString()}`,
              type: 'reminder',
              data: {
                taskId: task._id,
                jobId: job._id,
                url: `/task/${task._id}`,
              },
            });
          }));
        }

        if (task.reminder.channels.email && staffIds.length > 0) {
          await Promise.all(staffIds.map(async staffId => {
            const staff = await Staff.findById(staffId);
            if (!staff || !staff.email) {
              return;
            }
            const emailData = {
              jobId: job._id,
              taskId: task._id,
              message: `Reminder for task: ${task.title} at ${reminderTime.toLocaleString()}`,
              senderName: 'Task Reminder System',
              url: `https://your-app.com/task/${task._id}`,
            };
            try {
              await sendEmailNotification(
                staff.email,
                `Reminder: ${task.title}`,
                emailData
              );
            } catch (emailError) {
              console.error(`Error sending email to staff: ${staff.email}`, emailError);
            }
          }));
        }

        task.reminder.lastSent = now.toJSDate();
        task.reminder.reminderSentToday = true;
        task.reminder.lastReminderDate = now.toISODate();

        if (task.reminder.frequency === 'once') {
          task.reminder.isActive = false;
          task.reminder.nextReminder = null;
        } else {
          task.reminder.nextReminder = calculateNextReminder(task, now.toJSDate());
        }

        remindersProcessed++;
      }
    }
    await job.save();
  }

  if (remindersProcessed > 0) {
    console.log(`Total reminders processed: ${remindersProcessed}`);
  } else {
    console.log('No reminders found for this cycle.');
  }
};

function calculateNextReminder(task, fromTime = null) {
  if (!task.reminder || !task.reminder.isActive) return null;

  const tz = task.reminder.timezone || 'UTC';
  const base = fromTime ? DateTime.fromJSDate(fromTime).setZone(tz) : DateTime.now().setZone(tz);
  const [startHours, startMinutes] = (task.reminder.startTime || '09:00').split(':').map(Number);
  const [endHours, endMinutes] = (task.reminder.endTime || '17:00').split(':').map(Number);
  const interval = Math.max(1, Number(task.reminder.interval) || 60);
  const frequency = task.reminder.frequency || 'once';

  const deadline = task.deadline ? DateTime.fromJSDate(task.deadline).setZone(tz) : null;
  if (deadline && !task.reminder.continueAfterDeadline && base > deadline) {
    return null;
  }

  const isAllowedDay = (day) => {
    const weekday = day.weekday; // 1-7
    switch (frequency) {
      case 'weekdays':
        return weekday <= 5;
      case 'custom': {
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = days[day.weekday % 7];
        return !!task.reminder.daysOfWeek?.[dayName];
      }
      default:
        return true;
    }
  };

  if (frequency === 'once') {
    if (!deadline) return null;
    const candidate = deadline.set({ hour: startHours, minute: startMinutes, second: 0, millisecond: 0 });
    if (!task.reminder.continueAfterDeadline && candidate < base) {
      return null;
    }
    return candidate.toJSDate();
  }

  let dayCursor = base.startOf('day');
  if (task.reminder.lastSent) {
    const lastSent = DateTime.fromJSDate(task.reminder.lastSent).setZone(tz);
    if (frequency === 'every2days' || frequency === 'every2daysNoWeekends') {
      dayCursor = lastSent.startOf('day').plus({ days: 2 });
    } else if (frequency === 'weekly') {
      dayCursor = lastSent.startOf('day').plus({ days: 7 });
    }
  }

  for (let i = 0; i < 14; i++) {
    const day = dayCursor.plus({ days: i });
    if (!isAllowedDay(day)) {
      continue;
    }

    const dayStart = day.set({ hour: startHours, minute: startMinutes, second: 0, millisecond: 0 });
    const dayEnd = day.set({ hour: endHours, minute: endMinutes, second: 0, millisecond: 0 });
    const baseTime = day.hasSame(base, 'day') ? base : dayStart;

    let candidate;
    if (baseTime <= dayStart) {
      candidate = dayStart;
    } else {
      const minutesSinceStart = Math.ceil(baseTime.diff(dayStart, 'minutes').minutes / interval) * interval;
      candidate = dayStart.plus({ minutes: minutesSinceStart });
    }

    if (candidate > dayEnd) {
      continue;
    }

    if (deadline && !task.reminder.continueAfterDeadline && candidate > deadline) {
      return null;
    }

    return candidate.toJSDate();
  }

  return null;
}

export const startReminderEngine = () => {
  cron.schedule('*/1 * * * *', () => {
    checkReminders();
  }, {
    scheduled: true,
    timezone: 'Africa/Lagos',
  });

  cron.schedule('0 0 * * *', async () => {
    console.log('Resetting daily reminder flags...');
    const result = await Job.updateMany({}, { $set: { 'tasks.$[task].reminder.reminderSentToday': false } }, { arrayFilters: [{ 'task.reminder': { $exists: true } }] });
    console.log(`Reset ${result.modifiedCount} reminder flags`);
  }, {
    scheduled: true,
    timezone: 'Africa/Lagos',
  });
};

