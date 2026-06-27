const express = require('express');
const axios = require('axios');
const supabase = require('../utils/supabase');
const logger = require('../utils/logger');

// Mock external dependencies
jest.mock('axios');
jest.mock('../utils/supabase', () => ({
  rpc: jest.fn(),
  from: jest.fn(() => ({
    update: jest.fn(() => ({
      eq: jest.fn(() => Promise.resolve({ data: { success: true } }))
    }))
  }))
}));
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));
jest.mock('express-validator', () => {
  const validator = jest.fn();
  validator.notEmpty = jest.fn().mockReturnValue(validator);
  validator.isLength = jest.fn().mockReturnValue(validator);
  validator.isFloat = jest.fn().mockReturnValue(validator);
  validator.isIn = jest.fn().mockReturnValue(validator);
  validator.optional = jest.fn().mockReturnValue(validator);
  validator.trim = jest.fn().mockReturnValue(validator);
  validator.isEmail = jest.fn().mockReturnValue(validator);
  validator.isMobilePhone = jest.fn().mockReturnValue(validator);
  validator.custom = jest.fn().mockReturnValue(validator);
  validator.withMessage = jest.fn().mockReturnValue(validator);

  return {
    validationResult: jest.fn(() => ({
      isEmpty: () => true,
      array: () => []
    })),
    body: jest.fn(() => validator)
  };
});

// Import the router after setting up mocks
const walletRouter = require('./wallet');

// Helper to dynamically extract the actual route handler callback (always the last in stack)
const getRouteHandler = (path, method = 'post') => {
  const layer = walletRouter.stack.find(r => r.route?.path === path && r.route?.methods[method]);
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
};

