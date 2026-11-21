import cron from 'node-cron';
import nodemailer from 'nodemailer';
import Job from '../models/job.model.js'; // Adjust the path to your Job model

// Configure Nodemailer transporter (example using Gmail; replace with your SMTP settings)
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // Use TLS
  auth: {
    user: process.env.EMAIL_USER, // Your Gmail address
    pass: process.env.EMAIL_PASS, // Your Gmail app-specific password
  },
});

// Function to send email notification
const sendEmailNotification = async (to, subject, body) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text: body,
    });
    console.log(`Email sent to ${to}: ${info.response}`);
  } catch (error) {
    console.error(`Error sending email to ${to}:`, error);
  }
};

// Function to send push notification (placeholder)
const sendPushNotification = async (userId, title, body) => {
  console.log(`Push notification sent to user ${userId}: ${title} - ${body}`);
  // Implement push notification logic here (e.g., using FCM)
};

// Function to reset daily reminder flags at midnight
const resetDailyReminderFlags = async () => {
  console.log('Resetting daily reminder flags...');
  try {
    const jobs = await Job.find();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    let updatedCount = 0;
    
    for (const job of jobs) {
      let jobModified = false;
      
      for (const task of job.tasks) {
        if (task.reminder && task.reminder.reminderSentToday) {
          // If the last reminder date is not today, reset the flag
          if (task.reminder.lastReminderDate !== today) {
            task.reminder.reminderSentToday = false;
            jobModified = true;
            updatedCount++;
          }
        }
      }
      
      if (jobModified) {
        await job.save();
      }
    }
    
    console.log(`Reset ${updatedCount} reminder flags`);
  } catch (error) {
    console.error('Error resetting reminder flags:', error);
  }
};

