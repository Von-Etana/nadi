/**
 * Nadi Digital Service - Frontend Payment Service
 * 
 * SECURITY: This service handles ONLY frontend-safe payment operations.
 * All secret keys and server-side API calls have been removed.
 * Payment initialization and verification MUST go through the backend API.
 */

// ==========================================
// Flutterwave Frontend Service (Public Key Only)
// ==========================================
type FlutterwaveResponse = {
  status?: string;
  tx_ref?: string;
  transaction_id?: string | number;
};

type FlutterwaveCheckoutConfig = {
  public_key: string;
  tx_ref: string;
  amount: number;
  currency: string;
  payment_options: string;
  customer: {
    email: string;
    name: string;
    phone_number: string;
  };
  customizations: {
    title: string;
    description: string;
    logo: string;
  };
  callback: (response: FlutterwaveResponse) => void;
  onclose: () => void;
};

declare global {
  interface Window {
    FlutterwaveCheckout?: (config: FlutterwaveCheckoutConfig) => void;
  }
}

export class FlutterwaveService {
  private publicKey: string;

  constructor() {
    this.publicKey = import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY || '';
  }

  /**
   * Load Flutterwave inline script
   */
  async loadScript(): Promise<void> {
    if (document.getElementById('flutterwave-script')) return;

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.id = 'flutterwave-script';
      script.src = 'https://checkout.flutterwave.com/v3.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Flutterwave script'));
      document.head.appendChild(script);
    });
  }

  /**
   * Open Flutterwave payment modal
   */
  async pay(config: {
    txRef: string;
    amount: number;
    email: string;
    name: string;
    phone?: string;
    onSuccess: (response: FlutterwaveResponse) => void;
    onClose: () => void;
  }): Promise<void> {
    await this.loadScript();

    const FlutterwaveCheckout = window.FlutterwaveCheckout;
    if (!FlutterwaveCheckout) {
      throw new Error('Flutterwave script not loaded');
    }

    FlutterwaveCheckout({
      public_key: this.publicKey,
      tx_ref: config.txRef,
      amount: config.amount,
      currency: 'NGN',
      payment_options: 'card,banktransfer,ussd',
      customer: {
        email: config.email,
        name: config.name,
        phone_number: config.phone || '',
      },
      customizations: {
        title: 'Nadi Digital Service',
        description: 'Wallet Funding',
        logo: '/logo.jpg',
      },
      callback: config.onSuccess,
      onclose: config.onClose,
    });
  }
}

// ==========================================
// Payment Helper
// ==========================================
export const paymentService = {
  flutterwave: new FlutterwaveService(),

  /**
   * Format amount as Nigerian Naira
   */
  formatNaira(amount: number): string {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(amount);
  },

  /**
   * Format amount with just the symbol
   */
  formatAmount(amount: number): string {
    return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
  },
};

export default paymentService;
