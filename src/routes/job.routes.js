import express from 'express';
import { 
  createJob, 
  getAllJobs, 
  getJobById, 
  updateJob, 
  deleteJob, 
  archiveJob,
  getJobsByCompany,
  uploadJobResource,
  deleteJobResource,
  getJobsByEmployee,
  getTaskById,
  getTaskByJobAndTaskId,  // New controller method
  updateTaskStatus,
  approveTaskCompletion,
  rejectTaskCompletion,
  addTaskResponse,
  addJobMessage,
  getJobMessages,
  uploadJobChatFile,
  addMessageToTask,
  getTaskMessages,
  uploadChatFile,
  deleteTaskMessage,
} from '../controllers/job.controller.js';
import { verify_admin_token } from '../middleware/admin_verify_token.js';
import { verify_token } from '../middleware/verify_token.js';
import { ChatUpload } from '../../resources/chat.multer.js';
import { JobResourceUpload } from '../../resources/job-resource.multer.js';
import { PERMISSIONS } from '../constants/permissions.js';
import {
  requireCompanyPermission,
  requireJobPermission,
  requireTaskPermission
} from '../middleware/company_permission.middleware.js';

const router = express.Router();

// Job routes
router.post(
  '/',
  verify_admin_token,
  requireCompanyPermission({
    permission: PERMISSIONS.JOBS_MANAGE,
    resolveCompanyId: (req) => req.body?.companyId
  }),
  createJob
);
router.get(
  '/',
  verify_admin_token,
  requireCompanyPermission({
    permission: PERMISSIONS.JOBS_MANAGE,
    resolveCompanyId: (req) => req.query?.companyId
  }),
  getAllJobs
);
router.get(
  '/company/:companyId',
  verify_admin_token,
  requireCompanyPermission({
    permission: PERMISSIONS.JOBS_MANAGE,
    resolveCompanyId: (req) => req.params?.companyId
  }),
  getJobsByCompany
);
router.get(
  '/:id',
  verify_admin_token,
  requireJobPermission({
    permission: PERMISSIONS.JOBS_MANAGE,
    resolveJobId: (req) => req.params?.id
  }),
  getJobById
);
router.put(
  '/:id',
  verify_admin_token,
  requireJobPermission({
    permission: PERMISSIONS.JOBS_MANAGE,
    resolveJobId: (req) => req.params?.id
  }),
  updateJob
);
router.patch(
  '/:id/archive',
  verify_admin_token,
  requireJobPermission({
    permission: PERMISSIONS.JOBS_MANAGE,
    resolveJobId: (req) => req.params?.id
  }),
  archiveJob
);
router.delete(
  '/:id',
  verify_admin_token,
  requireJobPermission({
    permission: PERMISSIONS.JOBS_MANAGE,
    resolveJobId: (req) => req.params?.id
  }),
  deleteJob
);
router.post(
  '/:jobId/resources',
  verify_admin_token,
  requireJobPermission({
    permission: PERMISSIONS.JOBS_MANAGE,
    resolveJobId: (req) => req.params?.jobId
  }),
  JobResourceUpload.single('file'),
  uploadJobResource
);
router.delete(
  '/:jobId/resources/:resourceId',
  verify_admin_token,
  requireJobPermission({
    permission: PERMISSIONS.JOBS_MANAGE,
    resolveJobId: (req) => req.params?.jobId
  }),
  deleteJobResource
);
router.get('/employee/:employeeId', verify_token, getJobsByEmployee);

// Task routes
router.get('/tasks/:taskId', verify_token, getTaskById);
// router.get('/tasks/:taskId/staff', getTaskById);
router.patch('/tasks/:taskId/status', verify_token, updateTaskStatus);
router.patch(
  '/tasks/:taskId/approve',
  verify_admin_token,
  requireTaskPermission({
    permission: PERMISSIONS.TASKS_APPROVE_COMPLETION,
    resolveTaskId: (req) => req.params?.taskId
  }),
  approveTaskCompletion
);
router.patch(
  '/tasks/:taskId/reject',
  verify_admin_token,
  requireTaskPermission({
    permission: PERMISSIONS.TASKS_APPROVE_COMPLETION,
    resolveTaskId: (req) => req.params?.taskId
  }),
  rejectTaskCompletion
);
router.post('/tasks/:taskId/responses', verify_token, addTaskResponse);

// Task routes with job context
router.get(
  '/:jobId/tasks/:taskId',
  verify_admin_token,
  requireJobPermission({
    permission: PERMISSIONS.JOBS_MANAGE,
    resolveJobId: (req) => req.params?.jobId
  }),
  getTaskByJobAndTaskId
); // New route for admin
router.get('/:jobId/tasks/:taskId/staff', verify_token, getTaskByJobAndTaskId); // New route for staff

// Job message routes
router.post(
  '/:jobId/messages',
  verify_admin_token,
  requireJobPermission({
    permission: PERMISSIONS.CHAT_MANAGE,
    resolveJobId: (req) => req.params?.jobId
  }),
  addJobMessage
);
router.get(
  '/:jobId/messages',
  verify_admin_token,
  requireJobPermission({
    permission: PERMISSIONS.CHAT_MANAGE,
    resolveJobId: (req) => req.params?.jobId
  }),
  getJobMessages
);
router.post(
  '/:jobId/upload',
  verify_admin_token,
  requireJobPermission({
    permission: PERMISSIONS.CHAT_MANAGE,
    resolveJobId: (req) => req.params?.jobId
  }),
  ChatUpload.single('file'),
  uploadJobChatFile
);

// Staff job message routes
router.post('/staff/:jobId/messages', verify_token, addJobMessage);
router.get('/staff/:jobId/messages', verify_token, getJobMessages);
router.post('/staff/:jobId/upload', verify_token, ChatUpload.single('file'), uploadJobChatFile);

// Task message routes
router.post(
  '/:jobId/tasks/:taskId/messages',
  verify_admin_token,
  requireJobPermission({
    permission: PERMISSIONS.CHAT_MANAGE,
    resolveJobId: (req) => req.params?.jobId
  }),
  addMessageToTask
); // Admin route
router.get(
  '/:jobId/tasks/:taskId/messages',
  verify_admin_token,
  requireJobPermission({
    permission: PERMISSIONS.CHAT_MANAGE,
    resolveJobId: (req) => req.params?.jobId
  }),
  getTaskMessages
); // Admin route

// Staff task message routes
router.post('/staff/:jobId/tasks/:taskId/messages', verify_token, addMessageToTask); // Staff route
router.get('/staff/:jobId/tasks/:taskId/messages', verify_token, getTaskMessages); // Staff route

// File upload routes
router.post(
  '/:jobId/tasks/:taskId/upload',
  verify_admin_token,
  requireJobPermission({
    permission: PERMISSIONS.CHAT_MANAGE,
    resolveJobId: (req) => req.params?.jobId
  }),
  ChatUpload.single('file'),
  uploadChatFile
); // Admin upload
router.post('/staff/:jobId/tasks/:taskId/upload', verify_token, ChatUpload.single('file'), uploadChatFile); // Staff upload

// Delete message routes
router.delete(
  '/:jobId/tasks/:taskId/messages/:messageId',
  verify_admin_token,
  requireJobPermission({
    permission: PERMISSIONS.CHAT_MANAGE,
    resolveJobId: (req) => req.params?.jobId
  }),
  deleteTaskMessage
); // Admin delete
router.delete('/staff/:jobId/tasks/:taskId/messages/:messageId', verify_token, deleteTaskMessage); // Staff delete

export default router;
