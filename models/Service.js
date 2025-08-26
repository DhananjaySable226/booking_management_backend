const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Service name is required'],
        trim: true,
        maxlength: [100, 'Service name cannot exceed 100 characters']
    },
    description: {
        type: String,
        required: [true, 'Service description is required'],
        maxlength: [1000, 'Description cannot exceed 1000 characters']
    },
    category: {
        type: String,
        required: [true, 'Service category is required'],
        enum: ['hotel', 'doctor', 'vehicle', 'transport', 'equipment', 'other']
    },
    subcategory: {
        type: String,
        trim: true
    },
    provider: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Service provider is required']
    },
    images: [{
        public_id: {
            type: String,
            required: true
        },
        url: {
            type: String,
            required: true
        }
    }],
    price: {
        amount: {
            type: Number,
            required: [true, 'Price amount is required'],
            min: [0, 'Price cannot be negative']
        },
        currency: {
            type: String,
            default: 'USD',
            enum: ['USD', 'EUR', 'GBP', 'INR']
        },
        type: {
            type: String,
            enum: ['hourly', 'daily', 'weekly', 'monthly', 'fixed'],
            default: 'fixed'
        }
    },
    location: {
        address: {
            type: String,
            required: [true, 'Address is required']
        },
        city: {
            type: String,
            required: [true, 'City is required']
        },
        state: {
            type: String,
            required: [true, 'State is required']
        },
        zipCode: String,
        country: {
            type: String,
            required: [true, 'Country is required']
        },
        coordinates: {
            latitude: Number,
            longitude: Number
        }
    },
    availability: {
        isAvailable: {
            type: Boolean,
            default: true
        },
        schedule: {
            monday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
            tuesday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
            wednesday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
            thursday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
            friday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
            saturday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
            sunday: { open: String, close: String, isOpen: { type: Boolean, default: true } }
        },
        timeSlots: [{
            startTime: String,
            endTime: String,
            isAvailable: { type: Boolean, default: true }
        }],
        maxBookingsPerSlot: {
            type: Number,
            default: 1
        }
    },
    features: [{
        name: String,
        description: String,
        icon: String
    }],
    amenities: [{
        type: String,
        trim: true
    }],
    specifications: {
        type: Map,
        of: String
    },
    rating: {
        average: {
            type: Number,
            default: 0,
            min: 0,
            max: 5
        },
        count: {
            type: Number,
            default: 0
        }
    },
    reviews: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        },
        comment: {
            type: String,
            maxlength: [500, 'Review comment cannot exceed 500 characters']
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    tags: [{
        type: String,
        trim: true
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    isFeatured: {
        type: Boolean,
        default: false
    },
    cancellationPolicy: {
        type: String,
        enum: ['flexible', 'moderate', 'strict', 'no_refund'],
        default: 'moderate'
    },
    cancellationHours: {
        type: Number,
        default: 24
    },
    insurance: {
        isRequired: {
            type: Boolean,
            default: false
        },
        amount: {
            type: Number,
            default: 0
        }
    },
    deposit: {
        isRequired: {
            type: Boolean,
            default: false
        },
        amount: {
            type: Number,
            default: 0
        }
    }
}, {
    timestamps: true
});

// Indexes for better query performance
serviceSchema.index({ category: 1, isActive: 1 });
serviceSchema.index({ provider: 1 });
serviceSchema.index({ location: '2dsphere' });
serviceSchema.index({ tags: 1 });
serviceSchema.index({ isFeatured: 1, isActive: 1 });
serviceSchema.index({ 'price.amount': 1 });
serviceSchema.index({ rating: -1 });

// Virtual for full address
serviceSchema.virtual('fullAddress').get(function () {
    return `${this.location.address}, ${this.location.city}, ${this.location.state} ${this.location.zipCode}, ${this.location.country}`;
});

// Method to update average rating
serviceSchema.methods.updateAverageRating = function () {
    if (this.reviews.length === 0) {
        this.rating.average = 0;
        this.rating.count = 0;
    } else {
        const totalRating = this.reviews.reduce((sum, review) => sum + review.rating, 0);
        this.rating.average = totalRating / this.reviews.length;
        this.rating.count = this.reviews.length;
    }
};

// Pre-save middleware to update rating
serviceSchema.pre('save', function (next) {
    if (this.reviews && this.reviews.length > 0) {
        this.updateAverageRating();
    }
    next();
});

// Static method to get services by category
serviceSchema.statics.getByCategory = function (category, limit = 10) {
    return this.find({
        category,
        isActive: true
    })
        .populate('provider', 'firstName lastName email phone')
        .limit(limit)
        .sort({ createdAt: -1 });
};

// Static method to search services
serviceSchema.statics.search = function (query, filters = {}) {
    const searchQuery = {
        isActive: true,
        $or: [
            { name: { $regex: query, $options: 'i' } },
            { description: { $regex: query, $options: 'i' } },
            { tags: { $in: [new RegExp(query, 'i')] } }
        ]
    };

    // Apply additional filters
    if (filters.category) searchQuery.category = filters.category;
    if (filters.minPrice) searchQuery['price.amount'] = { $gte: filters.minPrice };
    if (filters.maxPrice) searchQuery['price.amount'] = { ...searchQuery['price.amount'], $lte: filters.maxPrice };
    if (filters.city) searchQuery['location.city'] = { $regex: filters.city, $options: 'i' };

    return this.find(searchQuery)
        .populate('provider', 'firstName lastName email phone')
        .sort({ rating: -1, createdAt: -1 });
};

module.exports = mongoose.model('Service', serviceSchema);
