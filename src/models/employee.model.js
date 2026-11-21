import mongoose from 'mongoose';

const employeeSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true },
    staff: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    position: { type: String, required: true},
    teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', default: null },
    status: { type: String, enum: ['invited', 'active', 'deleted'], default: 'invited' },
    inviteToken: { type: String, default: null },
    inviteExpiresAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }
  },{
    timestamps: true,
  });

employeeSchema.index({ company: 1, email: 1 }, { unique: true });
  
  const Employee = mongoose.model('Employee', employeeSchema);
  export default Employee;
