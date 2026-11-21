export const PERMISSIONS = {
  COMPANY_MANAGE: 'company.manage',
  SETTINGS_MANAGE: 'settings.manage',
  ROLES_MANAGE: 'roles.manage',
  ROLES_DASHBOARD_MANAGE: 'roles.dashboard.manage',
  ROLES_WORKER_MANAGE: 'roles.worker.manage',
  DASHBOARD_ADMINS_MANAGE: 'dashboard_admins.manage',
  INVITES_DASHBOARD_SEND: 'invites.dashboard.send',
  INVITES_WORKER_SEND: 'invites.worker.send',
  EMPLOYEES_MANAGE: 'employees.manage',
  TEAMS_MANAGE: 'teams.manage',
  JOBS_MANAGE: 'jobs.manage',
  TASKS_ASSIGN: 'tasks.assign',
  TASKS_APPROVE_COMPLETION: 'tasks.approve_completion',
  CHAT_MANAGE: 'chat.manage',
  REPORTS_VIEW: 'reports.view',
  NOTIFICATIONS_VIEW: 'notifications.view'
};

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);
