const mockAnonAuth = {
  signInWithPassword: jest.fn(),
  signOut: jest.fn(),
  updateUser: jest.fn().mockResolvedValue({ data: {}, error: null }),
  setSession: jest.fn().mockResolvedValue({ data: {}, error: null }),
  getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
};

const mockCreateClient = jest.fn(() => ({
  auth: {
    ...mockAnonAuth
  }
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args) => mockCreateClient(...args)
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('../services/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(true)
}));

jest.mock('speakeasy', () => ({
  generateSecret: jest.fn(),
  totp: {
    verify: jest.fn()
  }
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn()
}));

jest.mock('express-validator', () => {
  const validator = jest.fn();
  validator.notEmpty = jest.fn().mockReturnValue(validator);
  validator.isLength = jest.fn().mockReturnValue(validator);
  validator.matches = jest.fn().mockReturnValue(validator);
  validator.isEmail = jest.fn().mockReturnValue(validator);
  validator.normalizeEmail = jest.fn().mockReturnValue(validator);
  validator.optional = jest.fn().mockReturnValue(validator);
  validator.trim = jest.fn().mockReturnValue(validator);
  validator.withMessage = jest.fn().mockReturnValue(validator);

  return {
    validationResult: jest.fn(() => ({
      isEmpty: () => true,
      array: () => []
    })),
    body: jest.fn(() => validator)
  };
});

const mockSupabase = {
  from: jest.fn(),
  rpc: jest.fn(),
  auth: {
    admin: {
      createUser: jest.fn()
    },
    signInWithPassword: jest.fn(),
    signOut: jest.fn(),
    resetPasswordForEmail: jest.fn(),
    setSession: jest.fn()
  }
};

jest.mock('../utils/supabase', () => mockSupabase);

const authRouter = require('./auth');
const speakeasy = require('speakeasy');
const crypto = require('crypto');

const getRouteHandler = (path, method = 'post') => {
  const layer = authRouter.stack.find(r => r.route?.path === path && r.route?.methods[method]);
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
};

