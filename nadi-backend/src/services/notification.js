const supabase = require('../utils/supabase');
const { sendEmail } = require('./email');
const { sendSMS } = require('./sms');
const logger = require('../utils/logger');

// Check if current time falls within quiet hours.
// Handles overnight ranges (e.g. 22:00 - 07:00) correctly.
function isQuietHours(quietHoursConfig) {
  if (!quietHoursConfig?.enabled) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  
  const [startH, startM] = quietHoursConfig.start.split(':').map(Number);
  const [endH, endM] = quietHoursConfig.end.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    // Same-day range (e.g., 09:00 - 17:00)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight range (e.g., 22:00 - 07:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

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
    const { data: preferences } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user)
      .maybeSingle();
    
    // Check quiet hours — suppress non-inApp channels during quiet hours
    if (isQuietHours(preferences?.quiet_hours)) {
      channels = { ...channels, email: false, sms: false, push: false };
    }

    // Create in-app notification
    if (channels.inApp) {
      await supabase
        .from('notifications')
        .insert({
          user_id: user,
          type,
          title,
          message,
          related_to: relatedTo,
          action,
          channels,
          priority
        });
    }

    // Send email/SMS notification if configured
    const prefVal = preferences?.preferences?.[type];
    const emailPref = prefVal?.email !== false;
    const smsPref = prefVal?.sms !== false;

    if ((channels.email && emailPref) || (channels.sms && smsPref)) {
      const { data: userRecord } = await supabase
        .from('users')
        .select('email', 'phone')
        .eq('id', user)
        .maybeSingle();

      if (userRecord) {
        if (channels.email && emailPref) {
          await sendEmail({
            to: userRecord.email,
            subject: title,
            template: 'notification',
            data: { title, message }
          }).catch(err => logger.error('Email notification failed:', err));
        }

        if (channels.sms && smsPref) {
          await sendSMS({
            to: userRecord.phone,
            message: `${title}: ${message}`
          }).catch(err => logger.error('SMS notification failed:', err));
        }
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
      user_id: user,
      type,
      title,
      message,
      channels,
      status: 'pending'
    }));

    await supabase.from('notifications').insert(notifications);

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