// Modify the calculateNextReminder function to use the new fields
const calculateNextReminder = (task) => {
  if (!task.reminder || !task.reminder.isActive) return;

  const now = new Date();
  const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const [startHours, startMinutes] = task.reminder.startTime.split(':').map(Number);

  // Set the base reminder time on the current day
  let nextReminder = new Date(today + 'T00:00:00.000Z');
  nextReminder.setUTCHours(startHours, startMinutes, 0, 0);

  // If it's a 'once' frequency and already sent, don't schedule again
  if (task.reminder.frequency === 'once' && task.reminder.lastSent) {
    console.log(`Task ${task.title} has 'once' frequency and was already sent - no more reminders`);
    task.reminder.isActive = false;
    task.reminder.nextReminder = null;
    return;
  }

  // If reminder already sent today, schedule for tomorrow or next appropriate day
  if (task.reminder.reminderSentToday || task.reminder.lastReminderDate === today) {
    console.log(`Task ${task.title} already reminded today - scheduling for next appropriate day`);
    nextReminder = new Date(nextReminder.getTime() + 24 * 60 * 60 * 1000); // Add one day
  }

  // Adjust based on frequency
  switch (task.reminder.frequency) {
    case 'once':
      // For 'once', if deadline passed, deactivate
      if (task.deadline && now > task.deadline) {
        console.log(`Task ${task.title} has passed its deadline - deactivating reminder`);
        task.reminder.isActive = false;
        task.reminder.nextReminder = null;
        return;
      }
      break;
      
    case 'daily':
      // Daily reminders run every day, no adjustment needed
      break;
      
    case 'weekdays':
      // Skip weekends
      const dayOfWeek = nextReminder.getUTCDay();
      if (dayOfWeek === 0) { // Sunday
        nextReminder.setUTCDate(nextReminder.getUTCDate() + 1); // Move to Monday
      } else if (dayOfWeek === 6) { // Saturday
        nextReminder.setUTCDate(nextReminder.getUTCDate() + 2); // Move to Monday
      }
      break;
      
    case 'every2days':
      // If last reminder was yesterday, add one more day
      if (task.reminder.lastSent) {
        const lastSentDate = new Date(task.reminder.lastSent);
        const daysSinceLastSent = Math.floor((now - lastSentDate) / (24 * 60 * 60 * 1000));
        if (daysSinceLastSent < 2) {
          nextReminder.setUTCDate(nextReminder.getUTCDate() + (2 - daysSinceLastSent));
        }
      }
      break;
      
    case 'every2daysNoWeekends':
      // Similar to every2days but skip weekends
      if (task.reminder.lastSent) {
        const lastSentDate = new Date(task.reminder.lastSent);
        const daysSinceLastSent = Math.floor((now - lastSentDate) / (24 * 60 * 60 * 1000));
        if (daysSinceLastSent < 2) {
          nextReminder.setUTCDate(nextReminder.getUTCDate() + (2 - daysSinceLastSent));
        }
      }
      
      // Skip weekends
      const nextDayOfWeek = nextReminder.getUTCDay();
      if (nextDayOfWeek === 0) { // Sunday
        nextReminder.setUTCDate(nextReminder.getUTCDate() + 1); // Move to Monday
      } else if (nextDayOfWeek === 6) { // Saturday
        nextReminder.setUTCDate(nextReminder.getUTCDate() + 2); // Move to Monday
      }
      break;
      
    case 'weekly':
      // If last reminder was less than 7 days ago, adjust
      if (task.reminder.lastSent) {
        const lastSentDate = new Date(task.reminder.lastSent);
        const daysSinceLastSent = Math.floor((now - lastSentDate) / (24 * 60 * 60 * 1000));
        if (daysSinceLastSent < 7) {
          nextReminder.setUTCDate(nextReminder.getUTCDate() + (7 - daysSinceLastSent));
        }
      }
      break;
      
    case 'custom':
      // For custom, check if today is a selected day
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const todayName = days[now.getUTCDay()];
      
      // If today is not selected or already reminded, find next selected day
      if (!task.reminder.daysOfWeek[todayName] || task.reminder.reminderSentToday) {
        let currentDayIndex = now.getUTCDay();
        let daysToAdd = 1;
        let foundNextDay = false;
        
        // Check up to 7 days ahead
        for (let i = 1; i <= 7; i++) {
          const nextIndex = (currentDayIndex + i) % 7;
          const nextDayName = days[nextIndex];
          
          if (task.reminder.daysOfWeek[nextDayName]) {
            daysToAdd = i;
            foundNextDay = true;
            break;
          }
        }
        
        if (foundNextDay) {
          nextReminder.setUTCDate(nextReminder.getUTCDate() + daysToAdd);
        } else {
          // If no days selected, deactivate reminder
          console.log(`Task ${task.title} has no days selected for custom frequency - deactivating reminder`);
          task.reminder.isActive = false;
          task.reminder.nextReminder = null;
          return;
        }
      }
      break;
  }

  // If the calculated time is in the past, move to tomorrow
  if (nextReminder < now) {
    nextReminder.setUTCDate(nextReminder.getUTCDate() + 1);
    
    // Re-apply frequency rules for the new date
    const adjustedDayOfWeek = nextReminder.getUTCDay();
    
    if (task.reminder.frequency === 'weekdays' && (adjustedDayOfWeek === 0 || adjustedDayOfWeek === 6)) {
      // Skip to Monday if it's a weekend
      nextReminder.setUTCDate(nextReminder.getUTCDate() + (adjustedDayOfWeek === 0 ? 1 : 2));
    } else if (task.reminder.frequency === 'custom') {
      // For custom, ensure the new day is a selected day
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const nextDayName = days[adjustedDayOfWeek];
      
      if (!task.reminder.daysOfWeek[nextDayName]) {
        // Find the next selected day
        let foundNextDay = false;
        
        for (let i = 1; i <= 7; i++) {
          const futureIndex = (adjustedDayOfWeek + i) % 7;
          const futureDayName = days[futureIndex];
          
          if (task.reminder.daysOfWeek[futureDayName]) {
            nextReminder.setUTCDate(nextReminder.getUTCDate() + i);
            foundNextDay = true;
            break;
          }
        }
        
        if (!foundNextDay) {
          // If no days selected, deactivate reminder
          console.log(`Task ${task.title} has no days selected for custom frequency - deactivating reminder`);
          task.reminder.isActive = false;
          task.reminder.nextReminder = null;
          return;
        }
      }
    }
  }

  task.reminder.nextReminder = nextReminder;
  console.log(`Calculated next reminder for ${task.title}: ${task.reminder.nextReminder}`);
};

