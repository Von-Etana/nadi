const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');

const supabase = require('../utils/supabase');
const { auth } = require('../middleware/auth');
const { sendEmail } = require('../services/email');
const logger = require('../utils/logger');

// Anon-key client: MUST be used for all user-facing auth operations
// (signInWithPassword, updateUser, etc.) so Supabase enforces credential
// validation through the standard Auth API instead of the admin bypass.
const { createClient } = require('@supabase/supabase-js');
const anonSupabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

const rejectInvalidLogin = async (res) => {
  await Promise.resolve(anonSupabase.auth.signOut()).catch(() => undefined);
  return res.status(401).json({
    success: false,
    message: 'Invalid email or password'
  });
};

const hashBackupCode = (code) => crypto
  .createHash('sha256')
  .update(String(code).trim().toUpperCase())
  .digest('hex');

const createRecoveryClient = (accessToken) => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  }
);

// @route   POST /api/v1/auth/register
// @desc    Register new user
// @access  Public
router.post('/register', [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('phone').matches(/^\+?[1-9]\d{1,14}$/).withMessage('Valid phone number is required'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Must contain at least one uppercase letter')
    .matches(/[a-z]/).withMessage('Must contain at least one lowercase letter')
    .matches(/[0-9]/).withMessage('Must contain at least one number')
    .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Must contain at least one special character'),
  body('referralCode').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { firstName, lastName, email, phone, password, referralCode } = req.body;

    // Check if user exists in public.users
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .or(`email.eq.${email},phone.eq.${phone}`)
      .maybeSingle();

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or phone already exists'
      });
    }

    // Handle referrer
    let referredBy = null;
    if (referralCode) {
      const { data: referrer } = await supabase
        .from('users')
        .select('id')
        .eq('referral_code', referralCode)
        .maybeSingle();
      if (referrer) {
        referredBy = referrer.id;
      }
    }

    // Create user in Supabase Auth (which triggers pg trigger to create public user profile + wallet)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      phone,
      email_confirm: true,
      user_metadata: { firstName, lastName, phone }
    });

    if (authError || !authData.user) {
      return res.status(400).json({
        success: false,
        message: authError ? authError.message : 'Registration failed'
      });
    }

    const userId = authData.user.id;

    // Update referred_by if applicable
    if (referredBy) {
      await supabase
        .from('users')
        .update({ referred_by: referredBy })
        .eq('id', userId);

      // Call stored procedure to atomically append referral record and prevent race conditions
      const { error: rpcError } = await supabase.rpc('append_user_referral', {
        p_referrer_id: referredBy,
        p_referred_id: userId
      });
      
      if (rpcError) {
        logger.error('Failed to append user referral atomically:', rpcError);
      }
    }

    // Sign in user using anon client to get token (NOT service-role — must validate credentials)
    const { data: signInData, error: signInError } = await anonSupabase.auth.signInWithPassword({
      email,
      password
    });

    if (signInError || !signInData?.session?.access_token || !signInData?.session?.refresh_token) {
      logger.error('Sign-in error after registration:', signInError);
      return res.status(201).json({
        success: true,
        message: 'Registration successful. Please login.',
        user: {
          id: userId,
          firstName,
          lastName,
          email,
          phone,
          isEmailVerified: true
        }
      });
    }

    logger.info(`New user registered and authenticated: ${email}`);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token: signInData.session.access_token,
      refreshToken: signInData.session.refresh_token,
      user: {
        id: userId,
        firstName,
        lastName,
        email,
        phone,
        isEmailVerified: true
      }
    });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.'
    });
  }
});

