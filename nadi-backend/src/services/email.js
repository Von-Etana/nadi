const { Resend } = require('resend');
const logger = require('../utils/logger');

const RESEND_API_KEY = process.env.RESEND_API_KEY;

let resend;
if (RESEND_API_KEY) {
  resend = new Resend(RESEND_API_KEY);
  logger.info('✅ Resend initialized successfully');
} else {
  logger.warn('⚠️  RESEND_API_KEY is missing from environment. Email sending will fail.');
}

// HTML-escape user-supplied data to prevent XSS in email clients
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Email templates — all user data is HTML-escaped
const templates = {
  'email-verification': (data) => ({
    subject: 'Verify Your Email - Nadi Digital Service',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #ea580c, #f97316); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Nadi Digital Service</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333;">Hello ${escapeHtml(data.name)},</h2>
          <p style="color: #666; font-size: 16px;">Thank you for signing up! Please verify your email address to complete your registration.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${escapeHtml(data.verifyUrl)}" style="background: linear-gradient(135deg, #ea580c, #f97316); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a>
          </div>
          <p style="color: #999; font-size: 14px;">Or copy and paste this link: ${escapeHtml(data.verifyUrl)}</p>
          <p style="color: #999; font-size: 14px;">This link will expire in 24 hours.</p>
        </div>
        <div style="padding: 20px; text-align: center; background: #333; color: #999; font-size: 12px;">
          <p>&copy; ${new Date().getFullYear()} Nadi Digital Service. All rights reserved.</p>
        </div>
      </div>
    `
  }),

  'password-reset': (data) => ({
    subject: 'Password Reset - Nadi Digital Service',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #ea580c, #f97316); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Nadi Digital Service</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333;">Hello ${escapeHtml(data.name)},</h2>
          <p style="color: #666; font-size: 16px;">We received a request to reset your password. Click the button below to create a new password.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${escapeHtml(data.resetUrl)}" style="background: linear-gradient(135deg, #ea580c, #f97316); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
          </div>
          <p style="color: #999; font-size: 14px;">This link will expire in 1 hour.</p>
          <p style="color: #999; font-size: 14px;">If you didn't request this, please ignore this email.</p>
        </div>
        <div style="padding: 20px; text-align: center; background: #333; color: #999; font-size: 12px;">
          <p>&copy; ${new Date().getFullYear()} Nadi Digital Service. All rights reserved.</p>
        </div>
      </div>
    `
  }),

  'password-changed': (data) => ({
    subject: 'Password Changed - Nadi Digital Service',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #ea580c, #f97316); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Nadi Digital Service</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333;">Hello ${escapeHtml(data.name)},</h2>
          <p style="color: #666; font-size: 16px;">Your password has been successfully changed.</p>
          <p style="color: #666; font-size: 16px;">If you didn't make this change, please contact our support team immediately.</p>
        </div>
        <div style="padding: 20px; text-align: center; background: #333; color: #999; font-size: 12px;">
          <p>&copy; ${new Date().getFullYear()} Nadi Digital Service. All rights reserved.</p>
        </div>
      </div>
    `
  }),

  'notification': (data) => ({
    subject: escapeHtml(data.title),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #ea580c, #f97316); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Nadi Digital Service</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333;">${escapeHtml(data.title)}</h2>
          <p style="color: #666; font-size: 16px;">${escapeHtml(data.message)}</p>
        </div>
        <div style="padding: 20px; text-align: center; background: #333; color: #999; font-size: 12px;">
          <p>&copy; ${new Date().getFullYear()} Nadi Digital Service. All rights reserved.</p>
        </div>
      </div>
    `
  })
};

// Send email via Resend
const sendEmail = async ({ to, subject, template, data, attachments }) => {
  try {
    if (!RESEND_API_KEY) {
      throw new Error('Resend API key not configured');
    }

    let emailContent;
    if (template && templates[template]) {
      emailContent = templates[template](data);
    } else {
      emailContent = { subject, html: typeof data === 'string' ? escapeHtml(data) : data };
    }

    const mailOptions = {
      from: process.env.RESEND_FROM_EMAIL || 'info@nadidigital.com',
      to,
      subject: emailContent.subject || subject,
      html: emailContent.html,
      attachments: attachments ? attachments.map(att => ({
        content: att.content,
        filename: att.filename,
        contentType: att.contentType
      })) : undefined
    };

    const { data: result, error } = await resend.emails.send(mailOptions);
    if (error) {
      throw error;
    }
    
    logger.info(`Email sent via Resend to ${to}`);
    return { success: true, response: result };
  } catch (error) {
    logger.error('Email sending error (Resend):', error);
    return { success: false, error: error.message };
  }
};

module.exports = { sendEmail, escapeHtml };