describe('Wallet Router Test Suite', () => {
  let req, res, next;

  // Mock Request & Response Helper
  const setupMockReqRes = (body = {}, query = {}, params = {}) => {
    req = {
      user: { id: 'd3b07384-d113-4956-a5db-ea8c2278e3d8' },
      body,
      query,
      params,
      ip: '127.0.0.1'
    };
    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
    next = jest.fn();
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================
  // GET /banks tests
  // ==========================================
  describe('GET /banks', () => {
    const mockBanksResponse = {
      status: 200,
      data: {
        status: 'success',
        data: [
          { id: 1, name: 'Access Bank', code: '044' },
          { id: 2, name: 'Guaranty Trust Bank', code: '058' }
        ]
      }
    };

    it('should fetch, map, and return bank lists from Flutterwave on first call (Happy Path)', async () => {
      axios.get.mockResolvedValueOnce(mockBanksResponse);
      setupMockReqRes();

      // Retrieve route handler callback from the router stack
      const getBanksHandler = getRouteHandler('/banks', 'get');
      
      await getBanksHandler(req, res);

      expect(axios.get).toHaveBeenCalledWith('https://api.flutterwave.com/v3/banks/NGN', expect.any(Object));
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        banks: [
          { id: 1, name: 'Access Bank', code: '044' },
          { id: 2, name: 'Guaranty Trust Bank', code: '058' }
        ]
      });
    });

    it('should hit in-memory cache and not invoke Axios on subsequent calls (Edge Case: Caching)', async () => {
      setupMockReqRes();
      const getBanksHandler = getRouteHandler('/banks', 'get');
      
      // Subsequent call (axios.get should NOT be called again due to cached state)
      await getBanksHandler(req, res);

      expect(axios.get).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        banks: [
          { id: 1, name: 'Access Bank', code: '044' },
          { id: 2, name: 'Guaranty Trust Bank', code: '058' }
        ]
      });
    });
  });

  // ==========================================
  // POST /verify-account tests
  // ==========================================
  describe('POST /verify-account', () => {
    it('should resolve account details successfully (Happy Path)', async () => {
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: {
          status: 'success',
          data: {
            account_number: '0123456789',
            account_name: 'JOHN DOE'
          }
        }
      });
      setupMockReqRes({ bankCode: '058', accountNumber: '0123456789' });
      const verifyHandler = getRouteHandler('/verify-account', 'post');

      await verifyHandler(req, res);

      expect(axios.post).toHaveBeenCalledWith(
        'https://api.flutterwave.com/v3/accounts/resolve',
        { account_number: '0123456789', account_bank: '058' },
        expect.any(Object)
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        account: { number: '0123456789', name: 'JOHN DOE' }
      });
    });

    it('should handle API rejections for invalid accounts (Error Handling)', async () => {
      axios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: { message: 'Account number could not be resolved' }
        }
      });
      setupMockReqRes({ bankCode: '058', accountNumber: '9999999999' });
      const verifyHandler = getRouteHandler('/verify-account', 'post');

      await verifyHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid account details'
      });
    });
  });

  // ==========================================
  // POST /withdraw tests
  // ==========================================
  describe('POST /withdraw', () => {
    const defaultWithdrawPayload = {
      amount: 5000,
      bankCode: '044',
      accountNumber: '0690000032',
      accountName: 'John Doe',
      transactionPin: '1234'
    };

    beforeEach(() => {
      // Mock bcrypt matching
      require('bcryptjs').compare = jest.fn(() => Promise.resolve(true));
      // Mock Supabase user profile select
      supabase.rpc.mockReset();
    });

    it('should process withdrawal successfully and mark transaction completed (Happy Path)', async () => {
      // 1. Mock select query for transaction PIN
      const mockSingle = jest.fn().mockResolvedValue({
        data: { transaction_pin: 'hashedPin' },
        error: null
      });
      supabase.from = jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: mockSingle
          }))
        })),
        update: jest.fn(() => ({
          eq: jest.fn(() => Promise.resolve({ data: {} }))
        }))
      }));

      // 2. Mock execute_wallet_withdrawal RPC
      supabase.rpc.mockResolvedValueOnce({
        data: { success: true, tx_id: 'tx-uuid-12345' },
        error: null
      });

      // 3. Mock Flutterwave Transfer HTTP call
      axios.post.mockResolvedValueOnce({
        data: {
          status: 'success',
          data: { id: 98765, status: 'NEW' }
        }
      });

      setupMockReqRes(defaultWithdrawPayload);
      const withdrawHandler = getRouteHandler('/withdraw', 'post');

      await withdrawHandler(req, res);

      expect(supabase.rpc).toHaveBeenCalledWith('execute_wallet_withdrawal', expect.any(Object));
      expect(axios.post).toHaveBeenCalledWith(
        'https://api.flutterwave.com/v3/transfers',
        expect.objectContaining({ amount: 5000, account_number: '0690000032' }),
        expect.any(Object)
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Withdrawal initiated',
        transaction: expect.objectContaining({ id: 'tx-uuid-12345', status: 'pending' })
      });
    });

    it('should abort transfer immediately if database limit checks or balance fail (Edge Case: DB Exception)', async () => {
      // Mock select query for PIN
      supabase.from = jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({ data: { transaction_pin: 'hashedPin' } })
          }))
        }))
      }));

      // Mock execute_wallet_withdrawal failure (limit exceeded exception)
      supabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Daily withdrawal limit of ₦1,000,000.00 exceeded' }
      });

      setupMockReqRes(defaultWithdrawPayload);
      const withdrawHandler = getRouteHandler('/withdraw', 'post');

      await withdrawHandler(req, res);

      // Verify Axios was never triggered
      expect(axios.post).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Daily withdrawal limit of ₦1,000,000.00 exceeded'
      });
    });

    it('should trigger immediate database refund on explicit HTTP 400 Bad Request error (Edge Case: Immediate Refund)', async () => {
      // Mock PIN select
      supabase.from = jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({ data: { transaction_pin: 'hashedPin' } })
          }))
        }))
      }));

      // Mock RPC balance debit
      supabase.rpc.mockResolvedValueOnce({
        data: { success: true, tx_id: 'tx-uuid-12345' },
        error: null
      });

      // Mock Flutterwave 400 Error (explicit rejection before processing)
      axios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: { message: 'Invalid bank account number' }
        }
      });

      setupMockReqRes(defaultWithdrawPayload);
      const withdrawHandler = getRouteHandler('/withdraw', 'post');

      await withdrawHandler(req, res);

      // Assert rollback refund was triggered
      expect(supabase.rpc).toHaveBeenNthCalledWith(2, 'refund_wallet_withdrawal', {
        p_tx_id: 'tx-uuid-12345',
        p_user_id: 'd3b07384-d113-4956-a5db-ea8c2278e3d8',
        p_amount: 5000,
        p_reason: 'Invalid bank account number'
      });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Withdrawal failed: Invalid bank account number. Balance refunded.'
      });
    });

    it('should NOT refund and keep transaction pending if connection experiences timeout (Edge Case: Double-Spend Protection)', async () => {
      // Mock PIN select
      supabase.from = jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({ data: { transaction_pin: 'hashedPin' } })
          }))
        }))
      }));

      // Mock RPC debit
      supabase.rpc.mockResolvedValueOnce({
        data: { success: true, tx_id: 'tx-uuid-12345' },
        error: null
      });

      // Mock Axios timeout error (no response object)
      axios.post.mockRejectedValueOnce(new Error('timeout exceeded'));

      setupMockReqRes(defaultWithdrawPayload);
      const withdrawHandler = getRouteHandler('/withdraw', 'post');

      await withdrawHandler(req, res);

      // Assert refund_wallet_withdrawal was NEVER triggered to protect against dual debit
      expect(supabase.rpc).not.toHaveBeenCalledWith('refund_wallet_withdrawal', expect.any(Object));
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Keep withdrawal tx-uuid-12345 in pending status')
      );
      
      // Responds with success but informs user that status verification is active
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Withdrawal is processing. We are verifying the transaction status with the bank.',
        transaction: expect.objectContaining({ id: 'tx-uuid-12345', status: 'pending' })
      });
    });

    it('should NOT refund and keep transaction pending if gateway returns 500 Server Error (Edge Case: Double-Spend Protection)', async () => {
      // Mock PIN select
      supabase.from = jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({ data: { transaction_pin: 'hashedPin' } })
          }))
        }))
      }));

      // Mock RPC debit
      supabase.rpc.mockResolvedValueOnce({
        data: { success: true, tx_id: 'tx-uuid-12345' },
        error: null
      });

      // Mock Axios 500 Server Error (response exists, but transaction could have completed internally)
      axios.post.mockRejectedValueOnce({
        response: {
          status: 500,
          data: { message: 'Internal Server Error' }
        }
      });

      setupMockReqRes(defaultWithdrawPayload);
      const withdrawHandler = getRouteHandler('/withdraw', 'post');

      await withdrawHandler(req, res);

      // Assert refund was NOT called
      expect(supabase.rpc).not.toHaveBeenCalledWith('refund_wallet_withdrawal', expect.any(Object));
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Withdrawal is processing. We are verifying the transaction status with the bank.',
        transaction: expect.objectContaining({ id: 'tx-uuid-12345', status: 'pending' })
      });
    });
  });
});
