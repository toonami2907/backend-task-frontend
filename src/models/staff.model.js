import mongoose from 'mongoose';

const staffSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
  teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
  status: { type: String, enum: ['invited', 'active', 'deleted'], default: 'invited' },
  emailVerified: { type: Boolean, default: false },
  refreshToken: { type: String }, // Added refreshToken field
  loginAttempts: { type: Number, default: 0 },
  blockedUntil: { type: Date },
  fcmToken: { type: String },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null }
},{
  timestamps: true,
});

const Staff = mongoose.model('Staff', staffSchema);
export default Staff;
