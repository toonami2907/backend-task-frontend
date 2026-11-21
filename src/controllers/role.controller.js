import mongoose from 'mongoose';
import Role from '../models/role.model.js';
import Employee from '../models/employee.model.js';
import { ALL_PERMISSIONS, PERMISSIONS } from '../constants/permissions.js';
import { CatchAsync } from '../middleware/CatchAsync.js';
import {
  ensureCompanyPermission,
  getAdminCompanyAccess,
  hasPermission
} from '../services/rbac/dashboard-rbac.service.js';

const VALID_TARGETS = new Set(['dashboard', 'worker']);

const allowedPermissionsByTarget = {
  dashboard: new Set(ALL_PERMISSIONS),
  worker: new Set([
    PERMISSIONS.JOBS_MANAGE,
    PERMISSIONS.TASKS_ASSIGN,
    PERMISSIONS.TASKS_APPROVE_COMPLETION,
    PERMISSIONS.CHAT_MANAGE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.NOTIFICATIONS_VIEW
  ])
};

const getTargetPermission = (target) =>
  target === 'dashboard'
    ? PERMISSIONS.ROLES_DASHBOARD_MANAGE
    : PERMISSIONS.ROLES_WORKER_MANAGE;

const normalizeTarget = (target) => {
  if (!target) {
    return 'worker';
  }
  const value = String(target).trim().toLowerCase();
  return VALID_TARGETS.has(value) ? value : null;
};

const sanitizeRoleName = (name) => String(name || '').trim();
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const sanitizePermissions = (permissions, target) => {
  if (!Array.isArray(permissions)) {
    return { ok: false, error: 'permissions must be an array of strings' };
  }
  const normalized = Array.from(
    new Set(
      permissions
        .filter((permission) => typeof permission === 'string')
        .map((permission) => permission.trim())
        .filter(Boolean)
    )
  );

  const invalidPermission = normalized.find(
    (permission) => !allowedPermissionsByTarget[target].has(permission)
  );
  if (invalidPermission) {
    return { ok: false, error: `Permission '${invalidPermission}' is not allowed for ${target} roles` };
  }

  return { ok: true, value: normalized };
};

export const createRole = CatchAsync(async (req, res) => {
  const { companyId, name, permissions = [], target = 'worker' } = req.body;
  const adminId = req.user._id;
  const normalizedTarget = normalizeTarget(target);
  const normalizedName = sanitizeRoleName(name);

  if (!companyId || !normalizedName) {
    return res.status(400).json({ error: 'Company ID and role name are required' });
  }
  if (!normalizedTarget) {
    return res.status(400).json({ error: "target must be either 'dashboard' or 'worker'" });
  }
  if (normalizedName.length < 2 || normalizedName.length > 60) {
    return res.status(400).json({ error: 'Role name must be between 2 and 60 characters' });
  }

  const permissionCheck = sanitizePermissions(permissions, normalizedTarget);
  if (!permissionCheck.ok) {
    return res.status(400).json({ error: permissionCheck.error });
  }

  const access = await ensureCompanyPermission({
    adminId,
    companyId,
    permission: getTargetPermission(normalizedTarget)
  });
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  const existingRole = await Role.findOne({
    company: companyId,
    name: { $regex: new RegExp(`^${escapeRegex(normalizedName)}$`, 'i') }
  });
  if (existingRole) {
    return res.status(409).json({ error: 'A role with this name already exists in this company' });
  }

  const role = await Role.create({
    company: companyId,
    name: normalizedName,
    target: normalizedTarget,
    permissions: permissionCheck.value,
    isSystem: false,
    isOwner: false
  });

  return res.status(201).json({
    message: 'Role created successfully',
    role
  });
});

