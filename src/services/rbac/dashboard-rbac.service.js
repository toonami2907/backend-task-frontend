import mongoose from 'mongoose';
import Company from '../../models/Company.model.js';
import CompanyAdminMember from '../../models/companyAdminMember.model.js';
import { PERMISSIONS } from '../../constants/permissions.js';

const LEGACY_PERMISSION_ALIASES = {
  [PERMISSIONS.ROLES_MANAGE]: [
    PERMISSIONS.ROLES_DASHBOARD_MANAGE,
    PERMISSIONS.ROLES_WORKER_MANAGE
  ],
  [PERMISSIONS.ROLES_DASHBOARD_MANAGE]: [PERMISSIONS.ROLES_MANAGE],
  [PERMISSIONS.ROLES_WORKER_MANAGE]: [PERMISSIONS.ROLES_MANAGE]
};

export const normalizePermissionSet = (permissions = []) => {
  const normalized = new Set();

  for (const permission of permissions) {
    if (!permission || typeof permission !== 'string') {
      continue;
    }
    normalized.add(permission);
    const aliases = LEGACY_PERMISSION_ALIASES[permission] || [];
    aliases.forEach((alias) => normalized.add(alias));
  }

  return normalized;
};

export const hasPermission = (permissionSet, requiredPermission) => {
  if (!requiredPermission) {
    return true;
  }
  return permissionSet.has(requiredPermission);
};

export const getAdminCompanyAccess = async ({ adminId, companyId }) => {
  if (!mongoose.Types.ObjectId.isValid(String(companyId || ''))) {
    return { ok: false, status: 400, error: 'Invalid company ID' };
  }

  const company = await Company.findById(companyId).select('_id admin');
  if (!company) {
    return { ok: false, status: 404, error: 'Company not found' };
  }

  const isOwner = String(company.admin) === String(adminId);
  if (isOwner) {
    return {
      ok: true,
      company,
      isOwner: true,
      permissionSet: normalizePermissionSet([])
    };
  }

  const membership = await CompanyAdminMember.findOne({
    company: company._id,
    admin: adminId,
    status: 'active'
  }).populate('role', 'name target permissions');

  if (!membership || !membership.role) {
    return { ok: false, status: 403, error: 'Access denied for this company' };
  }

  if (membership.role.target !== 'dashboard') {
    return { ok: false, status: 403, error: 'Invalid dashboard role assignment' };
  }

  return {
    ok: true,
    company,
    isOwner: false,
    membership,
    permissionSet: normalizePermissionSet(membership.role.permissions || [])
  };
};

export const ensureCompanyPermission = async ({
  adminId,
  companyId,
  permission,
  allowOwner = true
}) => {
  const access = await getAdminCompanyAccess({ adminId, companyId });
  if (!access.ok) {
    return access;
  }

  if (access.isOwner && allowOwner) {
    return access;
  }

  if (!hasPermission(access.permissionSet, permission)) {
    return { ok: false, status: 403, error: `Missing permission: ${permission}` };
  }

  return access;
};
