const mongoose = require('mongoose');

// Logistics Order Schema
const logisticsOrderSchema = new mongoose.Schema({
  // Order Reference
  orderNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // User
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Transaction
  transaction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  },
  
  // Pickup Details
  pickup: {
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    contactName: { type: String, required: true },
    contactPhone: { type: String, required: true },
    landmark: String,
    coordinates: {
      lat: Number,
      lng: Number
    },
    scheduledDate: Date,
    instructions: String
  },
  
  // Delivery Details
  delivery: {
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    contactName: { type: String, required: true },
    contactPhone: { type: String, required: true },
    landmark: String,
    coordinates: {
      lat: Number,
      lng: Number
    },
    scheduledDate: Date,
    instructions: String
  },
  
  // Item Details
  items: [{
    description: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    weight: Number, // in kg
    value: Number, // in NGN
    category: String,
    fragile: { type: Boolean, default: false },
    perishable: { type: Boolean, default: false }
  }],
  
  // Package Details
  package: {
    weight: { type: Number, required: true },
    dimensions: {
      length: Number,
      width: Number,
      height: Number
    },
    packagingType: String
  },
  
  // Pricing
  pricing: {
    baseFare: Number,
    weightCharge: Number,
    distanceCharge: Number,
    insurance: Number,
    packaging: Number,
    taxes: Number,
    discount: Number,
    total: Number
  },
  
  // Insurance
  insurance: {
    optedIn: { type: Boolean, default: false },
    value: Number,
    premium: Number
  },
  
  // Status
  status: {
    type: String,
    enum: [
      'pending',           // Order created, awaiting pickup
      'confirmed',         // Order confirmed
      'pickup_scheduled',  // Pickup scheduled
      'picked_up',         // Item picked up
      'in_transit',        // In transit
      'out_for_delivery',  // Out for delivery
      'delivered',         // Delivered
      'cancelled',         // Cancelled
      'failed',            // Delivery failed
      'returned'           // Returned to sender
    ],
    default: 'pending'
  },
  
  // Tracking
  tracking: {
    currentLocation: String,
    estimatedDelivery: Date,
    actualDelivery: Date,
    history: [{
      status: String,
      location: String,
      timestamp: { type: Date, default: Date.now },
      notes: String
    }]
  },
  
  // Assigned Driver/Rider
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver'
  },
  
  // Delivery Proof
  deliveryProof: {
    recipientName: String,
    signature: String, // URL to signature image
    photo: String, // URL to delivery photo
    timestamp: Date
  },
  
  // Cancellation
  cancellation: {
    reason: String,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: Date,
    refundStatus: { type: String, enum: ['pending', 'processed', 'rejected'], default: 'pending' }
  },
  
  // Rating
  rating: {
    score: { type: Number, min: 1, max: 5 },
    comment: String,
    ratedAt: Date
  }
}, {
  timestamps: true
});

// Generate order number
logisticsOrderSchema.pre('save', async function(next) {
  if (this.orderNumber) return next();
  
  const date = new Date();
  const prefix = 'NDL'; // Nadi Digital Logistics
  const timestamp = date.getTime().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  
  this.orderNumber = `${prefix}-${timestamp}-${random}`;
  next();
});

logisticsOrderSchema.index({ user: 1, createdAt: -1 });
logisticsOrderSchema.index({ status: 1 });
logisticsOrderSchema.index({ orderNumber: 1 });

module.exports.LogisticsOrder = mongoose.model('LogisticsOrder', logisticsOrderSchema);

