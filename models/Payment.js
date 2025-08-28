const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    booking: {
        type: mongoose.Schema.ObjectId,
        ref: 'Booking'
    },
    paymentIntentId: {
        type: String,
        required: true,
        unique: true
    },
    // Razorpay specific fields
    razorpayOrderId: {
        type: String,
        unique: true,
        sparse: true
    },
    razorpayPaymentId: {
        type: String,
        unique: true,
        sparse: true
    },
    razorpaySignature: {
        type: String
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'INR' // Changed default to INR for Razorpay
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'],
        default: 'pending'
    },
    paymentMethod: {
        type: String,
        enum: ['card', 'bank_transfer', 'wallet', 'cash', 'razorpay', 'upi', 'netbanking'],
        default: 'razorpay' // Changed default to razorpay
    },
    paymentMethodId: {
        type: String
    },
    refundId: {
        type: String
    },
    refundAmount: {
        type: Number
    },
    refundReason: {
        type: String
    },
    metadata: {
        type: Map,
        of: String
    },
    description: {
        type: String
    },
    receiptUrl: {
        type: String
    },
    failureReason: {
        type: String
    },
    failureCode: {
        type: String
    },
    processingFee: {
        type: Number
    },
    taxAmount: {
        type: Number
    },
    discountAmount: {
        type: Number
    },
    finalAmount: {
        type: Number
    },
    isTest: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for formatted amount
PaymentSchema.virtual('formattedAmount').get(function () {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: this.currency.toUpperCase()
    }).format(this.amount);
});

// Virtual for payment status badge
PaymentSchema.virtual('statusBadge').get(function () {
    const statusColors = {
        pending: 'warning',
        processing: 'info',
        completed: 'success',
        failed: 'danger',
        cancelled: 'secondary',
        refunded: 'info'
    };
    return statusColors[this.status] || 'secondary';
});

// Index for better query performance
PaymentSchema.index({ user: 1, createdAt: -1 });
PaymentSchema.index({ status: 1 });
PaymentSchema.index({ paymentIntentId: 1 });
PaymentSchema.index({ booking: 1 });

// Pre-save middleware
PaymentSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

// Static method to get payment statistics
PaymentSchema.statics.getPaymentStats = async function (filters = {}) {
    const stats = await this.aggregate([
        { $match: filters },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                totalAmount: { $sum: '$amount' }
            }
        }
    ]);
    return stats;
};

// Static method to get revenue by period
PaymentSchema.statics.getRevenueByPeriod = async function (startDate, endDate) {
    const revenue = await this.aggregate([
        {
            $match: {
                status: 'completed',
                createdAt: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            }
        },
        {
            $group: {
                _id: {
                    year: { $year: '$createdAt' },
                    month: { $month: '$createdAt' },
                    day: { $dayOfMonth: '$createdAt' }
                },
                total: { $sum: '$amount' },
                count: { $sum: 1 }
            }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);
    return revenue;
};

// Instance method to calculate refund amount
PaymentSchema.methods.calculateRefundAmount = function (partialAmount = null) {
    if (partialAmount) {
        return Math.min(partialAmount, this.amount);
    }
    return this.amount;
};

// Instance method to check if payment can be refunded
PaymentSchema.methods.canBeRefunded = function () {
    return this.status === 'completed' && !this.refundId;
};

// Instance method to get payment summary
PaymentSchema.methods.getPaymentSummary = function () {
    return {
        id: this._id,
        amount: this.amount,
        currency: this.currency,
        status: this.status,
        paymentMethod: this.paymentMethod,
        createdAt: this.createdAt,
        formattedAmount: this.formattedAmount
    };
};

module.exports = mongoose.model('Payment', PaymentSchema);
