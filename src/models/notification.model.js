import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  recipient: { 
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'recipientModel'
  },
  recipientModel: {
    type: String,
    required: true,
    enum: ['Admin', 'Staff']
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    default: null
  },
  title: { 
    type: String, 
    required: true 
  },
  message: { 
    type: String, 
    required: true 
  },
  type: { 
    type: String, 
    enum: ['message', 'task_update', 'team_assignment', 'reminder', 'success', 'info', 'warning', 'error'], 
    default: 'info' 
  },
  read: { 
    type: Boolean, 
    default: false 
  },
  data: {
    type: Object,
    default: {}
  },
  createdAt: { 
    type: Date, 
    default: Date.now
  }
});

// Add index for faster queries
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
notificationSchema.index({ company: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
