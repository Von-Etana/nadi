const mockCreateClient = jest.fn(() => ({
  auth: {
    updateUser: jest.fn().mockResolvedValue({ data: {}, error: null })
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
      expect(mockSupabase.auth.signInWithPassword).not.toHaveBeenCalled();
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
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: {
          user: { id: 'user-2' }
        },
        error: null
      });

      setupMockReqRes({
        email: 'mfa@example.com',
        password: 'Password1!'
      });

      const handler = getRouteHandler('/login', 'post');
      await handler(req, res);

      expect(mockSupabase.auth.signOut).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Two-factor authentication required',
        requires2FA: true
      });
      expect(speakeasy.totp.verify).not.toHaveBeenCalled();
    });
  });
});
