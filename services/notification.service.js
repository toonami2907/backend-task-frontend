import { Server } from "socket.io";
import Staff from "../src/models/staff.model.js";
import Notification from "../src/models/notification.model.js";
import admin from "firebase-admin";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// __dirname replacement for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccount = JSON.parse(
  readFileSync(path.join(__dirname, "../firebase-acc.json"), "utf8")
);

import { sendEmailNotification } from "./mail.not.js";

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
// Store the io instance
let io;

// Initialize with the io instance from socketHelper
// Initialize with the io instance from socketHelper
export const initNotificationService = (ioInstance) => {
  global.io = ioInstance; // Use the parameter, not the local variable
  io = ioInstance; // Also set the local variable for consistency
};

/**
 * Send a notification to a specific staff member
 * @param {string} staffId - The ID of the staff member
 * @param {object} notification - The notification object
 * @param {string} notification.title - The notification title
 * @param {string} notification.message - The notification message
 * @param {string} notification.type - The notification type (info, warning, error, success)
 * @param {object} notification.data - Additional data for the notification
 * @param {boolean} notification.storeInDb - Whether to store the notification in the database (default: true)
 * @returns {boolean} - Whether the notification was sent
 */
export const sendNotificationToStaff = async (staffId, notificationData) => {
  console.log('Sending notification to staffId:', staffId, 'with data:', notificationData);
  try {
    // Create notification record in database (if storeInDb is not explicitly false)
    let notification;
    if (notificationData.storeInDb !== false) {
      notification = await Notification.create({
        recipient: staffId,
        recipientModel: 'Staff',
        company: notificationData.companyId || notificationData.data?.companyId || null,
        title: notificationData.title,
        message: notificationData.message,
        type: notificationData.type || 'info',
        data: notificationData.data || {},
      });
      console.log('Notification created in DB:', notification._id);
    }

    // Fetch staff to get FCM token and email
    const staff = await Staff.findById(staffId);
    if (!staff) {
      console.error(`Staff not found for ID: ${staffId}`);
      return null;
    }

    // Send FCM push notification if fcmToken exists
    if (staff.fcmToken) {
      const message = {
        notification: {
          title: notificationData.title || 'Task Reminder',
          body: notificationData.message || 'New notification',
        },
        data: {
          jobId: notificationData.data?.jobId?.toString() || '',
          taskId: notificationData.data?.taskId?.toString() || '',
          url: notificationData.data?.url || '/',
          type: notificationData.type || 'info',
        },
        token: staff.fcmToken,
      };

      try {
        await admin.messaging().send(message);
        console.log(`FCM notification sent to staffId: ${staffId}`);
      } catch (fcmError) {
        console.error(`Error sending FCM notification to staffId: ${staffId}`, fcmError);
      }
    } else {
      console.warn(`No FCM token found for staffId: ${staffId}`);
    }

    // Send email notification if email exists
    // if (staff.email) {
    //   console.log(`Attempting to send email notification to staff: ${staff.email}`);
    //   const emailData = {
    //     jobId: notificationData.data?.jobId,
    //     taskId: notificationData.data?.taskId,
    //     message: notificationData.message,
    //     senderName: notificationData.senderName || 'Task Reminder',
    //     url: notificationData.data?.url || 'https://your-app.com',
    //   };

    //   try {
    //     const emailResult = await sendEmailNotification(
    //       staff.email,
    //       notificationData.title || 'New Task Message',
    //       emailData
    //     );

    //     if (emailResult.success) {
    //       console.log(`Email sent to staff: ${staff.email}`);
    //     } else {
    //       console.error(`Failed to send email to staff: ${staff.email}`, emailResult.error);
    //     }
    //   } catch (emailError) {
    //     console.error(`Error sending email to staff: ${staff.email}`, emailError);
    //   }
    // } else {
    //   console.warn(`No email found for staffId: ${staffId}`);
    // }

    // Send real-time notification via socket if io is available
    if (global.io) {
      global.io.to(staffId.toString()).emit('notification', {
        id: notification?._id || `temp-${Date.now()}`,
        title: notificationData.title,
        message: notificationData.message,
        type: notificationData.type || 'info',
        timestamp: notification?.createdAt || new Date(),
        data: notificationData.data || {},
      });
      console.log(`Socket notification sent to staffId: ${staffId}`);
    }

    return notification || { success: true };
  } catch (error) {
    console.error('Error sending notification to staff:', error);
    return null;
  }
};

