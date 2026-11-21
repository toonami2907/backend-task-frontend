import mongoose from 'mongoose';
const teamSchema = new mongoose.Schema({
    name: { type: String, required: true },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    employees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }],
  },{
    timestamps: true,
  });
  
  const Team = mongoose.model('Team', teamSchema);
  export default Team;