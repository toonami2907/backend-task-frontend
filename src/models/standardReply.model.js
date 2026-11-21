import mongoose from 'mongoose';

const standardReplySchema = new mongoose.Schema({
  text: { type: String, required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  createdAt: { type: Date, default: Date.now },
});

const StandardReply = mongoose.model('StandardReply', standardReplySchema);
export default StandardReply;