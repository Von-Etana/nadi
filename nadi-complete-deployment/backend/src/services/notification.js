const { Notification, NotificationPreference } = require('../models');
const { sendEmail } = require('./email');
const { sendSMS } = require('./sms');
const logger = require('../utils/logger');

// Create notification
const createNotification = async ({
  user,
  type,
  title,
  message,
  relatedTo,
  action,
  channels = { inApp: true },
  priority = 'normal'
}) => {
  try {
    // Get user preferences
    const preferences = await NotificationPreference.findOne({ user });
    
    // Check quiet hours
    if (preferences?.quietHours?.enabled) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const { start, end } = preferences.quietHours;
      
      if (currentTime >= start || currentTime <= end) {
        // Only in-app notifications during quiet hours
        channels.email = false;
        channels.sms = false;
        channels.push = false;
      }
    }

    // Create in-app notification
    if (channels.inApp) {
      await Notification.create({
        user,
        type,
        title,
        message,
        relatedTo,
        action,
        channels,
        priority
      });
    }

    // Send email notification
    if (channels.email && preferences?.preferences?.[type]?.email !== false) {
      const userRecord = await require('../models').User.findById(user);
      if (userRecord) {
        await sendEmail({
          to: userRecord.email,
          subject: title,
          template: 'notification',
          data: { title, message }
        }).catch(err => logger.error('Email notification failed:', err));
      }
    }

    // Send SMS notification
    if (channels.sms && preferences?.preferences?.[type]?.sms !== false) {
      const userRecord = await require('../models').User.findById(user);
      if (userRecord) {
        await sendSMS({
          to: userRecord.phone,
          message: `${title}: ${message}`
        }).catch(err => logger.error('SMS notification failed:', err));
      }
    }

    return { success: true };
  } catch (error) {
    logger.error('Create notification error:', error);
    return { success: false, error: error.message };
  }
};

// Send bulk notifications (for admins)
const sendBulkNotifications = async ({
  users,
  type,
  title,
  message,
  channels = { inApp: true }
}) => {
  try {
    const notifications = users.map(user => ({
      user,
      type,
      title,
      message,
      channels,
      status: 'pending'
    }));

    await Notification.insertMany(notifications);

    return { success: true, count: users.length };
  } catch (error) {
    logger.error('Bulk notification error:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  createNotification,
  sendBulkNotifications
};