// @route   POST /api/v1/auth/login
// @desc    Login user
// @access  Public
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { email, password, twoFactorCode } = req.body;

    // Fetch user profile from public.users to check account status and 2FA
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (userError || !user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (user.is_active === false) {
      await Promise.resolve(anonSupabase.auth.signOut()).catch(() => undefined);
      return res.status(403).json({
        success: false,
        message: 'Account has been deactivated'
      });
    }

    // Check lock status
    if (user.lock_until && new Date(user.lock_until) > new Date()) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked. Please try again later.'
      });
    }

    // Authenticate with Supabase Auth via anon client (NOT service-role — must validate credentials)
    const { data: authData, error: authError } = await anonSupabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      // Increment login attempts in database
      const attempts = (user.login_attempts || 0) + 1;
      const updates = { login_attempts: attempts };
      if (attempts >= 5) {
        updates.lock_until = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours
      }
      await supabase.from('users').update(updates).eq('id', user.id);

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (
      !authData?.user?.id ||
      authData.user.id !== user.id ||
      !authData?.session?.access_token ||
      !authData?.session?.refresh_token
    ) {
      return rejectInvalidLogin(res);
    }

    const userId = authData.user.id;

    // Check 2FA if enabled
    const twoFactor = user.two_factor_auth || {};
    if (twoFactor.enabled) {
      if (!twoFactorCode) {
        // Sign out right away to prevent unauthorized session
        await anonSupabase.auth.signOut();
        return res.status(403).json({
          success: false,
          message: 'Two-factor authentication required',
          requires2FA: true
        });
      }

      const verified = speakeasy.totp.verify({
        secret: twoFactor.secret,
        encoding: 'base32',
        token: twoFactorCode,
        window: 1
      });

      let usedBackupCode = false;
      if (!verified && Array.isArray(twoFactor.backupCodes) && twoFactorCode) {
        const hashedBackupCode = hashBackupCode(twoFactorCode);
        const backupCodeIndex = twoFactor.backupCodes.indexOf(hashedBackupCode);
        usedBackupCode = backupCodeIndex !== -1;
        if (usedBackupCode) {
          twoFactor.backupCodes = twoFactor.backupCodes.filter((_, index) => index !== backupCodeIndex);
          await supabase
            .from('users')
            .update({ two_factor_auth: twoFactor })
            .eq('id', user.id);
        }
      }

      if (!verified && !usedBackupCode) {
        await anonSupabase.auth.signOut();
        return res.status(401).json({
          success: false,
          message: 'Invalid 2FA code'
        });
      }
    }

    // Reset login attempts and set last login details
    await supabase.from('users').update({
      login_attempts: 0,
      lock_until: null,
      last_login: {
        ip: req.ip,
        device: req.headers['user-agent'],
        timestamp: new Date().toISOString()
      }
    }).eq('id', userId);

    logger.info(`User logged in: ${email}`);

    res.json({
      success: true,
      token: authData.session.access_token,
      refreshToken: authData.session.refresh_token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        phone: user.phone,
        isEmailVerified: user.is_email_verified,
        isPhoneVerified: user.is_phone_verified,
        kycStatus: user.kyc_status,
        role: user.role,
        twoFactorEnabled: twoFactor.enabled,
        referralCode: user.referral_code
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.'
    });
  }
});

// @route   POST /api/v1/auth/logout
// @desc    Logout user (Session handles token revocation natively in Supabase)
// @access  Private
router.post('/logout', auth, async (req, res) => {
  try {
    // Supabase handles session token invalidation natively via signout
    await supabase.auth.signOut();
    logger.info(`User logged out: ${req.user.email}`);
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
});

// @route   GET /api/v1/auth/profile
// @desc    Get user profile and wallet
// @access  Private
router.get('/profile', auth, async (req, res) => {
  try {
    const { data: wallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    res.json({
      success: true,
      user: {
        id: req.user.id,
        firstName: req.user.first_name,
        lastName: req.user.last_name,
        email: req.user.email,
        phone: req.user.phone,
        avatar: req.user.avatar,
        dateOfBirth: req.user.date_of_birth,
        address: req.user.address,
        kycStatus: req.user.kyc_status,
        role: req.user.role,
        isEmailVerified: req.user.is_email_verified,
        isPhoneVerified: req.user.is_phone_verified,
        twoFactorEnabled: req.user.two_factor_auth?.enabled || false,
        referralCode: req.user.referral_code,
        preferences: req.user.preferences,
        createdAt: req.user.created_at,
        wallet: wallet
      }
    });
  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile'
    });
  }
});

// @route   PUT /api/v1/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', auth, async (req, res) => {
  try {
    const allowedUpdates = ['firstName', 'lastName', 'dateOfBirth', 'address', 'preferences'];
    const updates = {};
    
    // Explicitly validate fields to prevent prototype pollution / injection (Issue M-1)
    if (req.body.firstName) updates.first_name = req.body.firstName;
    if (req.body.lastName) updates.last_name = req.body.lastName;
    if (req.body.dateOfBirth) updates.date_of_birth = req.body.dateOfBirth;
    
    if (req.body.address) {
      const { street, city, state, country, zipCode } = req.body.address;
      updates.address = { street, city, state, country, zipCode };
    }

    if (req.body.preferences) {
      const { currency, language, notifications } = req.body.preferences;
      updates.preferences = {
        currency: currency || 'NGN',
        language: language || 'en',
        notifications: {
          email: notifications?.email !== false,
          sms: notifications?.sms !== false,
          push: notifications?.push !== false,
          marketing: !!notifications?.marketing
        }
      };
    }

    const { data: user, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        preferences: user.preferences
      }
    });
  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

