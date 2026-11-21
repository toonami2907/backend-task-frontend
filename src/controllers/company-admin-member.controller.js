import mongoose from 'mongoose';
import Admin from '../models/admin.model.js';
import Role from '../models/role.model.js';
import CompanyAdminMember from '../models/companyAdminMember.model.js';
import { PERMISSIONS } from '../constants/permissions.js';
import { CatchAsync } from '../middleware/CatchAsync.js';
import { ensureCompanyPermission } from '../services/rbac/dashboard-rbac.service.js';

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

export const listCompanyAdminMembers = CatchAsync(async (req, res) => {
  const { companyId } = req.query;
  const adminId = req.user?._id;

  const access = await ensureCompanyPermission({
    adminId,
    companyId,
    permission: PERMISSIONS.DASHBOARD_ADMINS_MANAGE
  });

  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  const memberships = await CompanyAdminMember.find({
    company: companyId,
    status: { $in: ['active', 'disabled'] }
  })
    .populate('admin', 'fullName email')
    .populate('role', 'name target permissions')
    .sort({ createdAt: -1 });

  const owner = await Admin.findById(access.company.admin).select('fullName email');

  return res.status(200).json({
    count: memberships.length + (owner ? 1 : 0),
    owner: owner
      ? {
          id: owner._id,
          fullName: owner.fullName,
          email: owner.email,
          isOwner: true
        }
      : null,
    members: memberships.map((member) => ({
      id: member._id,
      admin: member.admin,
      role: member.role,
      status: member.status,
      isOwner: false,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt
    }))
  });
});

export const grantCompanyAdminAccess = CatchAsync(async (req, res) => {
  const { companyId, email, roleId } = req.body;
  const adminId = req.user?._id;
  const normalizedEmail = normalizeEmail(email);

  if (!companyId || !normalizedEmail || !roleId) {
    return res.status(400).json({ error: 'companyId, email and roleId are required' });
  }

  const access = await ensureCompanyPermission({
    adminId,
    companyId,
    permission: PERMISSIONS.DASHBOARD_ADMINS_MANAGE
  });

  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  if (!mongoose.Types.ObjectId.isValid(String(roleId))) {
    return res.status(400).json({ error: 'Invalid role ID' });
  }

  const role = await Role.findOne({ _id: roleId, company: companyId });
  if (!role) {
    return res.status(404).json({ error: 'Role not found for this company' });
  }
  if (role.target !== 'dashboard') {
    return res.status(400).json({ error: 'Only dashboard roles can be assigned to dashboard members' });
  }
  if (role.isOwner) {
    return res.status(400).json({ error: 'Owner role cannot be assigned via membership' });
  }

  const targetAdmin = await Admin.findOne({ email: normalizedEmail });
  if (!targetAdmin) {
    return res.status(404).json({
      error: 'Admin account not found. Ask the user to create an admin account first.'
    });
  }

  if (String(targetAdmin._id) === String(access.company.admin)) {
    return res.status(400).json({ error: 'Company owner already has full access' });
  }

  const membership = await CompanyAdminMember.findOneAndUpdate(
    {
      company: companyId,
      admin: targetAdmin._id
    },
    {
      role: role._id,
      status: 'active',
      invitedBy: adminId,
      lastUpdatedBy: adminId
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  )
    .populate('admin', 'fullName email')
    .populate('role', 'name target permissions');

  return res.status(200).json({
    message: 'Dashboard manager access granted',
    membership
  });
});

export const updateCompanyAdminAccess = CatchAsync(async (req, res) => {
  const { membershipId } = req.params;
  const { roleId, status } = req.body;
  const adminId = req.user?._id;

  if (!mongoose.Types.ObjectId.isValid(String(membershipId || ''))) {
    return res.status(400).json({ error: 'Invalid membership ID' });
  }

  const membership = await CompanyAdminMember.findById(membershipId);
  if (!membership) {
    return res.status(404).json({ error: 'Membership not found' });
  }

  const access = await ensureCompanyPermission({
    adminId,
    companyId: membership.company,
    permission: PERMISSIONS.DASHBOARD_ADMINS_MANAGE
  });
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  if (roleId) {
    if (!mongoose.Types.ObjectId.isValid(String(roleId))) {
      return res.status(400).json({ error: 'Invalid role ID' });
    }
    const role = await Role.findOne({ _id: roleId, company: membership.company });
    if (!role) {
      return res.status(404).json({ error: 'Role not found for this company' });
    }
    if (role.target !== 'dashboard') {
      return res.status(400).json({ error: 'Only dashboard roles can be assigned to dashboard members' });
    }
    if (role.isOwner) {
      return res.status(400).json({ error: 'Owner role cannot be assigned via membership' });
    }
    membership.role = role._id;
  }

  if (status) {
    if (!['active', 'disabled'].includes(status)) {
      return res.status(400).json({ error: "status must be 'active' or 'disabled'" });
    }
    membership.status = status;
  }

  membership.lastUpdatedBy = adminId;
  await membership.save();

  const populated = await CompanyAdminMember.findById(membership._id)
    .populate('admin', 'fullName email')
    .populate('role', 'name target permissions');

  return res.status(200).json({
    message: 'Dashboard manager updated',
    membership: populated
  });
});

export const revokeCompanyAdminAccess = CatchAsync(async (req, res) => {
  const { membershipId } = req.params;
  const adminId = req.user?._id;

  if (!mongoose.Types.ObjectId.isValid(String(membershipId || ''))) {
    return res.status(400).json({ error: 'Invalid membership ID' });
  }

  const membership = await CompanyAdminMember.findById(membershipId);
  if (!membership) {
    return res.status(404).json({ error: 'Membership not found' });
  }

  const access = await ensureCompanyPermission({
    adminId,
    companyId: membership.company,
    permission: PERMISSIONS.DASHBOARD_ADMINS_MANAGE
  });
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  await CompanyAdminMember.findByIdAndDelete(membershipId);

  return res.status(200).json({
    message: 'Dashboard manager access revoked'
  });
});
