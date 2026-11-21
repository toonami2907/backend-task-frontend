import { ALL_PERMISSIONS, PERMISSIONS } from './permissions.js';

export const DEFAULT_ROLES = [
  {
    name: 'Owner',
    target: 'dashboard',
    permissions: ALL_PERMISSIONS,
    isSystem: true,
    isOwner: true
  },
  {
    name: 'Admin',
    target: 'dashboard',
    permissions: [
      PERMISSIONS.COMPANY_MANAGE,
      PERMISSIONS.SETTINGS_MANAGE,
      PERMISSIONS.ROLES_DASHBOARD_MANAGE,
      PERMISSIONS.ROLES_WORKER_MANAGE,
      PERMISSIONS.DASHBOARD_ADMINS_MANAGE,
      PERMISSIONS.INVITES_DASHBOARD_SEND,
      PERMISSIONS.INVITES_WORKER_SEND,
      PERMISSIONS.EMPLOYEES_MANAGE,
      PERMISSIONS.TEAMS_MANAGE,
      PERMISSIONS.JOBS_MANAGE,
      PERMISSIONS.TASKS_ASSIGN,
      PERMISSIONS.TASKS_APPROVE_COMPLETION,
      PERMISSIONS.CHAT_MANAGE,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.NOTIFICATIONS_VIEW
    ],
    isSystem: true,
    isOwner: false
  },
  {
    name: 'Manager',
    target: 'dashboard',
    permissions: [
      PERMISSIONS.ROLES_WORKER_MANAGE,
      PERMISSIONS.INVITES_WORKER_SEND,
      PERMISSIONS.EMPLOYEES_MANAGE,
      PERMISSIONS.TEAMS_MANAGE,
      PERMISSIONS.JOBS_MANAGE,
      PERMISSIONS.TASKS_ASSIGN,
      PERMISSIONS.TASKS_APPROVE_COMPLETION,
      PERMISSIONS.CHAT_MANAGE,
      PERMISSIONS.NOTIFICATIONS_VIEW
    ],
    isSystem: true,
    isOwner: false
  },
  {
    name: 'Supervisor',
    target: 'worker',
    permissions: [
      PERMISSIONS.JOBS_MANAGE,
      PERMISSIONS.TASKS_ASSIGN,
      PERMISSIONS.TASKS_APPROVE_COMPLETION,
      PERMISSIONS.CHAT_MANAGE,
      PERMISSIONS.NOTIFICATIONS_VIEW
    ],
    isSystem: true,
    isOwner: false
  },
  {
    name: 'Worker',
    target: 'worker',
    permissions: [
      PERMISSIONS.CHAT_MANAGE,
      PERMISSIONS.NOTIFICATIONS_VIEW
    ],
    isSystem: true,
    isOwner: false
  },
  {
    name: 'CEO',
    target: 'dashboard',
    permissions: [
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.NOTIFICATIONS_VIEW
    ],
    isSystem: true,
    isOwner: false
  }
];
