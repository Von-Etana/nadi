const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  
  // Naira Balance
  naira: {
    balance: { type: Number, default: 0, min: 0 },
    ledgerBalance: { type: Number, default: 0 }, // Balance including pending transactions
    currency: { type: String, default: 'NGN' }
  },
  
  // Crypto Balances
  crypto: [{
    asset: { type: String, required: true }, // BTC, ETH, USDT, etc.
    balance: { type: Number, default: 0 },
    address: { type: String, default: null }, // Deposit address
    network: { type: String, default: null } // Network (e.g., ERC20, TRC20)
  }],
  
  // Bank Accounts (for withdrawals)
  bankAccounts: [{
    bankName: String,
    bankCode: String,
    accountNumber: { type: String, maxlength: 10 },
    accountName: String,
    isDefault: { type: Boolean, default: false },
    verified: { type: Boolean, default: false },
    addedAt: { type: Date, default: Date.now }
  }],
  
  // Saved Cards
  cards: [{
    cardType: { type: String, enum: ['visa', 'mastercard', 'verve'] },
    last4: { type: String, maxlength: 4 },
    expiryMonth: String,
    expiryYear: String,
    authorizationCode: { type: String, select: false }, // For recurring payments
    isDefault: { type: Boolean, default: false },
    addedAt: { type: Date, default: Date.now }
  }],
  
  // Virtual Account (for bank transfers)
  virtualAccount: {
    accountNumber: { type: String, unique: true, sparse: true },
    accountName: String,
    bankName: String,
    bankCode: String,
    provider: { type: String, enum: ['paystack', 'monnify', 'flutterwave'] },
    isActive: { type: Boolean, default: true }
  },
  
  // Transaction Limits
  limits: {
    dailyTransfer: { type: Number, default: 500000 }, // NGN
    dailyWithdrawal: { type: Number, default: 1000000 }, // NGN
    singleTransfer: { type: Number, default: 200000 }, // NGN
    kycTier: { type: String, enum: ['tier1', 'tier2', 'tier3'], default: 'tier1' }
  },
  
  // Daily Usage Tracking
  dailyUsage: {
    date: { type: Date, default: Date.now },
    transfers: { type: Number, default: 0 },
    withdrawals: { type: Number, default: 0 },
    deposits: { type: Number, default: 0 }
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  isFrozen: {
    type: Boolean,
    default: false
  },
  freezeReason: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Indexes
walletSchema.index({ user: 1 });
walletSchema.index({ 'virtualAccount.accountNumber': 1 });
walletSchema.index({ 'crypto.address': 1 });

// Virtual for total balance in NGN
walletSchema.virtual('totalBalanceNGN').get(function() {
  // This would need real-time crypto prices to calculate accurately
  return this.naira.balance;
});

// Method to check if user has sufficient balance
walletSchema.methods.hasSufficientBalance = function(amount, currency = 'NGN') {
  if (currency === 'NGN') {
    return this.naira.balance >= amount;
  }
  
  const cryptoAsset = this.crypto.find(c => c.asset === currency);
  return cryptoAsset ? cryptoAsset.balance >= amount : false;
};

// Method to debit wallet
walletSchema.methods.debit = async function(amount, currency = 'NGN') {
  if (currency === 'NGN') {
    if (this.naira.balance < amount) {
      throw new Error('Insufficient balance');
    }
    this.naira.balance -= amount;
  } else {
    const cryptoAsset = this.crypto.find(c => c.asset === currency);
    if (!cryptoAsset || cryptoAsset.balance < amount) {
      throw new Error(`Insufficient ${currency} balance`);
    }
    cryptoAsset.balance -= amount;
  }
  
  return this.save();
};

// Method to credit wallet
walletSchema.methods.credit = async function(amount, currency = 'NGN') {
  if (currency === 'NGN') {
    this.naira.balance += amount;
  } else {
    let cryptoAsset = this.crypto.find(c => c.asset === currency);
    if (!cryptoAsset) {
      cryptoAsset = { asset: currency, balance: 0 };
      this.crypto.push(cryptoAsset);
    }
    cryptoAsset.balance += amount;
  }
  
  return this.save();
};

// Method to get or create crypto address
walletSchema.methods.getCryptoAddress = function(asset) {
  let cryptoAsset = this.crypto.find(c => c.asset === asset);
  if (!cryptoAsset) {
    cryptoAsset = { asset, balance: 0 };
    this.crypto.push(cryptoAsset);
  }
  return cryptoAsset.address;
};

// Method to check daily limits
walletSchema.methods.checkDailyLimit = function(type, amount) {
  const today = new Date().toDateString();
  const usageDate = this.dailyUsage.date.toDateString();
  
  // Reset daily usage if it's a new day
  if (today !== usageDate) {
    this.dailyUsage = {
      date: new Date(),
      transfers: 0,
      withdrawals: 0,
      deposits: 0
    };
  }
  
  let limit;
  let currentUsage;
  
  switch (type) {
    case 'transfer':
      limit = this.limits.dailyTransfer;
      currentUsage = this.dailyUsage.transfers;
      break;
    case 'withdrawal':
      limit = this.limits.dailyWithdrawal;
      currentUsage = this.dailyUsage.withdrawals;
      break;
    default:
      return { allowed: true };
  }
  
  if (currentUsage + amount > limit) {
    return {
      allowed: false,
      message: `Daily ${type} limit exceeded. Limit: ₦${limit.toLocaleString()}`
    };
  }
  
  return { allowed: true };
};

// Method to update daily usage
walletSchema.methods.updateDailyUsage = async function(type, amount) {
  const today = new Date().toDateString();
  const usageDate = this.dailyUsage.date.toDateString();
  
  if (today !== usageDate) {
    this.dailyUsage = {
      date: new Date(),
      transfers: 0,
      withdrawals: 0,
      deposits: 0
    };
  }
  
  this.dailyUsage[type] += amount;
  return this.save();
};

module.exports = mongoose.model('Wallet', walletSchema);
