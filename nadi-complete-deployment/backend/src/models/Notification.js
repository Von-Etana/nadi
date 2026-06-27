const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  // Recipient
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Notification Type
  type: {
    type: String,
    enum: [
      'transaction',      // Payment/transfer notifications
      'order',            // Order status updates
      'security',         // Login, password change, etc.
      'promotional',      // Marketing/promotions
      'system',           // System announcements
      'support',          // Support ticket updates
      'kyc',              // KYC verification updates
      'referral',         // Referral notifications
      'crypto',           // Crypto price alerts, etc.
      'reminder'          // Payment reminders, etc.
    ],
    required: true
  },
  
  // Title & Message
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  
  // Related Entity
  relatedTo: {
    model: { type: String, enum: ['Transaction', 'Order', 'User', 'SupportTicket', 'GiftCard'] },
    id: mongoose.Schema.Types.ObjectId
  },
  
  // Action (for clickable notifications)
  action: {
    type: { type: String, enum: ['url', 'screen', 'none'] },
    value: String // URL or screen name
  },
  
  // Delivery Channels
  channels: {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    sms: { type: Boolean, default: false },
    push: { type: Boolean, default: false }
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'failed', 'read'],
    default: 'pending'
  },
  
  // Read status
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  
  // Priority
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  
  // Expiry
  expiresAt: Date,
  
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes
notificationSchema.index({ user: 1, isRead: 1 });
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ status: 1 });

// Mark as read
notificationSchema.methods.markAsRead = async function() {
  this.isRead = true;
  this.readAt = new Date();
  this.status = 'read';
  return this.save();
};

module.exports = mongoose.model('Notification', notificationSchema);

// User Notification Preferences
const notificationPreferenceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  
  // Channel preferences by notification type
  preferences: {
    transaction: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
      push: { type: Boolean, default: true }
    },
    order: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      push: { type: Boolean, default: true }
    },
    security: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
      push: { type: Boolean, default: true }
    },
    promotional: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
      sms: { type: Boolean, default: false },
      push: { type: Boolean, default: false }
    },
    crypto: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
      sms: { type: Boolean, default: false },
      push: { type: Boolean, default: true }
    }
  },
  
  // Quiet hours
  quietHours: {
    enabled: { type: Boolean, default: false },
    start: { type: String, default: '22:00' }, // 10 PM
    end: { type: String, default: '07:00' }    // 7 AM
  },
  
  // Price alerts (for crypto)
  priceAlerts: [{
    asset: String,
    condition: { type: String, enum: ['above', 'below'] },
    price: Number,
    active: { type: Boolean, default: true }
  }]
}, {
  timestamps: true
});

module.exports.NotificationPreference = mongoose.model('NotificationPreference', notificationPreferenceSchema);
