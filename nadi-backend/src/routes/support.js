const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

const { auth } = require('../middleware/auth');
const logger = require('../utils/logger');

// @route   POST /api/v1/support/tickets
// @desc    Create a support ticket
// @access  Private
router.post('/tickets', auth, [
  body('subject').trim().notEmpty().withMessage('Subject is required'),
  body('message').trim().notEmpty().withMessage('Message is required'),
  body('category').isIn(['account', 'payment', 'transaction', 'technical', 'other']).withMessage('Valid category is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    // TODO: Create support ticket in database
    res.status(501).json({ success: false, message: 'Support tickets coming soon. Email support@nadidigital.com' });
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
    res.json({ success: true, tickets: [] });
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
    res.status(404).json({ success: false, message: 'Ticket not found' });
  } catch (error) {
    logger.error('Get ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch ticket' });
  }
});

// @route   POST /api/v1/support/tickets/:id/reply
// @desc    Reply to a ticket
// @access  Private
router.post('/tickets/:id/reply', auth, [
  body('message').trim().notEmpty().withMessage('Message is required')
], async (req, res) => {
  try {
    res.status(501).json({ success: false, message: 'Ticket replies coming soon' });
  } catch (error) {
    logger.error('Reply to ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to reply' });
  }
});

// @route   GET /api/v1/support/faqs
// @desc    Get FAQs
// @access  Public
router.get('/faqs', async (req, res) => {
  try {
    const faqs = [
      { id: 1, category: 'account', question: 'How do I create an account?', answer: 'Click Sign Up on the homepage and fill in your details.' },
      { id: 2, category: 'payment', question: 'How do I fund my wallet?', answer: 'Go to My Wallet and select Add Money. Choose your preferred payment method.' },
      { id: 3, category: 'payment', question: 'What payment methods are supported?', answer: 'We support debit cards, bank transfers, USSD, and cryptocurrency.' },
      { id: 4, category: 'transaction', question: 'How long do transfers take?', answer: 'Wallet-to-wallet transfers are instant. Bank withdrawals take 1-24 hours.' },
      { id: 5, category: 'security', question: 'How is my account secured?', answer: 'We use bank-grade encryption, 2FA, and transaction PINs to protect your account.' },
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
    // TODO: Full-text search on FAQ collection
    res.json({ success: true, faqs: [], query: q });
  } catch (error) {
    logger.error('Search FAQs error:', error);
    res.status(500).json({ success: false, message: 'Failed to search FAQs' });
  }
});

module.exports = router;
