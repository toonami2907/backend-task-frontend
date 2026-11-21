import mongoose from 'mongoose';

const companyAdminMemberSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }
  },
  { timestamps: true }
);

companyAdminMemberSchema.index({ company: 1, admin: 1 }, { unique: true });

const CompanyAdminMember = mongoose.model('CompanyAdminMember', companyAdminMemberSchema);
export default CompanyAdminMember;
