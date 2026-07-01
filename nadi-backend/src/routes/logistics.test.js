const axios = require('axios');

jest.mock('axios');
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));
jest.mock('../services/what3words', () => ({
  convertToCoordinates: jest.fn().mockResolvedValue({
    lat: 6.5244,
    lng: 3.3792,
    nearestPlace: 'Lagos, Nigeria',
    country: 'NG'
  })
}));
jest.mock('../services/notification', () => ({
  createNotification: jest.fn().mockResolvedValue(true)
}));
jest.mock('../services/quidax', () => ({
  getLiveRates: jest.fn().mockResolvedValue({
    btc: 98500000,
    eth: 5200000,
    usdt: 1550
  })
}));
jest.mock('express-validator', () => {
  const validator = jest.fn();
  validator.notEmpty = jest.fn().mockReturnValue(validator);
  validator.isFloat = jest.fn().mockReturnValue(validator);
  validator.isIn = jest.fn().mockReturnValue(validator);
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

jest.mock('../utils/supabase', () => ({
  from: jest.fn(),
  rpc: jest.fn()
}));

const supabase = require('../utils/supabase');
const logisticsRouter = require('./logistics');

const getRouteHandler = (path, method = 'post') => {
  const layer = logisticsRouter.stack.find(r => r.route?.path === path && r.route?.methods[method]);
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
};

describe('Logistics Router Test Suite', () => {
  let req;
  let res;

  const setupMockReqRes = (body = {}, params = {}, user = { id: 'user-1', role: 'user' }) => {
    req = {
      user,
      body,
      params,
      query: {},
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

  describe('POST /shipments', () => {
    it('returns a consistent shipment response with a normalized payment object', async () => {
      const insertSingle = jest.fn().mockResolvedValue({
        data: {
          id: 'order-1',
          order_number: 'NADI-LOG-20260701-ABC123',
          status: 'pending',
          tracking: {
            status: 'order_created',
            logs: [{ status: 'order_created', timestamp: '2026-07-01T10:00:00.000Z', message: 'Shipment request received' }]
          }
        },
        error: null
      });

      const logisticsTable = {
        insert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: insertSingle
          }))
        }))
      };
      const transactionsTable = {
        update: jest.fn(() => ({
          eq: jest.fn().mockResolvedValue({ data: { success: true }, error: null })
        }))
      };

      supabase.from.mockImplementation((table) => {
        if (table === 'logistics_orders') return logisticsTable;
        if (table === 'transactions') return transactionsTable;
        return {};
      });
      supabase.rpc.mockResolvedValueOnce({
        data: { success: true, tx_id: 'tx-123' },
        error: null
      });

      setupMockReqRes({
        pickupAddress: '12 Marina Road, Lagos',
        deliveryAddress: '14 Bourdillon Road, Lagos',
        recipientName: 'Ada Okafor',
        recipientPhone: '+2348012345678',
        itemDescription: 'Laptop bag',
        weight: 1.5,
        serviceType: 'express',
        paymentMethod: 'wallet',
        deliveryCategory: 'parcel',
        deliveryMode: 'door_to_door'
      });

      const handler = getRouteHandler('/shipments', 'post');
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: 'Shipment order created successfully',
        order: expect.objectContaining({
          id: 'order-1',
          order_number: 'NADI-LOG-20260701-ABC123',
          status: 'pending',
          reference: 'NADI-LOG-20260701-ABC123'
        }),
        payment: expect.objectContaining({
          method: 'wallet',
          status: 'completed',
          reference: expect.any(String)
        })
      }));

      const response = res.json.mock.calls[0][0];
      expect(response.order.reference).toBe(response.order.order_number);
      expect(response.payment.reference).toEqual(expect.any(String));
    });
  });

  describe('GET /track/:trackingNumber', () => {
    it('scopes tracking lookups to the authenticated customer', async () => {
      const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
      const secondEq = jest.fn(() => ({ maybeSingle }));
      const firstEq = jest.fn(() => ({ eq: secondEq }));
      const select = jest.fn(() => ({ eq: firstEq }));
      supabase.from.mockReturnValue({ select });

      setupMockReqRes({}, { trackingNumber: 'NADI-LOG-20260701-ABC123' }, { id: 'user-1', role: 'user' });

      const handler = getRouteHandler('/track/:trackingNumber', 'get');
      await handler(req, res);

      expect(firstEq).toHaveBeenCalledWith('order_number', 'NADI-LOG-20260701-ABC123');
      expect(secondEq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Shipment order not found'
      });
    });
  });

  describe('POST /shipments/:id/assign', () => {
    it('assigns a shipment and records the dispatcher handoff in tracking logs', async () => {
      const existingOrder = {
        id: 'order-2',
        order_number: 'NADI-LOG-20260701-XYZ999',
        status: 'pending',
        assigned_to: null,
        tracking: {
          status: 'order_created',
          logs: [{ status: 'order_created', timestamp: '2026-07-01T10:00:00.000Z', message: 'Shipment request received' }]
        }
      };

      const maybeSingle = jest.fn().mockResolvedValue({ data: existingOrder, error: null });
      const updateEq = jest.fn().mockResolvedValue({
        data: [{
          ...existingOrder,
          status: 'accepted',
          assigned_to: 'dispatcher-9',
          tracking: {
            status: 'accepted',
            logs: [
              ...existingOrder.tracking.logs,
              {
                status: 'accepted',
                timestamp: '2026-07-01T11:00:00.000Z',
                message: 'Shipment assigned to dispatcher-9'
              }
            ]
          }
        }],
        error: null
      });

      supabase.from.mockImplementation((table) => {
        if (table !== 'logistics_orders') return {};
        return {
          select: jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle })) })),
          update: jest.fn(() => ({ eq: updateEq }))
        };
      });

      setupMockReqRes({ assignedTo: 'dispatcher-9', notes: 'Assign to nearest rider' }, { id: 'order-2' }, { id: 'admin-1', role: 'admin' });

      const handler = getRouteHandler('/shipments/:id/assign', 'post');
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        shipment: expect.objectContaining({
          status: 'accepted',
          assigned_to: 'dispatcher-9',
          tracking: expect.objectContaining({
            status: 'accepted',
            logs: expect.arrayContaining([
              expect.objectContaining({ status: 'accepted' })
            ])
          })
        })
      }));
    });
  });

  describe('PATCH /shipments/:id/status', () => {
    it('updates shipment status and appends proof-aware tracking logs', async () => {
      const existingOrder = {
        id: 'order-3',
        order_number: 'NADI-LOG-20260701-DEL123',
        status: 'accepted',
        assigned_to: 'dispatcher-9',
        tracking: {
          status: 'accepted',
          logs: [{ status: 'accepted', timestamp: '2026-07-01T10:00:00.000Z', message: 'Shipment accepted' }]
        }
      };

      const maybeSingle = jest.fn().mockResolvedValue({ data: existingOrder, error: null });
      const updateEq = jest.fn().mockResolvedValue({
        data: [{
          ...existingOrder,
          status: 'in_transit',
          delivery_proof: null,
          tracking: {
            status: 'in_transit',
            logs: [
              ...existingOrder.tracking.logs,
              {
                status: 'in_transit',
                timestamp: '2026-07-01T12:00:00.000Z',
                message: 'Shipment marked in transit'
              }
            ]
          }
        }],
        error: null
      });

      supabase.from.mockImplementation((table) => {
        if (table !== 'logistics_orders') return {};
        return {
          select: jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle })) })),
          update: jest.fn(() => ({ eq: updateEq }))
        };
      });

      setupMockReqRes({ status: 'in_transit', notes: 'Picked up from warehouse' }, { id: 'order-3' }, { id: 'admin-1', role: 'admin' });

      const handler = getRouteHandler('/shipments/:id/status', 'patch');
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        shipment: expect.objectContaining({
          status: 'in_transit',
          tracking: expect.objectContaining({
            status: 'in_transit',
            logs: expect.arrayContaining([
              expect.objectContaining({ status: 'in_transit' })
            ])
          })
        })
      }));
    });
  });
});
