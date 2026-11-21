import { Router } from 'express';
import { 
  getNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead,
  deleteNotification,
  deleteAllReadNotifications
} from '../controllers/notification.controller.js';
import { verify_admin_token } from '../middleware/admin_verify_token.js';
import { verify_token } from '../middleware/verify_token.js';

const router = Router();

// Routes for both admin and staff
// Admin routes
router.get('/', verify_admin_token, getNotifications);
router.patch('/:id/read', verify_admin_token, markNotificationAsRead);
router.patch('/read-all', verify_admin_token, markAllNotificationsAsRead);
router.delete('/:id', verify_admin_token, deleteNotification);
router.delete('/read', verify_admin_token, deleteAllReadNotifications);

// Staff routes
router.get('/staff', verify_token, getNotifications);
router.patch('/:id/read/staff', verify_token, markNotificationAsRead);
router.patch('/read-all/staff', verify_token, markAllNotificationsAsRead);
router.delete('/:id/staff', verify_token, deleteNotification);
router.delete('/read/staff', verify_token, deleteAllReadNotifications);

export default router;