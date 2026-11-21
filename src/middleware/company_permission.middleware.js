import mongoose from "mongoose";
import Job from "../models/job.model.js";
import Team from "../models/team.model.js";
import { ensureCompanyPermission } from "../services/rbac/dashboard-rbac.service.js";

const invalidIdResponse = (res, label) => res.status(400).json({ error: `Invalid ${label}` });

const applyPermissionCheck = async ({ req, res, next, companyId, permission }) => {
  const access = await ensureCompanyPermission({
    adminId: req.user?._id,
    companyId,
    permission
  });
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error });
  }

  req.rbac = {
    companyId: String(companyId),
    isOwner: access.isOwner
  };
  return next();
};

export const requireCompanyPermission = ({ permission, resolveCompanyId, required = true }) => {
  return async (req, res, next) => {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) {
        if (!required) {
          return next();
        }
        return res.status(400).json({ error: "companyId is required" });
      }
      if (!mongoose.Types.ObjectId.isValid(String(companyId))) {
        return invalidIdResponse(res, "company ID");
      }
      return applyPermissionCheck({ req, res, next, companyId, permission });
    } catch (error) {
      return res.status(500).json({ error: "Permission check failed" });
    }
  };
};

export const requireJobPermission = ({ permission, resolveJobId }) => {
  return async (req, res, next) => {
    try {
      const jobId = resolveJobId(req);
      if (!jobId || !mongoose.Types.ObjectId.isValid(String(jobId))) {
        return invalidIdResponse(res, "job ID");
      }

      const job = await Job.findById(jobId).select("company");
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      return applyPermissionCheck({
        req,
        res,
        next,
        companyId: job.company,
        permission
      });
    } catch (error) {
      return res.status(500).json({ error: "Permission check failed" });
    }
  };
};

export const requireTaskPermission = ({ permission, resolveTaskId }) => {
  return async (req, res, next) => {
    try {
      const taskId = resolveTaskId(req);
      if (!taskId || !mongoose.Types.ObjectId.isValid(String(taskId))) {
        return invalidIdResponse(res, "task ID");
      }

      const job = await Job.findOne({ "tasks._id": taskId }).select("company");
      if (!job) {
        return res.status(404).json({ error: "Task not found" });
      }

      return applyPermissionCheck({
        req,
        res,
        next,
        companyId: job.company,
        permission
      });
    } catch (error) {
      return res.status(500).json({ error: "Permission check failed" });
    }
  };
};

export const requireTeamPermission = ({ permission, resolveTeamId }) => {
  return async (req, res, next) => {
    try {
      const teamId = resolveTeamId(req);
      if (!teamId || !mongoose.Types.ObjectId.isValid(String(teamId))) {
        return invalidIdResponse(res, "team ID");
      }

      const team = await Team.findById(teamId).select("company");
      if (!team) {
        return res.status(404).json({ error: "Team not found" });
      }

      return applyPermissionCheck({
        req,
        res,
        next,
        companyId: team.company,
        permission
      });
    } catch (error) {
      return res.status(500).json({ error: "Permission check failed" });
    }
  };
};