// @route   POST /api/v1/auth/change-password
// @desc    Change password
// @access  Private
router.post('/change-password', auth, [
  body('currentPassword').notEmpty(),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Must contain at least one uppercase letter')
    .matches(/[a-z]/).withMessage('Must contain at least one lowercase letter')
    .matches(/[0-9]/).withMessage('Must contain at least one number')
    .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Must contain at least one special character')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;

    // Verify current password by logging in again via anon client (NOT service-role)
    const { error: verifyError } = await anonSupabase.auth.signInWithPassword({
      email: req.user.email,
      password: currentPassword
    });

    if (verifyError) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password in Supabase Auth (using the user's client session via pre-instantiated anonSupabase)
    const { error: updateError } = await anonSupabase.auth.updateUser(
      { password: newPassword },
      { global: { headers: { Authorization: `Bearer ${req.token}` } } }
    );

    if (updateError) {
      return res.status(400).json({
        success: false,
        message: updateError.message
      });
    }

    // Revoke all sessions to force re-login (handled by admin API)
    await supabase.auth.admin.signOut(req.user.id);

    // Send email notification (SendGrid)
    await sendEmail({
      to: req.user.email,
      subject: 'Password Changed - Nadi Digital Service',
      template: 'password-changed',
      data: { name: req.user.first_name }
    });

    res.json({
      success: true,
      message: 'Password changed successfully. Please login again.'
    });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
});

// @route   POST /api/v1/auth/transaction-pin
// @desc    Set or change transaction PIN
// @access  Private
router.post('/transaction-pin', auth, [
  body('newPin').isLength({ min: 4, max: 4 }).matches(/^\d{4}$/).withMessage('New PIN must be exactly 4 digits'),
  body('currentPin').optional().isLength({ min: 4, max: 4 }).matches(/^\d{4}$/).withMessage('Current PIN must be exactly 4 digits')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { currentPin, newPin } = req.body;
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('transaction_pin')
      .eq('id', req.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return res.status(404).json({ success: false, message: 'User profile not found' });
    }

    if (profile.transaction_pin) {
      if (!currentPin) {
        return res.status(400).json({ success: false, message: 'Current PIN is required to change your transaction PIN' });
      }

      const isCurrentPinValid = await bcrypt.compare(currentPin, profile.transaction_pin);
      if (!isCurrentPinValid) {
        return res.status(401).json({ success: false, message: 'Current transaction PIN is incorrect' });
      }
    }

    const hashedPin = await bcrypt.hash(newPin, 12);
    const { error: updateError } = await supabase
      .from('users')
      .update({ transaction_pin: hashedPin, updated_at: new Date().toISOString() })
      .eq('id', req.user.id);

    if (updateError) throw updateError;

    res.json({
      success: true,
      message: profile.transaction_pin ? 'Transaction PIN changed successfully' : 'Transaction PIN set successfully'
    });
  } catch (error) {
    logger.error('Update transaction PIN error:', error);
    res.status(500).json({ success: false, message: 'Failed to update transaction PIN' });
  }
});

// @route   GET /api/v1/auth/transaction-pin/status
// @desc    Check if user has set a transaction PIN
// @access  Private
router.get('/transaction-pin/status', auth, async (req, res) => {
  try {
    const { data: profile } = await supabase
      .from('users')
      .select('transaction_pin')
      .eq('id', req.user.id)
      .maybeSingle();

    res.json({
      success: true,
      hasPin: Boolean(profile?.transaction_pin)
    });
  } catch (error) {
    logger.error('Check transaction PIN status error:', error);
    res.status(500).json({ success: false, message: 'Failed to check PIN status' });
  }
});

