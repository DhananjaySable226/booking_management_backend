const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required']
  },
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: [true, 'Service is required']
  },
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Service provider is required']
  },
  bookingDate: {
    type: Date,
    required: [true, 'Booking date is required']
  },
  startTime: {
    type: String,
    required: [true, 'Start time is required']
  },
  endTime: {
    type: String,
    required: [true, 'End time is required']
  },
  duration: {
    type: Number, // in hours
    required: [true, 'Duration is required']
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'],
    default: 'pending'
  },
  totalAmount: {
    type: Number,
    required: [true, 'Total amount is required'],
    min: [0, 'Total amount cannot be negative']
  },
  currency: {
    type: String,
    default: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'INR']
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded', 'partially_refunded'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['stripe', 'paypal', 'cash', 'bank_transfer'],
    default: 'stripe'
  },
  paymentDetails: {
    transactionId: String,
    paymentIntentId: String,
    amountPaid: Number,
    paidAt: Date,
    refundAmount: Number,
    refundedAt: Date
  },
  specialRequests: {
    type: String,
    maxlength: [500, 'Special requests cannot exceed 500 characters']
  },
  cancellationReason: {
    type: String,
    maxlength: [200, 'Cancellation reason cannot exceed 200 characters']
  },
  cancelledBy: {
    type: String,
    enum: ['user', 'provider', 'admin', 'system']
  },
  cancellationFee: {
    type: Number,
    default: 0
  },
  refundAmount: {
    type: Number,
    default: 0
  },
  notes: {
    user: [{
      message: String,
      createdAt: { type: Date, default: Date.now }
    }],
    provider: [{
      message: String,
      createdAt: { type: Date, default: Date.now }
    }],
    admin: [{
      message: String,
      createdAt: { type: Date, default: Date.now }
    }]
  },
  rating: {
    score: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      maxlength: [500, 'Review comment cannot exceed 500 characters']
    },
    createdAt: Date
  },
  insurance: {
    isRequired: {
      type: Boolean,
      default: false
    },
    amount: {
      type: Number,
      default: 0
    },
    details: String
  },
  deposit: {
    isRequired: {
      type: Boolean,
      default: false
    },
    amount: {
      type: Number,
      default: 0
    },
    paid: {
      type: Boolean,
      default: false
    },
    paidAt: Date
  },
  location: {
    address: String,
    city: String,
    state: String,
    zipCode: String,
    country: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  contactInfo: {
    name: String,
    phone: String,
    email: String
  },
  reminders: {
    sent24h: { type: Boolean, default: false },
    sent1h: { type: Boolean, default: false },
    sent15min: { type: Boolean, default: false }
  },
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringPattern: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly']
    },
    interval: Number,
    endDate: Date,
    occurrences: Number
  },
  parentBooking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  }
}, {
  timestamps: true
});

// Indexes for better query performance
bookingSchema.index({ user: 1, status: 1 });
bookingSchema.index({ provider: 1, status: 1 });
bookingSchema.index({ service: 1 });
bookingSchema.index({ bookingDate: 1, startTime: 1 });
bookingSchema.index({ status: 1, paymentStatus: 1 });
bookingSchema.index({ createdAt: -1 });

// Virtual for booking duration in minutes
bookingSchema.virtual('durationMinutes').get(function() {
  return this.duration * 60;
});

// Virtual for isUpcoming
bookingSchema.virtual('isUpcoming').get(function() {
  const now = new Date();
  const bookingDateTime = new Date(this.bookingDate);
  bookingDateTime.setHours(parseInt(this.startTime.split(':')[0]), parseInt(this.startTime.split(':')[1]));
  return bookingDateTime > now && this.status === 'confirmed';
});

// Virtual for isPast
bookingSchema.virtual('isPast').get(function() {
  const now = new Date();
  const bookingDateTime = new Date(this.bookingDate);
  bookingDateTime.setHours(parseInt(this.endTime.split(':')[0]), parseInt(this.endTime.split(':')[1]));
  return bookingDateTime < now;
});

// Method to check if booking can be cancelled
bookingSchema.methods.canBeCancelled = function() {
  const now = new Date();
  const bookingDateTime = new Date(this.bookingDate);
  bookingDateTime.setHours(parseInt(this.startTime.split(':')[0]), parseInt(this.startTime.split(':')[1]));
  
  const hoursUntilBooking = (bookingDateTime - now) / (1000 * 60 * 60);
  
  return this.status === 'confirmed' && hoursUntilBooking > 24;
};

// Method to calculate cancellation fee
bookingSchema.methods.calculateCancellationFee = function() {
  const now = new Date();
  const bookingDateTime = new Date(this.bookingDate);
  bookingDateTime.setHours(parseInt(this.startTime.split(':')[0]), parseInt(this.startTime.split(':')[1]));
  
  const hoursUntilBooking = (bookingDateTime - now) / (1000 * 60 * 60);
  
  if (hoursUntilBooking > 48) {
    return 0; // No cancellation fee
  } else if (hoursUntilBooking > 24) {
    return this.totalAmount * 0.1; // 10% cancellation fee
  } else if (hoursUntilBooking > 2) {
    return this.totalAmount * 0.5; // 50% cancellation fee
  } else {
    return this.totalAmount; // Full amount
  }
};

// Static method to get bookings by user
bookingSchema.statics.getUserBookings = function(userId, status = null) {
  const query = { user: userId };
  if (status) query.status = status;
  
  return this.find(query)
    .populate('service', 'name description images price category')
    .populate('provider', 'firstName lastName email phone')
    .sort({ bookingDate: -1, startTime: -1 });
};

// Static method to get bookings by provider
bookingSchema.statics.getProviderBookings = function(providerId, status = null) {
  const query = { provider: providerId };
  if (status) query.status = status;
  
  return this.find(query)
    .populate('service', 'name description images price category')
    .populate('user', 'firstName lastName email phone')
    .sort({ bookingDate: -1, startTime: -1 });
};

// Static method to check availability
bookingSchema.statics.checkAvailability = function(serviceId, date, startTime, endTime, excludeBookingId = null) {
  const query = {
    service: serviceId,
    bookingDate: date,
    status: { $in: ['confirmed', 'pending'] },
    $or: [
      {
        startTime: { $lt: endTime },
        endTime: { $gt: startTime }
      }
    ]
  };
  
  if (excludeBookingId) {
    query._id = { $ne: excludeBookingId };
  }
  
  return this.find(query);
};

// Pre-save middleware to update related data
bookingSchema.pre('save', function(next) {
  // Update service availability if booking is confirmed
  if (this.isModified('status') && this.status === 'confirmed') {
    // This would typically trigger a service availability update
  }
  
  // Calculate cancellation fee if booking is being cancelled
  if (this.isModified('status') && this.status === 'cancelled' && this.cancelledBy) {
    this.cancellationFee = this.calculateCancellationFee();
    this.refundAmount = this.totalAmount - this.cancellationFee;
  }
  
  next();
});

module.exports = mongoose.model('Booking', bookingSchema);
