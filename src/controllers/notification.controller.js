import Notification from '../models/notification.model.js';
import { CatchAsync } from '../middleware/CatchAsync.js';

/**
 * Get notifications for the current user
 * @route GET /api/notifications
 * @access Admin and Staff
 */
export const getNotifications = CatchAsync(async (req, res) => {
  const user = req.user;
  const { page = 1, limit = 20, unreadOnly = false, companyId } = req.query;
  
  // Determine if user is admin or staff
  const recipientModel = user.constructor.modelName;
  const query = { 
    recipient: user._id,
    recipientModel
  };

  if (companyId) {
    query.company = companyId;
  }
  
  // Filter by read status if requested
  // if (unreadOnly === 'true') {
  //   query.read = false;
  // }
  
  // Calculate pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  // Get notifications
  const notifications = await Notification.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));
  
  // Get total count for pagination
  const total = await Notification.countDocuments(query);
  
  return res.status(200).json({
    success: true,
    data: {
      notifications: notifications.map(notification => ({
        id: notification._id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        read: notification.read,
        data: notification.data,
        createdAt: notification.createdAt
      })),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

/**
 * Mark a notification as read
 * @route PATCH /api/notifications/:id/read
 * @access Admin and Staff
 */
export const markNotificationAsRead = CatchAsync(async (req, res) => {
  const { id } = req.params;
  const user = req.user;
  
  // Find and update the notification
  const notification = await Notification.findOneAndUpdate(
    { 
      _id: id,
      recipient: user._id,
      recipientModel: user.constructor.modelName
    },
    { read: true },
    { new: true }
  );
  
  if (!notification) {
    return res.status(404).json({
      success: false,
      message: 'Notification not found'
    });
  }
  
  return res.status(200).json({
    success: true,
    message: 'Notification marked as read'
  });
});

/**
 * Mark all notifications as read
 * @route PATCH /api/notifications/read-all
 * @access Admin and Staff
 */
export const markAllNotificationsAsRead = CatchAsync(async (req, res) => {
  const user = req.user;
  
  // Update all unread notifications for this user
  const result = await Notification.updateMany(
    { 
      recipient: user._id,
      recipientModel: user.constructor.modelName,
      read: false
    },
    { read: true }
  );
  
  return res.status(200).json({
    success: true,
    message: `${result.modifiedCount} notifications marked as read`
  });
});

/**
 * Delete a notification
 * @route DELETE /api/notifications/:id
 * @access Admin and Staff
 */
export const deleteNotification = CatchAsync(async (req, res) => {
  const { id } = req.params;
  const user = req.user;
  
  // Find and delete the notification
  const notification = await Notification.findOneAndDelete({
    _id: id,
    recipient: user._id,
    recipientModel: user.constructor.modelName
  });
  
  if (!notification) {
    return res.status(404).json({
      success: false,
      message: 'Notification not found'
    });
  }
  
  return res.status(200).json({
    success: true,
    message: 'Notification deleted'
  });
});

/**
 * Delete all read notifications
 * @route DELETE /api/notifications/read
 * @access Admin and Staff
 */
export const deleteAllReadNotifications = CatchAsync(async (req, res) => {
  const user = req.user;
  
  // Delete all read notifications for this user
  const result = await Notification.deleteMany({
    recipient: user._id,
    recipientModel: user.constructor.modelName,
    read: true
  });
  
  return res.status(200).json({
    success: true,
    message: `${result.deletedCount} notifications deleted`
  });
});
