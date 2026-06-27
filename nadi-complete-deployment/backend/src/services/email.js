const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

// Email templates
const templates = {
  'email-verification': (data) => ({
    subject: 'Verify Your Email - Nadi Digital Service',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #ea580c, #f97316); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Nadi Digital Service</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333;">Hello ${data.name},</h2>
          <p style="color: #666; font-size: 16px;">Thank you for signing up! Please verify your email address to complete your registration.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.verifyUrl}" style="background: linear-gradient(135deg, #ea580c, #f97316); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a>
          </div>
          <p style="color: #999; font-size: 14px;">Or copy and paste this link: ${data.verifyUrl}</p>
          <p style="color: #999; font-size: 14px;">This link will expire in 24 hours.</p>
        </div>
        <div style="padding: 20px; text-align: center; background: #333; color: #999; font-size: 12px;">
          <p>© ${new Date().getFullYear()} Nadi Digital Service. All rights reserved.</p>
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
          <h2 style="color: #333;">Hello ${data.name},</h2>
          <p style="color: #666; font-size: 16px;">We received a request to reset your password. Click the button below to create a new password.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.resetUrl}" style="background: linear-gradient(135deg, #ea580c, #f97316); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
          </div>
          <p style="color: #999; font-size: 14px;">This link will expire in 1 hour.</p>
          <p style="color: #999; font-size: 14px;">If you didn't request this, please ignore this email.</p>
        </div>
        <div style="padding: 20px; text-align: center; background: #333; color: #999; font-size: 12px;">
          <p>© ${new Date().getFullYear()} Nadi Digital Service. All rights reserved.</p>
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
          <h2 style="color: #333;">Hello ${data.name},</h2>
          <p style="color: #666; font-size: 16px;">Your password has been successfully changed.</p>
          <p style="color: #666; font-size: 16px;">If you didn't make this change, please contact our support team immediately.</p>
        </div>
        <div style="padding: 20px; text-align: center; background: #333; color: #999; font-size: 12px;">
          <p>© ${new Date().getFullYear()} Nadi Digital Service. All rights reserved.</p>
        </div>
      </div>
    `
  }),

  'notification': (data) => ({
    subject: data.title,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #ea580c, #f97316); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">Nadi Digital Service</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333;">${data.title}</h2>
          <p style="color: #666; font-size: 16px;">${data.message}</p>
        </div>
        <div style="padding: 20px; text-align: center; background: #333; color: #999; font-size: 12px;">
          <p>© ${new Date().getFullYear()} Nadi Digital Service. All rights reserved.</p>
        </div>
      </div>
    `
  })
};

// Send email
const sendEmail = async ({ to, subject, template, data, attachments }) => {
  try {
    const transporter = createTransporter();
    
    let emailContent;
    if (template && templates[template]) {
      emailContent = templates[template](data);
    } else {
      emailContent = { subject, html: data };
    }

    const mailOptions = {
      from: `"Nadi Digital Service" <${process.env.SMTP_USER}>`,
      to,
      subject: emailContent.subject || subject,
      html: emailContent.html,
      attachments
    };

    const result = await transporter.sendMail(mailOptions);
    logger.info(`Email sent to ${to}: ${result.messageId}`);
    
    return { success: true, messageId: result.messageId };
  } catch (error) {
    logger.error('Email sending error:', error);
    return { success: false, error: error.message };
  }
};

module.exports = { sendEmail };
