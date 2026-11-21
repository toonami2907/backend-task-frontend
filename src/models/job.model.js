import mongoose from 'mongoose';

const responseSchema = new mongoose.Schema({
  staffId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Staff', 
    required: true 
  },
  responseType: { 
    type: String, 
    enum: ['text', 'acknowledge', 'standard', 'pending'], 
    default: 'text' 
  },
  responseText: { 
    type: String, 
    required: true 
  },
  standardReplyId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'StandardReply', 
    default: null 
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  }
}, { timestamps: true });

const reminderSchema = new mongoose.Schema({
  isActive: { 
    type: Boolean, 
    default: true 
  },
  frequency: { 
    type: String, 
    enum: ['once', 'daily', 'weekdays', 'every2days', 'every2daysNoWeekends', 'weekly', 'custom'], 
    default: 'once' 
  },
  daysOfWeek: {
    monday: { type: Boolean, default: false },
    tuesday: { type: Boolean, default: false },
    wednesday: { type: Boolean, default: false },
    thursday: { type: Boolean, default: false },
    friday: { type: Boolean, default: false },
    saturday: { type: Boolean, default: false },
    sunday: { type: Boolean, default: false }
  },
  startTime: { 
    type: String, 
    default: '09:00' 
  },
  endTime: { 
    type: String, 
    default: '17:00' 
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  interval: { 
    type: Number, 
    default: 60 
  },
  nextReminder: { 
    type: Date, 
    default: null 
  },
  channels: {
    email: { type: Boolean, default: true },
    pwaNotification: { type: Boolean, default: true }
  },
  reminderSentToday: { 
    type: Boolean, 
    default: false 
  },
  lastSent: {
    type: Date,
    default: null
  },
  lastReminderDate: {
    type: String,
    default: null
  },
  continueAfterDeadline: {
    type: Boolean,
    default: false
  }
});

const messageSchema = new mongoose.Schema({
  sender: {
    type: String,
    enum: ['admin', 'staff'],
    required: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  senderModel: {
    type: String,
    enum: ['Admin', 'Staff'],
    default: null
  },
  messageType: {
    type: String,
    enum: ['text', 'voice', 'file', 'image'],
    default: 'text'
  },
  text: {
    type: String,
    required: function() {
      return this.messageType === 'text';
    }
  },
  fileUrl: {
    type: String,
    required: function() {
      return ['voice', 'file', 'image'].includes(this.messageType);
    }
  },
  fileName: {
    type: String,
    required: function() {
      return ['voice', 'file', 'image'].includes(this.messageType);
    }
  },
  fileSize: {
    type: Number,
    required: function() {
      return ['voice', 'file', 'image'].includes(this.messageType);
    }
  },
  mimeType: {
    type: String,
    required: function() {
      return ['voice', 'file', 'image'].includes(this.messageType);
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const jobResourceSchema = new mongoose.Schema({
  label: {
    type: String,
    default: '',
    trim: true,
    maxlength: 120
  },
  fileUrl: {
    type: String,
    required: true
  },
  fileName: {
    type: String,
    required: true,
    trim: true
  },
  fileSize: {
    type: Number,
    required: true,
    min: 0
  },
  mimeType: {
    type: String,
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
});

const taskSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true 
  },
  description: { 
    type: String, 
    default: '' 
  },
  deadline: { 
    type: Date, 
    default: null 
  },
  status: { 
    type: String, 
    enum: ['pending', 'acknowledged', 'in-progress', 'pending-approval', 'completed'], 
    default: 'pending' 
  },
  resources: {
    teams: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Team' 
    }],
    employees: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Employee' 
    }]
  },
  isCompleted: { 
    type: Boolean, 
    default: false 
  },
  completion: {
    status: {
      type: String,
      enum: ['none', 'pending', 'approved', 'rejected'],
      default: 'none'
    },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', default: null },
    requestedAt: { type: Date, default: null },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    decidedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
    previousStatus: { type: String, default: null }
  },
  lastResponseAt: { 
    type: Date, 
    default: null 
  },
  responses: [{
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    responseType: String,
    responseText: String,
    standardReplyId: String,
    createdAt: { type: Date, default: Date.now }
  }],
  messages: [messageSchema],
  reminder: reminderSchema
}, { timestamps: true });

const jobSchema = new mongoose.Schema({
  jobTitle: { 
    type: String, 
    required: true 
  },
  jobDescription: { 
    type: String, 
    required: true 
  },
  jobDeadline: { 
    type: Date, 
    default: null 
  },
  tasks: [taskSchema],
  assignedTeams: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Team' 
  }],
  assignedEmployees: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Employee' 
  }],
  company: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Company', 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['active', 'pending', 'in-progress', 'completed', 'cancelled'], 
    default: 'active' 
  },
  archived: { type: Boolean, default: false },
  archivedAt: { type: Date, default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  resources: [jobResourceSchema],
  jobMessages: [messageSchema]
}, { timestamps: true });


// Method to count completed tasks
jobSchema.methods.countCompletedTasks = function() {
  return this.tasks.filter(task => task.status === 'completed').length;
};

