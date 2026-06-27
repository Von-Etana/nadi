const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  // Transaction Reference
  reference: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // User
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Transaction Type
  type: {
    type: String,
    enum: [
      'deposit',           // Add money to wallet
      'withdrawal',        // Withdraw to bank
      'transfer',          // Send to another user
      'payment',           // Pay for goods/services
      'refund',            // Refund
      'fee',               // Service fee
      'commission',        // Referral commission
      'crypto_buy',        // Buy crypto
      'crypto_sell',       // Sell crypto
      'crypto_swap',       // Swap crypto
      'crypto_withdrawal', // Send crypto to external wallet
      'utility_payment',   // Pay bills
      'giftcard_buy',      // Buy gift card
      'giftcard_sell',     // Sell gift card
      'logistics',         // Delivery/shipping
      'fuel_order',        // Fuel/gas order
      'airtime',           // Buy airtime
      'data',              // Buy data
      'reversal'           // Transaction reversal
    ],
    required: true
  },
  
  // Category for grouping
  category: {
    type: String,
    enum: ['wallet', 'crypto', 'utility', 'giftcard', 'logistics', 'fuel', 'other'],
    default: 'other'
  },
  
  // Amount Details
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'NGN'
  },
  
  // Fees
  fees: {
    processing: { type: Number, default: 0 },
    platform: { type: Number, default: 0 },
    network: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  
  // Final amount after fees
  netAmount: {
    type: Number,
    required: true
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'],
    default: 'pending',
    index: true
  },
  
  // Direction (for wallet transactions)
  direction: {
    type: String,
    enum: ['credit', 'debit'],
    required: function() {
      return ['deposit', 'withdrawal', 'transfer', 'payment'].includes(this.type);
    }
  },
  
  // Counterparty (who sent/received)
  counterparty: {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String,
    email: String,
    phone: String,
    accountNumber: String,
    bankName: String,
    walletAddress: String
  },
  
  // Payment Method
  paymentMethod: {
    type: String,
    enum: ['card', 'bank_transfer', 'ussd', 'wallet', 'crypto', 'cash', 'pos', 'other'],
    default: 'other'
  },
  
  // Payment Provider
  provider: {
    name: { type: String, enum: ['paystack', 'flutterwave', 'monnify', 'internal', 'other'] },
    reference: String, // Provider's transaction reference
    authorizationCode: String // For recurring payments
  },
  
  // Description
  description: {
    type: String,
    maxlength: 500
  },
  
  // Metadata (flexible data for different transaction types)
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // For utility payments
  utilityDetails: {
    provider: String,
    serviceType: String, // electricity, water, cable, etc.
    customerReference: String, // meter number, smart card, etc.
    customerName: String,
    token: String // For electricity tokens
  },
  
  // For gift cards
  giftCardDetails: {
    cardType: String,
    cardValue: Number,
    cardCurrency: String,
    cardCode: { type: String, select: false },
    cardPin: { type: String, select: false },
    cardImage: String,
    rate: Number,
    expectedPayout: Number
  },
  
  // For crypto
  cryptoDetails: {
    asset: String,
    network: String,
    fromAddress: String,
    toAddress: String,
    txHash: String,
    confirmations: Number,
    exchangeRate: Number
  },
  
  // For logistics
  logisticsDetails: {
    trackingNumber: String,
    pickupAddress: String,
    deliveryAddress: String,
    itemDescription: String,
    weight: Number,
    dimensions: {
      length: Number,
      width: Number,
      height: Number
    },
    status: String,
    estimatedDelivery: Date
  },
  
  // For fuel orders
  fuelDetails: {
    orderType: { type: String, enum: ['fuel', 'gas'] },
    fuelType: { type: String, enum: ['pms', 'ago'] },
    quantity: Number,
    unit: String,
    deliveryAddress: String,
    deliveryStatus: String,
    driverInfo: {
      name: String,
      phone: String,
      vehicle: String
    }
  },
  
  // Timestamps
  processedAt: Date,
  completedAt: Date,
  failedAt: Date,
  
  // Failure reason
  failureReason: String,
  
  // Refund info
  refundInfo: {
    originalTransaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    reason: String,
    refundedAt: Date,
    refundedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  
  // IP and Device info
  ipAddress: String,
  deviceInfo: {
    deviceId: String,
    deviceName: String,
    browser: String,
    os: String
  },
  
  // Admin notes
  adminNotes: String,
  
  // Approval (for large transactions)
  approval: {
    required: { type: Boolean, default: false },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    notes: String
  }
}, {
  timestamps: true
});

// Indexes for performance
transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ reference: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ category: 1 });
transactionSchema.index({ 'provider.reference': 1 });
transactionSchema.index({ 'cryptoDetails.txHash': 1 });
transactionSchema.index({ 'logisticsDetails.trackingNumber': 1 });
transactionSchema.index({ createdAt: -1 });

// Static method to generate unique reference
transactionSchema.statics.generateReference = function(type = 'TXN') {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${type}-${timestamp}-${random}`;
};

// Method to process transaction
transactionSchema.methods.process = async function() {
  this.status = 'processing';
  this.processedAt = new Date();
  return this.save();
};

// Method to complete transaction
transactionSchema.methods.complete = async function(metadata = {}) {
  this.status = 'completed';
  this.completedAt = new Date();
  if (Object.keys(metadata).length > 0) {
    this.metadata = { ...this.metadata, ...metadata };
  }
  return this.save();
};

// Method to fail transaction
transactionSchema.methods.fail = async function(reason) {
  this.status = 'failed';
  this.failedAt = new Date();
  this.failureReason = reason;
  return this.save();
};

// Method to refund transaction
transactionSchema.methods.refund = async function(reason, adminId) {
  this.status = 'refunded';
  this.refundInfo = {
    reason,
    refundedAt: new Date(),
    refundedBy: adminId
  };
  return this.save();
};

// Virtual for formatted amount
transactionSchema.virtual('formattedAmount').get(function() {
  const symbol = this.currency === 'NGN' ? '₦' : this.currency;
  return `${symbol}${this.amount.toLocaleString()}`;
});

// Pre-save hook to calculate net amount
transactionSchema.pre('save', function(next) {
  if (this.isModified('amount') || this.isModified('fees')) {
    this.netAmount = this.amount - (this.fees?.total || 0);
  }
  next();
});

module.exports = mongoose.model('Transaction', transactionSchema);