// Fuel & Gas Order Schema
const fuelOrderSchema = new mongoose.Schema({
  // Order Reference
  orderNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // User
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Transaction
  transaction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  },
  
  // Order Type
  orderType: {
    type: String,
    enum: ['fuel', 'gas'],
    required: true
  },
  
  // Fuel Details
  fuelDetails: {
    type: { type: String, enum: ['pms', 'ago'] }, // PMS = Petrol, AGO = Diesel
    quantity: Number, // in liters
    pricePerLiter: Number
  },
  
  // Gas Details
  gasDetails: {
    cylinderSize: { type: String, enum: ['3kg', '6kg', '12.5kg', '25kg', '50kg'] },
    quantity: Number,
    pricePerUnit: Number,
    refill: { type: Boolean, default: false } // true = refill, false = new cylinder
  },
  
  // Delivery Address
  deliveryAddress: {
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    landmark: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  
  // Contact
  contactPhone: {
    type: String,
    required: true
  },
  
  // Pricing
  pricing: {
    subtotal: Number,
    deliveryFee: Number,
    taxes: Number,
    discount: Number,
    total: Number
  },
  
  // Status
  status: {
    type: String,
    enum: [
      'pending',           // Order received
      'confirmed',         // Order confirmed
      'dispatched',        // Driver dispatched
      'en_route',          // Driver en route
      'arrived',           // Driver arrived
      'delivered',         // Delivered
      'cancelled',         // Cancelled
      'failed'             // Delivery failed
    ],
    default: 'pending'
  },
  
  // Priority (for emergency orders)
  priority: {
    type: String,
    enum: ['normal', 'urgent', 'emergency'],
    default: 'normal'
  },
  
  // Assigned Driver
  assignedDriver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver'
  },
  
  // Driver Details
  driver: {
    name: String,
    phone: String,
    vehicleNumber: String,
    estimatedArrival: Date
  },
  
  // Tracking
  tracking: {
    currentLocation: String,
    estimatedArrival: Date,
    actualArrival: Date,
    history: [{
      status: String,
      timestamp: { type: Date, default: Date.now },
      notes: String
    }]
  },
  
  // Delivery Proof
  deliveryProof: {
    meterReading: Number, // For fuel
    photo: String,
    recipientName: String,
    timestamp: Date
  },
  
  // Notes
  customerNotes: String,
  adminNotes: String,
  
  // Scheduled delivery
  scheduledDate: Date,
  
  // Cancellation
  cancellation: {
    reason: String,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: Date,
    refundStatus: { type: String, enum: ['pending', 'processed', 'rejected'], default: 'pending' }
  },
  
  // Rating
  rating: {
    score: { type: Number, min: 1, max: 5 },
    comment: String,
    ratedAt: Date
  }
}, {
  timestamps: true
});

// Generate order number
fuelOrderSchema.pre('save', async function(next) {
  if (this.orderNumber) return next();
  
  const prefix = this.orderType === 'fuel' ? 'NDF' : 'NDG'; // Nadi Digital Fuel / Gas
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  
  this.orderNumber = `${prefix}-${timestamp}-${random}`;
  next();
});

fuelOrderSchema.index({ user: 1, createdAt: -1 });
fuelOrderSchema.index({ status: 1 });
fuelOrderSchema.index({ orderNumber: 1 });
fuelOrderSchema.index({ priority: 1 });

module.exports.FuelOrder = mongoose.model('FuelOrder', fuelOrderSchema);

// Driver Schema
const driverSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Driver Type
  driverType: {
    type: String,
    enum: ['logistics', 'fuel', 'both'],
    default: 'logistics'
  },
  
  // Personal Info
  licenseNumber: {
    type: String,
    required: true,
    unique: true
  },
  licenseExpiry: Date,
  
  // Vehicle Info
  vehicle: {
    type: { type: String, enum: ['bike', 'car', 'van', 'truck', 'tanker'] },
    make: String,
    model: String,
    year: Number,
    color: String,
    plateNumber: { type: String, required: true },
    capacity: Number // kg for logistics, liters for fuel
  },
  
  // Documents
  documents: [{
    type: { type: String, enum: ['license', 'insurance', 'vehicle_reg', 'background_check'] },
    url: String,
    verified: { type: Boolean, default: false },
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'active', 'suspended', 'inactive'],
    default: 'pending'
  },
  
  // Location (for real-time tracking)
  currentLocation: {
    lat: Number,
    lng: Number,
    updatedAt: Date
  },
  
  // Availability
  isAvailable: {
    type: Boolean,
    default: false
  },
  
  // Working hours
  workingHours: {
    start: String, // "08:00"
    end: String,   // "18:00"
    days: [{ type: String, enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] }]
  },
  
  // Zone/Coverage Area
  coverageArea: [{
    city: String,
    state: String
  }],
  
  // Performance
  stats: {
    totalDeliveries: { type: Number, default: 0 },
    completedDeliveries: { type: Number, default: 0 },
    cancelledDeliveries: { type: Number, default: 0 },
    rating: { type: Number, default: 5, min: 1, max: 5 },
    totalRatings: { type: Number, default: 0 }
  },
  
  // Earnings
  earnings: {
    balance: { type: Number, default: 0 },
    totalEarned: { type: Number, default: 0 },
    lastPayout: Date
  }
}, {
  timestamps: true
});

driverSchema.index({ status: 1, isAvailable: 1 });
driverSchema.index({ driverType: 1 });

module.exports.Driver = mongoose.model('Driver', driverSchema);
