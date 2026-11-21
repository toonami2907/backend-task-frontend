import Company from "../models/Company.model.js";
import Admin from "../models/admin.model.js";
import Role from "../models/role.model.js";
import CompanyAdminMember from "../models/companyAdminMember.model.js";
import { DEFAULT_ROLES } from "../constants/roleDefaults.js";
import { PERMISSIONS } from "../constants/permissions.js";
import { CatchAsync } from "../middleware/CatchAsync.js";
import {
  ensureCompanyPermission,
  getAdminCompanyAccess
} from "../services/rbac/dashboard-rbac.service.js";

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Create a new company
 * @route POST /api/companies
 * @access Admin only
 */
export const createCompany = CatchAsync(async (req, res) => {
  const { name, nature, natureOther, settings } = req.body;
  const adminId = req.user._id; // Get the admin ID from the authenticated user

  // Validate required fields
  if (!name || !nature) {
    return res.status(400).json({ error: "Company name and nature are required" });
  }

  // Check if company with same name already exists
  // const existingCompany = await Company.findOne({ 
  //   name: { $regex: new RegExp(`^${name}$`, 'i') } 
  // });
  
  // if (existingCompany) {
  //   return res.status(409).json({ error: "A company with this name already exists" });
  // }

  // Create new company
  const company = await Company.create({
    name,
    nature,
    natureOther: natureOther || null,
    admin: adminId, // Link the company to the admin who created it
    teams: [],
    settings: {
      timezone: settings?.timezone || "UTC",
      defaultReminderIntervalMinutes: settings?.defaultReminderIntervalMinutes ?? 60,
      requireCompletionApproval: settings?.requireCompletionApproval ?? true
    }
  });

  // Update the admin's company reference
  await Admin.findByIdAndUpdate(adminId, { 
    company: company._id,
    $addToSet: { companies: company._id }
  });

  // Create default roles for this company
  const createdRoles = await Role.insertMany(
    DEFAULT_ROLES.map(role => ({
      ...role,
      company: company._id
    }))
  );

  const ownerRole = createdRoles.find((role) => role.isOwner && role.target === "dashboard");
  if (ownerRole) {
    await CompanyAdminMember.findOneAndUpdate(
      { company: company._id, admin: adminId },
      {
        role: ownerRole._id,
        status: "active",
        invitedBy: adminId,
        lastUpdatedBy: adminId
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }

  return res.status(201).json({
    message: "Company created successfully",
    company: {
      id: company._id,
      name: company.name,
      nature: company.nature,
      natureOther: company.natureOther,
      admin: adminId,
      teams: company.teams,
      settings: company.settings,
      createdAt: company.createdAt
    }
  });
});

/**
 * Get all companies
 * @route GET /api/companies
 * @access Admin only
 */
  export const getAllCompanies = CatchAsync(async (req, res) => {
  const adminId = req.user._id;
  const ownedCompanies = await Company.find({ admin: adminId }).sort({ createdAt: -1 });
  const memberships = await CompanyAdminMember.find({
    admin: adminId,
    status: "active"
  }).select("company");

  const membershipCompanyIds = memberships.map((membership) => membership.company);
  const memberCompanies =
    membershipCompanyIds.length > 0
      ? await Company.find({
          _id: { $in: membershipCompanyIds },
          admin: { $ne: adminId }
        }).sort({ createdAt: -1 })
      : [];

  const companyMap = new Map();
  [...ownedCompanies, ...memberCompanies].forEach((company) => {
    companyMap.set(String(company._id), company);
  });
  const companies = Array.from(companyMap.values()).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  
  return res.status(200).json({
    count: companies.length,
    companies: companies.map(company => ({
      id: company._id,
      name: company.name,
      nature: company.nature,
      natureOther: company.natureOther,
      teamsCount: company.teams.length,
      settings: company.settings,
      createdAt: company.createdAt
    }))
  });
});

/**
 * Get company by ID
 * @route GET /api/companies/:id
 * @access Admin only
 */
export const getCompanyById = CatchAsync(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user._id;

  const access = await getAdminCompanyAccess({ adminId, companyId: id });
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  const company = await Company.findById(id).populate("teams");

  return res.status(200).json({
    company: {
      id: company._id,
      name: company.name,
      nature: company.nature,
      natureOther: company.natureOther,
      teams: company.teams,
      employees: company.employees,
      jobs: company.jobs,
      settings: company.settings,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt
    }
  });
});


/**
 * Update company
 * @route PUT /api/companies/:id
 * @access Admin only
 */
export const updateCompany = CatchAsync(async (req, res) => {
  const { id } = req.params;
  const { name, nature, natureOther, settings } = req.body;
  const adminId = req.user._id;
  
  // Validate at least one field to update
  if (!name && !nature && !settings && typeof natureOther === "undefined") {
    return res.status(400).json({ error: "At least one field (name, nature, or settings) is required for update" });
  }
  
  const updatesCompanyMeta = Boolean(name || nature || typeof natureOther !== "undefined");
  const requiredPermission = updatesCompanyMeta
    ? PERMISSIONS.COMPANY_MANAGE
    : PERMISSIONS.SETTINGS_MANAGE;
  const access = await ensureCompanyPermission({
    adminId,
    companyId: id,
    permission: requiredPermission
  });
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  const company = await Company.findById(id);
  
  // Check if new name already exists (if name is being updated)
  if (name && name !== company.name) {
    const existingCompany = await Company.findOne({
      _id: { $ne: id },
      name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') }
    });
    
    if (existingCompany) {
      return res.status(409).json({ error: "A company with this name already exists" });
    }
  }
  
  // Update company
  const updatedCompany = await Company.findByIdAndUpdate(
    id,
    {
      ...(name && { name }),
      ...(nature && { nature }),
      ...(typeof natureOther !== "undefined" && { natureOther }),
      ...(settings && { settings: { ...(company.settings?.toObject?.() || company.settings || {}), ...settings } })
    },
    { new: true }
  );
  
  return res.status(200).json({
    message: "Company updated successfully",
    company: {
      id: updatedCompany._id,
      name: updatedCompany.name,
      nature: updatedCompany.nature,
      natureOther: updatedCompany.natureOther,
      teams: updatedCompany.teams,
      settings: updatedCompany.settings,
      updatedAt: updatedCompany.updatedAt
    }
  });
});


/**
 * Delete company
 * @route DELETE /api/companies/:id
 * @access Admin only
 */
export const deleteCompany = CatchAsync(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user._id;

  const access = await ensureCompanyPermission({
    adminId,
    companyId: id,
    permission: PERMISSIONS.COMPANY_MANAGE
  });
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }
  if (!access.isOwner) {
    return res.status(403).json({ error: "Only the company owner can delete a company" });
  }

  const company = await Company.findById(id);
  
  // Check if company has teams
  if (company.teams.length > 0) {
    return res.status(400).json({
      error: "Cannot delete company with existing teams. Please remove all teams first."
    });
  }
  
  await Company.findByIdAndDelete(id);
  await CompanyAdminMember.deleteMany({ company: id });
  
  return res.status(200).json({
    message: "Company deleted successfully",
    id
  });
});


