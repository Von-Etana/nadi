const express = require('express');
const router = express.Router();

const supabase = require('../utils/supabase');
const { auth } = require('../middleware/auth');
const logger = require('../utils/logger');

// @route   GET /api/v1/notifications
// @desc    Get user notifications
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly } = req.query;
    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);

    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id);

    if (unreadOnly === 'true') {
      query = query.eq('is_read', false);
    }

    const startIdx = (parsedPage - 1) * parsedLimit;
    const endIdx = startIdx + parsedLimit - 1;

    const { data: notifications, count: total, error } = await query
      .order('created_at', { ascending: false })
      .range(startIdx, endIdx);

    if (error) throw error;

    // Get unread count
    const { count: unreadCount, error: countErr } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .eq('is_read', false);

    if (countErr) throw countErr;

    res.json({
      success: true,
      notifications,
      unreadCount: unreadCount || 0,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        pages: Math.ceil(total / parsedLimit)
      }
    });
  } catch (error) {
    logger.error('Get notifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
});

// @route   PATCH /api/v1/notifications/:id/read
// @desc    Mark notification as read
// @access  Private
router.patch('/:id/read', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
        status: 'read',
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    logger.error('Mark as read error:', error);
    res.status(500).json({ success: false, message: 'Failed to update notification' });
  }
});

// @route   POST /api/v1/notifications/read-all
// @desc    Mark all notifications as read
// @access  Private
router.post('/read-all', auth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
        status: 'read',
        updated_at: new Date().toISOString()
      })
      .eq('user_id', req.user.id)
      .eq('is_read', false);

    if (error) throw error;

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    logger.error('Mark all as read error:', error);
    res.status(500).json({ success: false, message: 'Failed to update notifications' });
  }
});

// @route   DELETE /api/v1/notifications/:id
// @desc    Delete a notification
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    logger.error('Delete notification error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete notification' });
  }
});

// @route   GET /api/v1/notifications/preferences
// @desc    Get notification preferences
// @access  Private
router.get('/preferences', auth, async (req, res) => {
  try {
    let { data: preferences, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) throw error;

    if (!preferences) {
      const { data: newPrefs, error: createError } = await supabase
        .from('notification_preferences')
        .insert({ user_id: req.user.id })
        .select()
        .single();

      if (createError) throw createError;
      preferences = newPrefs;
    }

    res.json({ success: true, preferences });
  } catch (error) {
    logger.error('Get preferences error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch preferences' });
  }
});

// @route   PUT /api/v1/notifications/preferences
// @desc    Update notification preferences
// @access  Private
router.put('/preferences', auth, async (req, res) => {
  try {
    const { data: preferences, error } = await supabase
      .from('notification_preferences')
      .update({
        ...req.body,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', req.user.id)
      .select()
      .maybeSingle();

    if (error) throw error;

    res.json({ success: true, message: 'Preferences updated', preferences });
  } catch (error) {
    logger.error('Update preferences error:', error);
    res.status(500).json({ success: false, message: 'Failed to update preferences' });
  }
});

module.exports = router;
