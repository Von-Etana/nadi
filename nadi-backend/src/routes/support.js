const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

const supabase = require('../utils/supabase');
const { auth } = require('../middleware/auth');
const logger = require('../utils/logger');

const CATEGORIES = ['account', 'payment', 'transaction', 'technical', 'security', 'delivery', 'giftcard', 'fuel', 'utilities', 'crypto', 'other'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

function ticketReference() {
  return `SUP-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

function publicTicket(ticket) {
  if (!ticket) return ticket;
  const { admin_notes: _adminNotes, ...safeTicket } = ticket;
  return safeTicket;
}

// @route   POST /api/v1/support/tickets
// @desc    Create a support ticket
// @access  Private
router.post('/tickets', auth, [
  body('subject').trim().isLength({ min: 3, max: 160 }).withMessage('Subject must be 3-160 characters'),
  body('message').trim().isLength({ min: 5, max: 5000 }).withMessage('Message must be 5-5000 characters'),
  body('category').isIn(CATEGORIES).withMessage('Valid category is required'),
  body('priority').optional().isIn(PRIORITIES).withMessage('Valid priority is required'),
  body('attachments').optional().isArray({ max: 5 }).withMessage('Attachments must be a list of up to 5 items')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const ticketPayload = {
      user_id: req.user.id,
      reference: ticketReference(),
      subject: req.body.subject.trim(),
      message: req.body.message.trim(),
      category: req.body.category,
      priority: req.body.priority || 'normal',
      status: 'open',
      attachments: req.body.attachments || [],
      replies: []
    };

    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .insert(ticketPayload)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Support ticket created',
      ticket: publicTicket(ticket)
    });
  } catch (error) {
    logger.error('Create ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to create ticket' });
  }
});

// @route   GET /api/v1/support/tickets
// @desc    Get user's support tickets
// @access  Private
router.get('/tickets', auth, async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase
      .from('support_tickets')
      .select('*')
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data: tickets, error } = await query;
    if (error) throw error;

    res.json({
      success: true,
      tickets: (tickets || []).map(publicTicket)
    });
  } catch (error) {
    logger.error('Get tickets error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
  }
});

// @route   GET /api/v1/support/tickets/:id
// @desc    Get a specific ticket
// @access  Private
router.get('/tickets/:id', auth, async (req, res) => {
  try {
    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error || !ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    res.json({ success: true, ticket: publicTicket(ticket) });
  } catch (error) {
    logger.error('Get ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch ticket' });
  }
});

// @route   POST /api/v1/support/tickets/:id/reply
// @desc    Reply to a ticket
// @access  Private
router.post('/tickets/:id/reply', auth, [
  body('message').trim().isLength({ min: 1, max: 5000 }).withMessage('Message is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error || !ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (ticket.status === 'closed') {
      return res.status(400).json({ success: false, message: 'Closed tickets cannot receive replies' });
    }

    const replies = Array.isArray(ticket.replies) ? ticket.replies : [];
    const nextReplies = [
      ...replies,
      {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        authorId: req.user.id,
        authorType: 'customer',
        message: req.body.message.trim(),
        createdAt: new Date().toISOString()
      }
    ];

    const { data: updated, error: updateError } = await supabase
      .from('support_tickets')
      .update({
        replies: nextReplies,
        status: ticket.status === 'resolved' ? 'open' : ticket.status,
        updated_at: new Date().toISOString()
      })
      .eq('id', ticket.id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({
      success: true,
      message: 'Reply added',
      ticket: publicTicket(updated)
    });
  } catch (error) {
    logger.error('Reply to ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to reply' });
  }
});

// @route   POST /api/v1/support/tickets/:id/close
// @desc    Close own ticket
// @access  Private
router.post('/tickets/:id/close', auth, async (req, res) => {
  try {
    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .maybeSingle();

    if (error || !ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    res.json({ success: true, message: 'Ticket closed', ticket: publicTicket(ticket) });
  } catch (error) {
    logger.error('Close ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to close ticket' });
  }
});

// @route   GET /api/v1/support/faqs
// @desc    Get FAQs
// @access  Public
router.get('/faqs', async (req, res) => {
  try {
    const faqs = [
      { id: 1, category: 'account', question: 'How do I create an account?', answer: 'Click Sign Up on the homepage and fill in your details.' },
      { id: 2, category: 'payment', question: 'How do I fund my wallet?', answer: 'Go to My Wallet and select Add Money. Choose Flutterwave checkout.' },
      { id: 3, category: 'payment', question: 'What payment methods are supported?', answer: 'Wallet funding is handled through Flutterwave. Product purchases can use wallet balance and supported crypto where enabled.' },
      { id: 4, category: 'transaction', question: 'How long do transfers take?', answer: 'Wallet-to-wallet transfers are instant. Manual services show their latest status in your dashboard.' },
      { id: 5, category: 'security', question: 'How is my account secured?', answer: 'We use encrypted sessions, 2FA, and transaction PINs to protect your account.' }
    ];
    res.json({ success: true, faqs });
  } catch (error) {
    logger.error('Get FAQs error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch FAQs' });
  }
});

// @route   GET /api/v1/support/faqs/search
// @desc    Search FAQs
// @access  Public
router.get('/faqs/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ success: true, faqs: [] });

    const needle = String(q).toLowerCase();
    const faqs = [
      { id: 1, category: 'account', question: 'How do I create an account?', answer: 'Click Sign Up on the homepage and fill in your details.' },
      { id: 2, category: 'payment', question: 'How do I fund my wallet?', answer: 'Go to My Wallet and select Add Money. Choose Flutterwave checkout.' },
      { id: 3, category: 'security', question: 'How do I enable 2FA?', answer: 'Open Settings, use Security, then follow the 2FA setup flow.' }
    ].filter((faq) => `${faq.category} ${faq.question} ${faq.answer}`.toLowerCase().includes(needle));

    res.json({ success: true, faqs, query: q });
  } catch (error) {
    logger.error('Search FAQs error:', error);
    res.status(500).json({ success: false, message: 'Failed to search FAQs' });
  }
});

module.exports = router;