describe('Auth Router Test Suite', () => {
  let req;
  let res;

  const setupMockReqRes = (body = {}) => {
    req = {
      body,
      params: {},
      query: {},
      headers: {},
      ip: '127.0.0.1'
    };
    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAnonAuth.updateUser.mockResolvedValue({ data: {}, error: null });
    mockAnonAuth.signOut.mockResolvedValue({ error: null });
  });

  describe('POST /register', () => {
    it('blocks duplicate email or phone registrations', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          or: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'existing-user' },
              error: null
            })
          }))
        }))
      });

      setupMockReqRes({
        firstName: 'Ada',
        lastName: 'Okafor',
        email: 'ada@example.com',
        phone: '+2348012345678',
        password: 'Password1!'
      });

      const handler = getRouteHandler('/register', 'post');
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'User with this email or phone already exists'
      });
      expect(mockSupabase.auth.admin.createUser).not.toHaveBeenCalled();
    });
  });

  describe('POST /login', () => {
    it('rejects invalid credentials without returning a token', async () => {
      const updateEq = jest.fn().mockResolvedValue({ data: {}, error: null });
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'users') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: {
                    id: 'user-1',
                    email: 'ada@example.com',
                    lock_until: null,
                    login_attempts: 0,
                    two_factor_auth: {}
                  },
                  error: null
                })
              }))
            })),
            update: jest.fn(() => ({
              eq: updateEq
            }))
          };
        }
        throw new Error(`Unexpected table ${table}`);
      });
      mockAnonAuth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' }
      });

      setupMockReqRes({
        email: 'ada@example.com',
        password: 'WrongPassword1!'
      });

      const handler = getRouteHandler('/login', 'post');
      await handler(req, res);

      expect(mockAnonAuth.signInWithPassword).toHaveBeenCalledWith({
        email: 'ada@example.com',
        password: 'WrongPassword1!'
      });
      expect(updateEq).toHaveBeenCalledWith('id', 'user-1');
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid email or password'
      });
    });

    it('rejects auth success without a session token', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'users') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: {
                    id: 'user-1',
                    email: 'ada@example.com',
                    lock_until: null,
                    login_attempts: 0,
                    two_factor_auth: {}
                  },
                  error: null
                })
              }))
            }))
          };
        }
        throw new Error(`Unexpected table ${table}`);
      });
      mockAnonAuth.signInWithPassword.mockResolvedValue({
        data: {
          user: { id: 'user-1' },
          session: null
        },
        error: null
      });

      setupMockReqRes({
        email: 'ada@example.com',
        password: 'Password1!'
      });

      const handler = getRouteHandler('/login', 'post');
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid email or password'
      });
    });

    it('rejects auth success for a different user profile', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'users') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: {
                    id: 'user-1',
                    email: 'ada@example.com',
                    lock_until: null,
                    login_attempts: 0,
                    two_factor_auth: {}
                  },
                  error: null
                })
              }))
            }))
          };
        }
        throw new Error(`Unexpected table ${table}`);
      });
      mockAnonAuth.signInWithPassword.mockResolvedValue({
        data: {
          user: { id: 'user-2' },
          session: {
            access_token: 'access-token',
            refresh_token: 'refresh-token'
          }
        },
        error: null
      });

      setupMockReqRes({
        email: 'ada@example.com',
        password: 'Password1!'
      });

      const handler = getRouteHandler('/login', 'post');
      await handler(req, res);

      expect(mockAnonAuth.signOut).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid email or password'
      });
    });

    it('returns 423 when the account is locked', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'user-1',
                email: 'locked@example.com',
                lock_until: new Date(Date.now() + 60_000).toISOString(),
                login_attempts: 5,
                two_factor_auth: {}
              },
              error: null
            })
          }))
        }))
      });

      setupMockReqRes({
        email: 'locked@example.com',
        password: 'Password1!'
      });

      const handler = getRouteHandler('/login', 'post');
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(423);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Account is temporarily locked. Please try again later.'
      });
      expect(mockAnonAuth.signInWithPassword).not.toHaveBeenCalled();
    });

    it('rejects deactivated accounts before issuing a session', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'user-1',
                email: 'inactive@example.com',
                is_active: false,
                lock_until: null,
                login_attempts: 0,
                two_factor_auth: {}
              },
              error: null
            })
          }))
        }))
      });

      setupMockReqRes({
        email: 'inactive@example.com',
        password: 'Password1!'
      });

      const handler = getRouteHandler('/login', 'post');
      await handler(req, res);

      expect(mockAnonAuth.signInWithPassword).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Account has been deactivated'
      });
    });

    it('requires a 2FA code when two-factor is enabled', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'user-2',
                email: 'mfa@example.com',
                lock_until: null,
                login_attempts: 0,
                two_factor_auth: {
                  enabled: true,
                  secret: 'BASE32SECRET'
                }
              },
              error: null
            })
          }))
        })),
        update: jest.fn(() => ({
          eq: jest.fn().mockResolvedValue({ data: {}, error: null })
        }))
      });
      mockAnonAuth.signInWithPassword.mockResolvedValue({
        data: {
          user: { id: 'user-2' },
          session: {
            access_token: 'access-token',
            refresh_token: 'refresh-token'
          }
        },
        error: null
      });

      setupMockReqRes({
        email: 'mfa@example.com',
        password: 'Password1!'
      });

      const handler = getRouteHandler('/login', 'post');
      await handler(req, res);

      expect(mockAnonAuth.signOut).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Two-factor authentication required',
        requires2FA: true
      });
      expect(speakeasy.totp.verify).not.toHaveBeenCalled();
    });

    it('accepts a 2FA backup code once and removes it from the profile', async () => {
      const hashedBackupCode = crypto.createHash('sha256').update('ABC12345').digest('hex');
      const updateEq = jest.fn().mockResolvedValue({ data: {}, error: null });
      const update = jest.fn(() => ({ eq: updateEq }));

      mockSupabase.from.mockImplementation((table) => {
        if (table === 'users') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: {
                    id: 'user-2',
                    first_name: 'Mfa',
                    last_name: 'User',
                    email: 'mfa@example.com',
                    phone: '+2348012345678',
                    lock_until: null,
                    login_attempts: 0,
                    two_factor_auth: {
                      enabled: true,
                      secret: 'BASE32SECRET',
                      backupCodes: [hashedBackupCode]
                    }
                  },
                  error: null
                })
              }))
            })),
            update
          };
        }
        throw new Error(`Unexpected table ${table}`);
      });
      mockAnonAuth.signInWithPassword.mockResolvedValue({
        data: {
          user: { id: 'user-2' },
          session: {
            access_token: 'access-token',
            refresh_token: 'refresh-token'
          }
        },
        error: null
      });
      speakeasy.totp.verify.mockReturnValue(false);

      setupMockReqRes({
        email: 'mfa@example.com',
        password: 'Password1!',
        twoFactorCode: 'abc12345'
      });

      const handler = getRouteHandler('/login', 'post');
      await handler(req, res);

      expect(update).toHaveBeenCalledWith({
        two_factor_auth: {
          enabled: true,
          secret: 'BASE32SECRET',
          backupCodes: []
        }
      });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        token: 'access-token',
        refreshToken: 'refresh-token'
      }));
    });
  });

  describe('POST /reset-password', () => {
    it('updates password only after validating the recovery token', async () => {
      setupMockReqRes({
        token: 'recovery-access-token',
        refreshToken: 'recovery-refresh-token',
        password: 'NewPassword1!'
      });

      const handler = getRouteHandler('/reset-password', 'post');
      await handler(req, res);

      expect(mockAnonAuth.setSession).toHaveBeenCalledWith({
        access_token: 'recovery-access-token',
        refresh_token: 'recovery-refresh-token'
      });
      expect(mockAnonAuth.getUser).toHaveBeenCalledWith('recovery-access-token');
      expect(mockAnonAuth.updateUser).toHaveBeenCalledWith({ password: 'NewPassword1!' });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Password reset successful. Please login with your new password.'
      });
    });
  });

  describe('GET /profile', () => {
    it('returns the authenticated user role in the profile payload', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({
              data: { id: 'wallet-1', user_id: 'user-1', naira_balance: 0 },
              error: null
            })
          }))
        }))
      });

      setupMockReqRes();
      req.user = {
        id: 'user-1',
        first_name: 'Ada',
        last_name: 'Okafor',
        email: 'ada@example.com',
        phone: '+2348012345678',
        role: 'super_admin',
        kyc_status: 'pending',
        is_email_verified: true,
        is_phone_verified: true,
        two_factor_auth: { enabled: false },
        referral_code: 'NADI1234',
        preferences: {},
        created_at: '2026-07-09T00:00:00.000Z'
      };

      const handler = getRouteHandler('/profile', 'get');
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        user: expect.objectContaining({
          id: 'user-1',
          role: 'super_admin'
        })
      });
    });
  });
});