export const getRolesByCompany = CatchAsync(async (req, res) => {
  const { companyId } = req.params;
  const requestedTarget = normalizeTarget(req.query?.target);
  const adminId = req.user._id;

  if (req.query?.target && !requestedTarget) {
    return res.status(400).json({ error: "target must be either 'dashboard' or 'worker'" });
  }

  const access = await getAdminCompanyAccess({ adminId, companyId });
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  const canManageDashboardRoles =
    access.isOwner || hasPermission(access.permissionSet, PERMISSIONS.ROLES_DASHBOARD_MANAGE);
  const canManageWorkerRoles =
    access.isOwner ||
    hasPermission(access.permissionSet, PERMISSIONS.ROLES_WORKER_MANAGE) ||
    hasPermission(access.permissionSet, PERMISSIONS.ROLES_MANAGE);

  if (requestedTarget === 'dashboard' && !canManageDashboardRoles) {
    return res.status(403).json({ error: `Missing permission: ${PERMISSIONS.ROLES_DASHBOARD_MANAGE}` });
  }
  if (requestedTarget === 'worker' && !canManageWorkerRoles) {
    return res.status(403).json({ error: `Missing permission: ${PERMISSIONS.ROLES_WORKER_MANAGE}` });
  }

  if (!requestedTarget && !canManageDashboardRoles && !canManageWorkerRoles) {
    return res.status(403).json({ error: 'Missing role management permissions' });
  }

  const query = { company: companyId };
  if (requestedTarget) {
    query.target = requestedTarget;
  } else if (!canManageDashboardRoles) {
    query.$or = [{ target: 'worker' }, { target: { $exists: false } }];
  } else if (!canManageWorkerRoles) {
    query.target = 'dashboard';
  }

  const roles = await Role.find(query).sort({ createdAt: 1 });
  return res.status(200).json({ count: roles.length, roles });
});

export const updateRole = CatchAsync(async (req, res) => {
  const { id } = req.params;
  const { name, permissions } = req.body;
  const adminId = req.user._id;

  if (!mongoose.Types.ObjectId.isValid(String(id || ''))) {
    return res.status(400).json({ error: 'Invalid role ID' });
  }

  const role = await Role.findById(id);
  if (!role) {
    return res.status(404).json({ error: 'Role not found' });
  }

  const roleTarget = role.target || 'worker';
  const access = await ensureCompanyPermission({
    adminId,
    companyId: role.company,
    permission: getTargetPermission(roleTarget)
  });
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  if (role.isOwner) {
    return res.status(400).json({ error: 'Owner role cannot be modified' });
  }
  if (typeof req.body.target !== 'undefined') {
    return res.status(400).json({ error: 'Role target cannot be changed after creation' });
  }

  const updates = {};
  if (typeof name !== 'undefined') {
    const normalizedName = sanitizeRoleName(name);
    if (!normalizedName) {
      return res.status(400).json({ error: 'Role name cannot be empty' });
    }
    if (normalizedName.length < 2 || normalizedName.length > 60) {
      return res.status(400).json({ error: 'Role name must be between 2 and 60 characters' });
    }
    const duplicate = await Role.findOne({
      _id: { $ne: id },
      company: role.company,
      name: { $regex: new RegExp(`^${escapeRegex(normalizedName)}$`, 'i') }
    });
    if (duplicate) {
      return res.status(409).json({ error: 'A role with this name already exists in this company' });
    }
    updates.name = normalizedName;
  }

  if (Array.isArray(permissions)) {
    const permissionCheck = sanitizePermissions(permissions, roleTarget);
    if (!permissionCheck.ok) {
      return res.status(400).json({ error: permissionCheck.error });
    }
    updates.permissions = permissionCheck.value;
  }

  const updatedRole = await Role.findByIdAndUpdate(id, updates, { new: true });

  return res.status(200).json({
    message: 'Role updated successfully',
    role: updatedRole
  });
});

export const deleteRole = CatchAsync(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user._id;

  if (!mongoose.Types.ObjectId.isValid(String(id || ''))) {
    return res.status(400).json({ error: 'Invalid role ID' });
  }

  const role = await Role.findById(id);
  if (!role) {
    return res.status(404).json({ error: 'Role not found' });
  }

  const roleTarget = role.target || 'worker';
  const access = await ensureCompanyPermission({
    adminId,
    companyId: role.company,
    permission: getTargetPermission(roleTarget)
  });
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  if (role.isOwner) {
    return res.status(400).json({ error: 'Owner role cannot be deleted' });
  }

  if (roleTarget === 'worker') {
    const usersWithRole = await Employee.countDocuments({
      role: id,
      company: role.company,
      isDeleted: false
    });
    if (usersWithRole > 0) {
      return res.status(400).json({ error: 'Reassign employees before deleting this role' });
    }
  }

  await Role.findByIdAndDelete(id);

  return res.status(200).json({ message: 'Role deleted successfully' });
});