// Helper function to calculate the next reminder date
function calculateNextReminder(task) {
  if (!task.reminder) return;

  const now = new Date();
  const [startHours, startMinutes] = task.reminder.startTime.split(':').map(Number);

  // Set the base reminder time on the current day using local time
  let nextReminder = new Date(now);
  nextReminder.setHours(startHours, startMinutes, 0, 0);

  // For 'once' frequency, check if the deadline is today and the time hasn't passed
  if (task.reminder.frequency === 'once' && task.deadline) {
    const deadlineDate = new Date(task.deadline);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const deadlineDayStart = new Date(deadlineDate);
    deadlineDayStart.setHours(0, 0, 0, 0);

    if (deadlineDayStart.getTime() === today.getTime()) {
      nextReminder = new Date(now);
      nextReminder.setHours(startHours, startMinutes, 0, 0);
    } else if (deadlineDayStart < today) {
      task.reminder.nextReminder = null;
      return;
    }
  }

  // Adjust if the reminder time is in the past
  if (now >= nextReminder) {
    let daysToAdd = 0;

    switch (task.reminder.frequency) {
      case 'once':
        if (task.deadline) {
          const deadlineDate = new Date(task.deadline);
          const today = new Date(now);
          today.setHours(0, 0, 0, 0);
          const deadlineDayStart = new Date(deadlineDate);
          deadlineDayStart.setHours(0, 0, 0, 0);

          if (deadlineDayStart > today) {
            nextReminder = new Date(deadlineDate);
            nextReminder.setHours(startHours, startMinutes, 0, 0);
          } else {
            task.reminder.nextReminder = null;
            return;
          }
        } else {
          task.reminder.nextReminder = null;
          return;
        }
        break;
      case 'daily':
        daysToAdd = 1;
        break;
      case 'weekdays':
        const dayOfWeek = nextReminder.getDay();
        if (dayOfWeek === 5) daysToAdd = 3; // Saturday -> Monday
        else if (dayOfWeek === 6) daysToAdd = 2; // Sunday -> Monday
        else daysToAdd = 1;
        break;
      case 'every2days':
        daysToAdd = 2;
        break;
      case 'every2daysNoWeekends':
        daysToAdd = 2;
        const nextDay = new Date(nextReminder);
        nextDay.setDate(nextDay.getDate() + 2);
        const nextDayOfWeek = nextDay.getDay();
        if (nextDayOfWeek === 0) daysToAdd += 1; // Sunday -> Monday
        else if (nextDayOfWeek === 6) daysToAdd += 2; // Saturday -> Monday
        break;
      case 'weekly':
        daysToAdd = 7;
        break;
      case 'custom':
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        let currentDayIndex = nextReminder.getDay();
        let foundNextDay = false;

        while (!foundNextDay) {
          currentDayIndex = (currentDayIndex + 1) % 7;
          const dayName = days[currentDayIndex];
          if (task.reminder.daysOfWeek[dayName]) {
            foundNextDay = true;
            daysToAdd = (currentDayIndex - nextReminder.getDay() + 7) % 7 || 7;
          }
        }
        break;
    }

    if (daysToAdd > 0) {
      nextReminder.setDate(nextReminder.getDate() + daysToAdd);
    }
  }

  // If there's a deadline, ensure the reminder doesn't exceed it unless continuation is enabled
  if (task.deadline && !task.reminder.continueAfterDeadline) {
    const deadlineDate = new Date(task.deadline);
    if (nextReminder > deadlineDate) {
      task.reminder.nextReminder = null;
      return;
    }
  }

  task.reminder.nextReminder = nextReminder;
  console.log(`Pre-save: Set nextReminder for ${task.title} to ${task.reminder.nextReminder} (Local: ${nextReminder.toLocaleString()})`);
}

// Pre-save middleware to update job status and tasks completed count
jobSchema.pre('save', function(next) {
  // Keep isCompleted aligned with status as a derived flag
  this.tasks.forEach(task => {
    task.isCompleted = task.status === 'completed';
  });
  this.tasksCompleted = this.countCompletedTasks();
  const totalTasks = this.tasks.length;
  
  if (totalTasks === 0) {
    this.status = 'pending';
  } else if (this.tasksCompleted === 0) {
    this.status = 'pending';
  } else if (this.tasksCompleted === totalTasks) {
    // Job is completed - all tasks are done
    this.status = 'completed';
    
    // Set job deadline to 0:0:0 (midnight) of the current date
    if (this.jobDeadline) {
      const completionDate = new Date();
      // Set time to midnight (0:0:0)
      completionDate.setHours(0, 0, 0, 0);
      this.jobDeadline = completionDate;
      
      // Also update all task deadlines to the same time
      this.tasks.forEach(task => {
        if (task.deadline) {
          task.deadline = completionDate;
        }
      });
      
      console.log(`Job ${this.jobTitle} completed - deadline set to ${completionDate.toISOString()}`);
    }
  } else {
    this.status = 'in-progress';
  }
  
  // Calculate next reminder date for each task, but only if the reminder is active
  this.tasks.forEach(task => {
    if (task.reminder && !task.isCompleted && task.reminder.isActive) {
      calculateNextReminder(task);
    } else if (task.isCompleted && task.reminder) {
      // Disable reminders for completed tasks
      task.reminder.isActive = false;
      task.reminder.nextReminder = null;
    }
  });
  
  next();
});

const Job = mongoose.model('Job', jobSchema);
export default Job;