// @route   POST /api/v1/auth/transaction-pin/verify
// @desc    Verify transaction PIN for sensitive operations
// @access  Private
router.post('/transaction-pin/verify', auth, [
  body('pin').isLength({ min: 4, max: 4 }).matches(/^\d{4}$/).withMessage('PIN must be 4 digits')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { pin } = req.body;
    const { data: profile } = await supabase
      .from('users')
      .select('transaction_pin')
      .eq('id', req.user.id)
      .maybeSingle();

    if (!profile || !profile.transaction_pin) {
      return res.status(400).json({
        success: false,
        requiresPinSetup: true,
        message: 'You must set up a transaction PIN first'
      });
    }

    const isValid = await bcrypt.compare(pin, profile.transaction_pin);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid transaction PIN'
      });
    }

    res.json({ success: true, message: 'PIN verified successfully' });
  } catch (error) {
    logger.error('Verify transaction PIN error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify PIN' });
  }
});

// @route   POST /api/v1/auth/transaction-pin/reset-request
// @desc    Request OTP to reset forgotten transaction PIN
// @access  Private
router.post('/transaction-pin/reset-request', auth, async (req, res) => {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = Date.now() + 10 * 60 * 1000; // 10 mins

    const { data: userProfile } = await supabase
      .from('users')
      .select('preferences, email, phone, first_name')
      .eq('id', req.user.id)
      .maybeSingle();

    const preferences = userProfile?.preferences || {};
    preferences.security = preferences.security || {};
    preferences.security.pinResetOtp = otp;
    preferences.security.pinResetExpiry = expiry;

    await supabase
      .from('users')
      .update({ preferences })
      .eq('id', req.user.id);

    // Send OTP via Email & SMS
    await sendEmail({
      to: req.user.email,
      subject: 'Transaction PIN Reset OTP - Nadi Digital',
      template: 'notification',
      data: {
        title: 'Transaction PIN Reset Request',
        message: `Your one-time authorization code to reset your Nadi Transaction PIN is: ${otp}. Valid for 10 minutes. Do not share this code with anyone.`
      }
    }).catch(err => logger.warn('Failed to send PIN reset email:', err));

    if (userProfile?.phone) {
      await sendSMS({
        to: userProfile.phone,
        message: `Your Nadi Transaction PIN Reset code is: ${otp}. Valid for 10 mins.`
      }).catch(err => logger.warn('Failed to send PIN reset SMS:', err));
    }

    res.json({ success: true, message: 'Reset code sent to your registered email and phone' });
  } catch (error) {
    logger.error('PIN reset request error:', error);
    res.status(500).json({ success: false, message: 'Failed to initiate PIN reset' });
  }
});

// @route   POST /api/v1/auth/transaction-pin/reset-confirm
// @desc    Confirm OTP and set new transaction PIN
// @access  Private
router.post('/transaction-pin/reset-confirm', auth, [
  body('otp').isLength({ min: 6, max: 6 }).withMessage('Valid 6-digit OTP is required'),
  body('newPin').isLength({ min: 4, max: 4 }).matches(/^\d{4}$/).withMessage('New PIN must be 4 digits')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { otp, newPin } = req.body;
    const { data: userProfile } = await supabase
      .from('users')
      .select('preferences')
      .eq('id', req.user.id)
      .maybeSingle();

    const sec = userProfile?.preferences?.security;
    if (!sec || sec.pinResetOtp !== otp || Date.now() > sec.pinResetExpiry) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP code' });
    }

    const hashedPin = await bcrypt.hash(newPin, 12);
    const preferences = userProfile?.preferences || {};
    delete preferences.security.pinResetOtp;
    delete preferences.security.pinResetExpiry;

    await supabase
      .from('users')
      .update({
        transaction_pin: hashedPin,
        preferences,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.user.id);

    res.json({ success: true, message: 'Transaction PIN has been reset successfully' });
  } catch (error) {
    logger.error('PIN reset confirm error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset PIN' });
  }
});

// @route   POST /api/v1/auth/2fa/setup
// @desc    Setup 2FA
// @access  Private
router.post('/2fa/setup', auth, async (req, res) => {
  try {
    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `Nadi Digital (${req.user.email})`
    });

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    // Save secret temporarily in public.users (not enabled until verified)
    const twoFactor = req.user.two_factor_auth || {};
    twoFactor.secret = secret.base32;
    twoFactor.enabled = false;

    await supabase
      .from('users')
      .update({ two_factor_auth: twoFactor })
      .eq('id', req.user.id);

    res.json({
      success: true,
      secret: secret.base32,
      qrCode: qrCodeUrl
    });
  } catch (error) {
    logger.error('2FA setup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to setup 2FA'
    });
  }
});