export const sendNotificationToAdmin = async (adminId, notificationData) => {
  console.log('Sending notification to adminId:', adminId, 'with data:', notificationData);
  try {
    let notification;
    if (notificationData.storeInDb !== false) {
      notification = await Notification.create({
        recipient: adminId,
        recipientModel: 'Admin',
        company: notificationData.companyId || notificationData.data?.companyId || null,
        title: notificationData.title,
        message: notificationData.message,
        type: notificationData.type || 'info',
        data: notificationData.data || {},
      });
    }

    if (global.io) {
      global.io.to('admin').emit('notification', {
        id: notification?._id || `temp-${Date.now()}`,
        title: notificationData.title,
        message: notificationData.message,
        type: notificationData.type || 'info',
        timestamp: notification?.createdAt || new Date(),
        data: notificationData.data || {},
      });
    }

    return notification || { success: true };
  } catch (error) {
    console.error('Error sending notification to admin:', error);
    return null;
  }
};

/**
 * Send a notification to a staff member by email
 * @param {string} email - The email of the staff member
 * @param {object} notification - The notification object
 * @returns {boolean} - Whether the notification was sent
 */
export const sendNotificationToStaffByEmail = async (
  email,
  notification
) => {
  try {
    const staff = await Staff.findOne({ email: email.toLowerCase() });

    if (!staff) {
      console.error(`Staff with email ${email} not found`);
      return false;
    }

    return await sendNotificationToStaff(staff._id, notification);
  } catch (error) {
    console.error("Error sending notification by email:", error);
    return false;
  }
};

/**
 * Send a notification to multiple staff members
 * @param {string[]} staffIds - Array of staff IDs
 * @param {object} notification - The notification object
 * @returns {object} - Result with success count and failed IDs
 */
export const sendNotificationToMultipleStaff = async (
  staffIds,
  notification
) => {
  const results = {
    success: 0,
    failed: [],
  };

  for (const staffId of staffIds) {
    const success = await sendNotificationToStaff(
      staffId,
      notification
    );
    if (success) {
      results.success++;
    } else {
      results.failed.push(staffId);
    }
  }

  return results;
};

/**
 * Send a notification to all staff members of a team
 * @param {string} teamId - The team ID
 * @param {object} notification - The notification object
 * @returns {object} - Result with success count and failed count
 */
export const sendNotificationToTeam = async (
  teamId,
  notification
) => {
  try {
    const teamStaff = await Staff.find({ teams: teamId });
    const staffIds = teamStaff.map((staff) => staff._id.toString());

    return await sendNotificationToMultipleStaff(
      staffIds,
      notification
    );
  } catch (error) {
    console.error("Error sending team notification:", error);
    return { success: 0, failed: ["Error fetching team members"] };
  }
};

/**
 * Send a notification to all staff members
 * @param {object} notification - The notification object
 * @returns {object} - Result with success count and failed count
 */
export const sendNotificationToAllStaff = async (notification) => {
  try {
    const allStaff = await Staff.find({});
    const staffIds = allStaff.map((staff) => staff._id.toString());

    return await sendNotificationToMultipleStaff(
      staffIds,
      notification
    );
  } catch (error) {
    console.error("Error sending notification to all staff:", error);
    return { success: 0, failed: ["Error fetching staff members"] };
  }
};
