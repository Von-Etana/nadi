const mongoose = require('mongoose');

const giftCardSchema = new mongoose.Schema({
  // Card Type
  cardType: {
    type: String,
    required: true,
    enum: [
      'amazon', 'apple', 'google_play', 'steam', 'netflix', 'spotify',
      'xbox', 'playstation', 'nintendo', 'uber', 'airbnb', 'visa',
      'mastercard', 'bestbuy', 'walmart', 'target', 'other'
    ],
    index: true
  },
  
  // Card Details
  name: {
    type: String,
    required: true
  },
  description: String,
  image: String,
  
  // Denominations available
  denominations: [{
    value: Number,
    currency: { type: String, default: 'USD' },
    isActive: { type: Boolean, default: true }
  }],
  
  // Rates (for buying/selling)
  rates: {
    buy: { // Rate when users buy from us
      rate: { type: Number, required: true }, // NGN per unit
      currency: { type: String, default: 'USD' },
      updatedAt: { type: Date, default: Date.now }
    },
    sell: { // Rate when users sell to us
      rate: { type: Number, required: true }, // NGN per unit
      currency: { type: String, default: 'USD' },
      updatedAt: { type: Date, default: Date.now }
    }
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Stock (for physical cards)
  stock: {
    type: Number,
    default: 0
  },
  
  // Region restrictions
  region: {
    type: String,
    default: 'global',
    enum: ['global', 'us', 'uk', 'eu', 'ng', 'other']
  },
  
  // Terms
  termsAndConditions: String,
  expiryPeriod: Number // Days until card expires after purchase
}, {
  timestamps: true
});

// Index for quick lookups
giftCardSchema.index({ cardType: 1, isActive: 1 });

// Method to calculate buy price
giftCardSchema.methods.calculateBuyPrice = function(amount, currency = 'USD') {
  return amount * this.rates.buy.rate;
};

// Method to calculate sell price
giftCardSchema.methods.calculateSellPrice = function(amount, currency = 'USD') {
  return amount * this.rates.sell.rate;
};

module.exports = mongoose.model('GiftCard', giftCardSchema);

// User Gift Card Purchase/Sell Schema
const userGiftCardSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Transaction reference
  transaction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  },
  
  // Type: buy or sell
  type: {
    type: String,
    enum: ['buy', 'sell'],
    required: true
  },
  
  // Card Details
  cardType: {
    type: String,
    required: true
  },
  
  cardValue: {
    type: Number,
    required: true
  },
  
  cardCurrency: {
    type: String,
    default: 'USD'
  },
  
  // For sell orders
  cardCode: {
    type: String,
    select: false // Encrypted
  },
  
  cardPin: {
    type: String,
    select: false // Encrypted
  },
  
  cardImage: String, // URL to uploaded image
  
  // Pricing
  rate: Number, // Rate applied
  payoutAmount: Number, // Amount user receives (for sell) or pays (for buy)
  payoutCurrency: { type: String, default: 'NGN' },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'under_review', 'approved', 'rejected', 'completed', 'cancelled'],
    default: 'pending'
  },
  
  // Review details
  review: {
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    notes: String,
    rejectionReason: String
  },
  
  // For buy orders - delivered card details
  deliveredCard: {
    code: { type: String, select: false },
    pin: { type: String, select: false },
    deliveredAt: Date
  },
  
  // E-receipt
  receiptUrl: String
}, {
  timestamps: true
});

userGiftCardSchema.index({ user: 1, createdAt: -1 });
userGiftCardSchema.index({ status: 1 });

module.exports.UserGiftCard = mongoose.model('UserGiftCard', userGiftCardSchema);