// @route   POST /api/v1/auth/2fa/verify
// @desc    Verify and enable 2FA
// @access  Private
router.post('/2fa/verify', auth, async (req, res) => {
  try {
    const { code } = req.body;
    const twoFactor = req.user.two_factor_auth || {};

    if (!twoFactor.secret) {
      return res.status(400).json({
        success: false,
        message: '2FA setup has not been initialized'
      });
    }
    
    const verified = speakeasy.totp.verify({
      secret: twoFactor.secret,
      encoding: 'base32',
      token: code,
      window: 1
    });

    if (!verified) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }

    // Enable 2FA and generate backup codes
    twoFactor.enabled = true;
    
    const rawBackupCodes = Array.from({ length: 10 }, () => 
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );
    
    twoFactor.backupCodes = rawBackupCodes.map(code => 
      crypto.createHash('sha256').update(code).digest('hex')
    );
    
    await supabase
      .from('users')
      .update({ two_factor_auth: twoFactor })
      .eq('id', req.user.id);

    res.json({
      success: true,
      message: 'Two-factor authentication enabled',
      backupCodes: rawBackupCodes
    });
  } catch (error) {
    logger.error('2FA verify error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify 2FA'
    });
  }
});

// @route   POST /api/v1/auth/2fa/disable
// @desc    Disable 2FA
// @access  Private
router.post('/2fa/disable', auth, async (req, res) => {
  try {
    const { code } = req.body;
    const twoFactor = req.user.two_factor_auth || {};
    
    if (!twoFactor.enabled) {
      return res.status(400).json({
        success: false,
        message: '2FA is not enabled'
      });
    }

    const verified = speakeasy.totp.verify({
      secret: twoFactor.secret,
      encoding: 'base32',
      token: code,
      window: 1
    });

    if (!verified) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }

    // Disable 2FA
    await supabase
      .from('users')
      .update({ two_factor_auth: { enabled: false } })
      .eq('id', req.user.id);

    res.json({
      success: true,
      message: 'Two-factor authentication disabled'
    });
  } catch (error) {
    logger.error('2FA disable error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to disable 2FA'
    });
  }
});

// @route   POST /api/v1/auth/forgot-password
// @desc    Forgot password
// @access  Public
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail()
], async (req, res) => {
  try {
    const { email } = req.body;
    
    // Check if user exists in our DB
    const { data: user } = await supabase
      .from('users')
      .select('id, first_name')
      .eq('email', email)
      .maybeSingle();

    if (!user) {
      // Don't reveal account existence for security
      return res.json({
        success: true,
        message: 'If an account exists, a reset link has been sent'
      });
    }

    // Trigger Supabase Auth Password Reset
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password`
    });

    if (error) throw error;

    res.json({
      success: true,
      message: 'If an account exists, a reset link has been sent'
    });
  } catch (error) {
    logger.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process request'
    });
  }
});

// @route   POST /api/v1/auth/reset-password
// @desc    Reset password (Supabase Auth flow handles reset password verification natively via frontend session)
// @access  Public
router.post('/reset-password', [
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Must contain at least one uppercase letter')
    .matches(/[a-z]/).withMessage('Must contain at least one lowercase letter')
    .matches(/[0-9]/).withMessage('Must contain at least one number')
    .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Must contain at least one special character')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { password, token, refreshToken } = req.body;
    const bearerToken = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : null;
    const accessToken = token || bearerToken;

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        message: 'Reset token is required'
      });
    }

    const recoveryClient = createRecoveryClient(accessToken);

    if (refreshToken) {
      const { error: sessionError } = await recoveryClient.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      if (sessionError) {
        return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
      }
    }

    const { data: authUserData, error: authUserError } = await recoveryClient.auth.getUser(accessToken);
    if (authUserError || !authUserData?.user?.id) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    const { error: updateError } = await recoveryClient.auth.updateUser({ password });
    if (updateError) throw updateError;

    await Promise.resolve(recoveryClient.auth.signOut()).catch(() => undefined);

    res.json({
      success: true,
      message: 'Password reset successful. Please login with your new password.'
    });
  } catch (error) {
    logger.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
});

module.exports = router;
