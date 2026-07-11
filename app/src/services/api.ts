// API Service for Nadi Digital Service Backend Integration
import { supabase } from '../lib/supabase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.nadidigital.com/v1';

// HTTP Client
class HttpClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('nadi_token', token);
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('nadi_token');
    }
    return this.token;
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('nadi_token');
  }

  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ data?: T; error?: string; status: number }> {
    const url = `${this.baseUrl}${endpoint}`;
    const publicAuthEndpoints = [
      '/auth/login',
      '/auth/register',
      '/auth/forgot-password',
      '/auth/reset-password',
    ];
    const shouldAttachToken = !publicAuthEndpoints.includes(endpoint);
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (shouldAttachToken) {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data?.session?.access_token || this.getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        return {
          error: data?.message || data?.error || 'An error occurred',
          status: response.status,
          data: data as any,
        };
      }

      return { data, status: response.status };
    } catch {
      return {
        error: 'Network error. Please check your connection.',
        status: 0,
      };
    }
  }

  get<T = any>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  post<T = any>(endpoint: string, body: any) {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  put<T = any>(endpoint: string, body: any) {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  patch<T = any>(endpoint: string, body: any) {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  delete<T = any>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const httpClient = new HttpClient(API_BASE_URL);

// Auth API
export const authApi = {
  async register(data: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    password: string;
  }) {
    return httpClient.post('/auth/register', data);
  },

  async login(data: { email: string; password: string }) {
    const response = await httpClient.post<{ token: string; user: any }>('/auth/login', data);
    if (response.data?.token) {
      httpClient.setToken(response.data.token);
    }
    return response;
  },

  async logout() {
    const response = await httpClient.post('/auth/logout', {});
    httpClient.clearToken();
    return response;
  },

  async forgotPassword(email: string) {
    return httpClient.post('/auth/forgot-password', { email });
  },

  async resetPassword(token: string, password: string, refreshToken?: string) {
    return httpClient.post('/auth/reset-password', { token, password, refreshToken });
  },

  async getProfile() {
    return httpClient.get('/auth/profile');
  },

  async updateProfile(data: any) {
    return httpClient.put('/auth/profile', data);
  },

  async changePassword(data: { currentPassword: string; newPassword: string }) {
    return httpClient.post('/auth/change-password', data);
  },

  async setup2FA() {
    return httpClient.post('/auth/2fa/setup', {});
  },

  async verify2FA(code: string) {
    return httpClient.post('/auth/2fa/verify', { code });
  },

  async disable2FA(code: string) {
    return httpClient.post('/auth/2fa/disable', { code });
  },
};

// Wallet API
export const walletApi = {
  async getBalance() {
    return httpClient.get('/wallet/balance');
  },

  async getTransactions(params?: { page?: number; limit?: number; type?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return httpClient.get(`/wallet/transactions?${query}`);
  },

  async fundWallet(data: {
    amount: number;
    method: 'card' | 'bank_transfer' | 'ussd' | 'crypto';
    provider?: string;
  }) {
    // Create transaction record and initialize payment on the backend
    const response = await httpClient.post('/wallet/fund', data);
    return response.data;
  },

  async transfer(data: {
    recipient: string;
    amount: number;
    narration?: string;
    transactionPin: string;
  }) {
    return httpClient.post('/wallet/transfer', data);
  },

  async withdraw(data: {
    amount: number;
    bankCode: string;
    accountNumber: string;
    accountName: string;
    transactionPin: string;
  }) {
    return httpClient.post('/wallet/withdraw', data);
  },

  async getBanks() {
    return httpClient.get('/wallet/banks');
  },

  async verifyAccount(data: { bankCode: string; accountNumber: string }) {
    return httpClient.post('/wallet/verify-account', data);
  },

  async addCard(data: {
    cardNumber: string;
    expiryMonth: string;
    expiryYear: string;
    cvv: string;
  }) {
    return httpClient.post('/wallet/cards', data);
  },

  async getCards() {
    return httpClient.get('/wallet/cards');
  },

  async deleteCard(cardId: string) {
    return httpClient.delete(`/wallet/cards/${cardId}`);
  },
};

// Utility Payments API
export const utilitiesApi = {
  async getCategories() {
    return httpClient.get('/utilities/categories');
  },

  async getProviders(category: string) {
    return httpClient.get(`/utilities/providers?category=${category}`);
  },

  async validateMeter(data: {
    provider: string;
    meterNumber: string;
    meterType: 'prepaid' | 'postpaid';
  }) {
    return httpClient.post('/utilities/validate-meter', data);
  },

  async validateDecoder(data: {
    provider: string;
    smartCardNumber: string;
  }) {
    return httpClient.post('/utilities/validate-decoder', data);
  },

  async payBill(data: {
    category: string;
    provider: string;
    customerReference: string;
    amount: number;
    metadata?: any;
  }) {
    return httpClient.post('/utilities/pay', data);
  },

  async buyAirtime(data: {
    network: string;
    phoneNumber: string;
    amount: number;
  }) {
    return httpClient.post('/utilities/airtime', data);
  },

  async buyData(data: {
    network: string;
    phoneNumber: string;
    planCode: string;
  }) {
    return httpClient.post('/utilities/data', data);
  },

  async getDataPlans(network: string) {
    return httpClient.get(`/utilities/data-plans?network=${network}`);
  },

  async getTransactionHistory() {
    return httpClient.get('/utilities/history');
  },
};

// Gift Cards API
export const giftCardsApi = {
  async getAvailableCards() {
    return httpClient.get('/giftcards/available');
  },

  async getRates() {
    return httpClient.get('/giftcards/rates');
  },

  async buyCard(data: {
    cardType: string;
    amount: number;
    currency: string;
  }) {
    return httpClient.post('/giftcards/buy', data);
  },

  async sellCard(data: {
    cardType: string;
    amount: number;
    currency: string;
    cardCode: string;
    cardPin?: string;
    cardImage?: string;
  }) {
    return httpClient.post('/giftcards/sell', data);
  },

  async redeemCard(data: {
    code: string;
  }) {
    return httpClient.post('/giftcards/redeem', data);
  },

  async getMyCards() {
    return httpClient.get('/giftcards/my-cards');
  },

  async getTransactions() {
    return httpClient.get('/giftcards/transactions');
  },
};

// Crypto API
export const cryptoApi = {
  async getAssets() {
    return httpClient.get('/crypto/assets');
  },

  async getPrices() {
    return httpClient.get('/crypto/prices');
  },

  async getWalletAddress(crypto: string) {
    return httpClient.get(`/crypto/wallet/${crypto}`);
  },

  async buy(data: {
    crypto: string;
    amount: number;
    paymentMethod: string;
  }) {
    return httpClient.post('/crypto/buy', data);
  },

  async sell(data: {
    crypto: string;
    amount: number;
    destination: string;
  }) {
    return httpClient.post('/crypto/sell', data);
  },

  async swap(data: {
    fromCrypto: string;
    toCrypto: string;
    amount: number;
  }) {
    return httpClient.post('/crypto/swap', data);
  },

  async getTransactions() {
    return httpClient.get('/crypto/transactions');
  },

  async withdraw(data: {
    crypto: string;
    amount: number;
    address: string;
    network?: string;
  }) {
    return httpClient.post('/crypto/withdraw', data);
  },
};

// Logistics API
export const logisticsApi = {
  async createShipment(data: {
    pickupAddress: string;
    deliveryAddress: string;
    recipientName: string;
    recipientPhone: string;
    itemDescription: string;
    weight: number;
    serviceType?: 'standard' | 'express' | 'sameDay';
    paymentMethod?: 'wallet' | 'crypto';
    cryptoCoin?: 'btc' | 'eth' | 'usdt';
    deliveryCategory?: 'parcel' | 'document' | 'business';
    deliveryMode?: 'door_to_door' | 'interstate';
    scheduledDate?: string | null;
    itemValue?: number;
  }) {
    return httpClient.post('/logistics/shipments', data);
  },

  async trackShipment(trackingNumber: string) {
    return httpClient.get(`/logistics/track/${trackingNumber}`);
  },

  async getShipments() {
    return httpClient.get('/logistics/shipments');
  },

  async calculateRate(data: {
    pickupLocation: string;
    deliveryLocation: string;
    weight: number;
    serviceType?: 'standard' | 'express' | 'sameDay';
    deliveryCategory?: 'parcel' | 'document' | 'business';
    deliveryMode?: 'door_to_door' | 'interstate';
  }) {
    return httpClient.post('/logistics/calculate-rate', data);
  },

  async cancelShipment(shipmentId: string) {
    return httpClient.post(`/logistics/shipments/${shipmentId}/cancel`, {});
  },
};

// Fuel & Gas API
export const fuelApi = {
  async getPrices() {
    return httpClient.get('/fuel/prices');
  },

  async createOrder(data: {
    type: 'fuel' | 'gas';
    fuelType?: 'pms' | 'ago';
    cylinderSize?: string;
    quantity: number;
    deliveryAddress: string;
    phoneNumber: string;
    notes?: string;
  }) {
    return httpClient.post('/fuel/orders', data);
  },

  async getOrders() {
    return httpClient.get('/fuel/orders');
  },

  async trackOrder(orderId: string) {
    return httpClient.get(`/fuel/orders/${orderId}/track`);
  },

  async cancelOrder(orderId: string) {
    return httpClient.post(`/fuel/orders/${orderId}/cancel`, {});
  },
};

// Notifications API
export const notificationsApi = {
  async getAll() {
    return httpClient.get('/notifications');
  },

  async markAsRead(id: string) {
    return httpClient.patch(`/notifications/${id}/read`, {});
  },

  async markAllAsRead() {
    return httpClient.post('/notifications/read-all', {});
  },

  async delete(id: string) {
    return httpClient.delete(`/notifications/${id}`);
  },

  async getPreferences() {
    return httpClient.get('/notifications/preferences');
  },

  async updatePreferences(data: any) {
    return httpClient.put('/notifications/preferences', data);
  },
};

// Support API
export const supportApi = {
  async createTicket(data: {
    subject: string;
    message: string;
    category: string;
    attachments?: string[];
  }) {
    return httpClient.post('/support/tickets', data);
  },

  async getTickets() {
    return httpClient.get('/support/tickets');
  },

  async getTicket(id: string) {
    return httpClient.get(`/support/tickets/${id}`);
  },

  async replyToTicket(id: string, message: string) {
    return httpClient.post(`/support/tickets/${id}/reply`, { message });
  },

  async getFAQs() {
    return httpClient.get('/support/faqs');
  },

  async searchFAQs(query: string) {
    return httpClient.get(`/support/faqs/search?q=${encodeURIComponent(query)}`);
  },
};

// Admin API (for admin dashboard)
export const adminApi = {
  // Users
  async getUsers(params?: { page?: number; limit?: number; search?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return httpClient.get(`/admin/users?${query}`);
  },

  async getUser(id: string) {
    return httpClient.get(`/admin/users/${id}`);
  },

  async updateUser(id: string, data: any) {
    return httpClient.put(`/admin/users/${id}`, data);
  },

  async suspendUser(id: string, reason: string) {
    return httpClient.post(`/admin/users/${id}/suspend`, { reason });
  },

  // Transactions
  async getTransactions(params?: { page?: number; limit?: number; status?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return httpClient.get(`/admin/transactions?${query}`);
  },

  async getTransaction(id: string) {
    return httpClient.get(`/admin/transactions/${id}`);
  },

  // Gift Cards
  async updateGiftCardRate(cardType: string, rate: number) {
    return httpClient.put(`/admin/giftcards/rates/${cardType}`, { rate });
  },

  async approveGiftCardSale(id: string) {
    return httpClient.post(`/admin/giftcards/sales/${id}/approve`, {});
  },

  // Settings
  async getSettings() {
    return httpClient.get('/admin/settings');
  },

  async updateSettings(data: any) {
    return httpClient.put('/admin/settings', data);
  },

  // Analytics
  async getDashboardStats() {
    return httpClient.get('/admin/analytics/dashboard');
  },

  async getRevenueReport(params?: { startDate?: string; endDate?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return httpClient.get(`/admin/analytics/revenue?${query}`);
  },
};

// WebSocket for real-time updates
export class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private listeners: Map<string, ((data: any) => void)[]> = new Map();

  connect(token: string) {
    const wsUrl = import.meta.env.VITE_WS_URL || 'wss://api.nadidigital.com/ws';
    this.ws = new WebSocket(`${wsUrl}?token=${token}`);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.emit(data.type, data.payload);
    };

    this.ws.onclose = () => {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        setTimeout(() => {
          this.reconnectAttempts++;
          this.connect(token);
        }, 3000 * this.reconnectAttempts);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }

  on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(callback);
  }

  off(event: string, callback: (data: any) => void) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any) {
    const callbacks = this.listeners.get(event);
    callbacks?.forEach((callback) => callback(data));
  }

  send(type: string, payload: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }
}

export const wsService = new WebSocketService();

// Export all APIs
export const api = {
  auth: authApi,
  wallet: walletApi,
  utilities: utilitiesApi,
  giftCards: giftCardsApi,
  crypto: cryptoApi,
  logistics: logisticsApi,
  fuel: fuelApi,
  notifications: notificationsApi,
  support: supportApi,
  admin: adminApi,
  ws: wsService,
  http: httpClient,
};

export default api;
