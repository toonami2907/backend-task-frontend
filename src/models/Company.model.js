import mongoose from "mongoose";

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    nature: { type: String, required: true },
    natureOther: { type: String, default: null },
    admin: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Admin",
      required: true 
    },
    teams: [{ type: mongoose.Schema.Types.ObjectId, ref: "Team" }],
    employees: [{ type: mongoose.Schema.Types.ObjectId, ref: "Employee" }],
    jobs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Job" }],
    settings: {
      timezone: { type: String, default: "UTC" },
      defaultReminderIntervalMinutes: { type: Number, default: 60 },
      requireCompletionApproval: { type: Boolean, default: true }
    }
  },
  {
    timestamps: true,
  }
);

const Company = mongoose.models.Company || mongoose.model("Company", companySchema);
export default Company;