// Update the checkReminders function to use the new fields
const checkReminders = async () => {
  console.log('Checking reminders...');
  try {
    const jobs = await Job.find().populate('tasks.resources.teams tasks.resources.employees');
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    let remindersFound = 0;

    for (const job of jobs) {
      for (const task of job.tasks) {
        if (task.reminder && task.reminder.isActive && task.reminder.nextReminder && !task.isCompleted) {
          const now = new Date();
          const reminderTime = new Date(task.reminder.nextReminder);

          const timeDifferenceMinutes = (reminderTime - now) / (1000 * 60);
          
          // Trigger if within 1 minute before to 5 minutes after the reminder time
          if (timeDifferenceMinutes >= -1 && timeDifferenceMinutes <= 5) {
            // Skip if already reminded today
            if (task.reminder.reminderSentToday || task.reminder.lastReminderDate === today) {
              console.log(`Task ${task.title} already reminded today - skipping`);
              continue;
            }
            
            remindersFound++;
            console.log(`Reminder triggered for Task: ${task.title} (Job: ${job.jobTitle})`);
            
            // Send notifications...
            // (existing notification code)
            
            // Update reminder tracking fields
            task.reminder.lastSent = now;
            task.reminder.reminderSentToday = true;
            task.reminder.lastReminderDate = today;
            
            // For 'once' frequency, deactivate after sending
            if (task.reminder.frequency === 'once') {
              task.reminder.isActive = false;
              task.reminder.nextReminder = null;
              console.log(`  - 'Once' frequency reminder completed - deactivating`);
            } else {
              calculateNextReminder(task);
              console.log(`  - Updated Next Reminder: ${task.reminder.nextReminder}`);
            }
            
            await job.save();
          } else if (reminderTime < now && timeDifferenceMinutes < -60) {
            // If reminder is more than an hour in the past, recalculate
            console.log(`Task: ${task.title} - Reminder missed, recalculating...`);
            calculateNextReminder(task);
            await job.save();
          }
        }
      }
    }

    if (remindersFound === 0) {
      console.log('No reminders found for this cycle.');
    } else {
      console.log(`Total reminders processed: ${remindersFound}`);
    }
  } catch (error) {
    console.error('Error checking reminders:', error);
  }
};

// Initial update of nextReminder for existing tasks
const initializeReminders = async () => {
  const jobs = await Job.find().populate('tasks.resources.teams tasks.resources.employees');
  for (const job of jobs) {
    for (const task of job.tasks) {
      if (task.reminder && (!task.reminder.nextReminder || task.reminder.nextReminder < new Date())) {
        calculateNextReminder(task);
        console.log(`Initialized nextReminder for Task: ${task.title} (Job: ${job.jobTitle}) to ${task.reminder.nextReminder}`);
      }
    }
    if (job.isModified()) await job.save();
  }
};

// Schedule the daily reset at midnight UTC
cron.schedule('0 0 * * *', () => {
  resetDailyReminderFlags();
}, {
  scheduled: true,
  timezone: 'UTC',
});

// Run initial reminder setup and start the cron job
initializeReminders().then(() => {
  // Reset flags on startup
  resetDailyReminderFlags();
  
  // Check reminders every minute
  cron.schedule('*/1 * * * *', () => {
    checkReminders();
  }, {
    scheduled: true,
    timezone: 'Africa/Lagos',
  });
  console.log('Reminder engine started...');
});