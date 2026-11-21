import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    name: { type: String, required: true },
    target: { type: String, enum: ['dashboard', 'worker'], default: 'worker' },
    permissions: [{ type: String }],
    isSystem: { type: Boolean, default: false },
    isOwner: { type: Boolean, default: false }
  },
  { timestamps: true }
);

roleSchema.index({ company: 1, name: 1 }, { unique: true });

const Role = mongoose.model('Role', roleSchema);
export default Role;
