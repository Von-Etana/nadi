/**
 * Nadi Digital Service - Frontend Payment Service
 * 
 * SECURITY: This service handles ONLY frontend-safe payment operations.
 * All secret keys and server-side API calls have been removed.
 * Payment initialization and verification MUST go through the backend API.
 */

// ==========================================
// Paystack Frontend Service (Public Key Only)
// ==========================================
export class PaystackService {
  private publicKey: string;

  constructor() {
    this.publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '';
  }

  /**
   * Load Paystack inline popup script
   */
  async loadScript(): Promise<void> {
    if (document.getElementById('paystack-script')) return;

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.id = 'paystack-script';
      script.src = 'https://js.paystack.co/v1/inline.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Paystack script'));
      document.head.appendChild(script);
    });
  }

  /**
   * Open Paystack inline payment popup
   * The backend initializes the transaction and returns the access_code.
   */
  async payWithPopup(config: {
    accessCode: string;
    email: string;
    amount: number;
    onSuccess: (response: any) => void;
    onClose: () => void;
  }): Promise<void> {
    await this.loadScript();

    const PaystackPop = (window as any).PaystackPop;
    if (!PaystackPop) {
      throw new Error('Paystack script not loaded');
    }

    const handler = PaystackPop.setup({
      key: this.publicKey,
      email: config.email,
      amount: config.amount * 100, // Convert to kobo
      access_code: config.accessCode,
      callback: config.onSuccess,
      onClose: config.onClose,
    });

    handler.openIframe();
  }

  /**
   * Open Paystack inline payment with direct key (for simple payments)
   */
  async payInline(config: {
    email: string;
    amount: number;
    reference: string;
    metadata?: Record<string, any>;
    onSuccess: (response: any) => void;
    onClose: () => void;
  }): Promise<void> {
    await this.loadScript();

    const PaystackPop = (window as any).PaystackPop;
    if (!PaystackPop) {
      throw new Error('Paystack script not loaded');
    }

    const handler = PaystackPop.setup({
      key: this.publicKey,
      email: config.email,
      amount: config.amount * 100,
      ref: config.reference,
      metadata: config.metadata || {},
      callback: config.onSuccess,
      onClose: config.onClose,
    });

    handler.openIframe();
  }
}

// ==========================================
// Flutterwave Frontend Service (Public Key Only)
// ==========================================
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
    onSuccess: (response: any) => void;
    onClose: () => void;
  }): Promise<void> {
    await this.loadScript();

    const FlutterwaveCheckout = (window as any).FlutterwaveCheckout;
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
  paystack: new PaystackService(),
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
