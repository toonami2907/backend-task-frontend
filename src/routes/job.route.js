// Add these routes to your job routes
JOBROUTE.post('/:jobId/tasks/:taskId/messages', verify_admin_token, addMessageToTask);
JOBROUTE.post('/:jobId/tasks/:taskId/messages', verify_token, addMessageToTask); // For staff
JOBROUTE.get('/:jobId/tasks/:taskId/messages', verify_admin_token, getTaskMessages);
JOBROUTE.get('/:jobId/tasks/:taskId/messages', verify_token, getTaskMessages); // For staff