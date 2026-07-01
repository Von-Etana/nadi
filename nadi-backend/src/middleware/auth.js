const supabase = require('../utils/supabase');
const logger = require('../utils/logger');

// Verify JWT token with Supabase
const auth = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    // Check for token in cookies
    else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    // Verify token directly with Supabase
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authUser) {
      return res.status(401).json({
        success: false,
        message: authError ? authError.message : 'Invalid or expired token'
      });
    }

    // Fetch user details from public.users table
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (profileError || !userProfile) {
      logger.warn(`User profile not found in public.users for auth user: ${authUser.id}`);
      return res.status(401).json({
        success: false,
        message: 'User profile not found'
      });
    }

    if (!userProfile.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Account has been deactivated'
      });
    }

    // Attach user profile, auth user information, and token to request
    req.user = {
      ...userProfile,
      _id: userProfile.id,
      id: userProfile.id
    };
    req.authUser = authUser;
    req.token = token;
    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Authorize by role
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.'
      });
    }
    next();
  };
};

// Optional auth (for routes that work with or without auth)
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (token) {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
      if (!authError && authUser) {
        const { data: userProfile } = await supabase
          .from('users')
          .select('*')
          .eq('id', authUser.id)
          .single();

        if (userProfile && userProfile.is_active) {
          req.user = {
            ...userProfile,
            _id: userProfile.id,
            id: userProfile.id
          };
          req.authUser = authUser;
          req.token = token;
        }
      }
    }

    next();
  } catch (error) {
    // Continue without user
    next();
  }
};

module.exports = { auth, authorize, optionalAuth };