/**
 * Add team to company
 * @route POST /api/companies/:id/teams
 * @access Admin only
 */
export const addTeamToCompany = CatchAsync(async (req, res) => {
  const { id } = req.params;
  const { teamId } = req.body;
  const adminId = req.user._id;
  
  if (!teamId) {
    return res.status(400).json({ error: "Team ID is required" });
  }
  
  const access = await ensureCompanyPermission({
    adminId,
    companyId: id,
    permission: PERMISSIONS.TEAMS_MANAGE
  });
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  const company = await Company.findById(id);
  
  // Check if team already exists in company
  if (company.teams.includes(teamId)) {
    return res.status(409).json({ error: "Team already exists in this company" });
  }
  
  // Add team to company
  company.teams.push(teamId);
  await company.save();
  
  return res.status(200).json({
    message: "Team added to company successfully",
    company: {
      id: company._id,
      name: company.name,
      teams: company.teams
    }
  });
});

export const removeTeamFromCompany = CatchAsync(async (req, res) => {
  const { id, teamId } = req.params;
  const adminId = req.user._id;

  const access = await ensureCompanyPermission({
    adminId,
    companyId: id,
    permission: PERMISSIONS.TEAMS_MANAGE
  });
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  const company = await Company.findById(id);
  
  // Check if team exists in company
  if (!company.teams.includes(teamId)) {
    return res.status(404).json({ error: "Team not found in this company" });
  }
  
  // Remove team from company
  company.teams = company.teams.filter(team => team.toString() !== teamId);
  await company.save();
  
  return res.status(200).json({
    message: "Team removed from company successfully",
    company: {
      id: company._id,
      name: company.name,
      teams: company.teams
    }
  });
});

/**
 * Remove team from company
 * @route DELETE /api/companies/:id/teams/:teamId
 * @access Admin only
 */
