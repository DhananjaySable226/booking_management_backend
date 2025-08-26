const User = require('../models/User');
const Service = require('../models/Service');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');

// @desc    Get dashboard statistics
// @route   GET /api/admin/dashboard
// @access  Private (Admin)
exports.getDashboardStats = asyncHandler(async (req, res, next) => {
    // Get total counts
    const totalUsers = await User.countDocuments();
    const totalServices = await Service.countDocuments();
    const totalBookings = await Booking.countDocuments();
    const totalPayments = await Payment.countDocuments();

    // Get recent activity
    const recentUsers = await User.find().sort('-createdAt').limit(5);
    const recentBookings = await Booking.find()
        .populate('user', 'name email')
        .populate('service', 'name')
        .sort('-createdAt')
        .limit(5);

    // Get revenue statistics
    const totalRevenue = await Payment.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const monthlyRevenue = await Payment.aggregate([
        { $match: { status: 'completed' } },
        {
            $group: {
                _id: {
                    year: { $year: '$createdAt' },
                    month: { $month: '$createdAt' }
                },
                total: { $sum: '$amount' }
            }
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } },
        { $limit: 6 }
    ]);

    // Get booking status distribution
    const bookingStats = await Booking.aggregate([
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);

    // Get service category distribution
    const serviceStats = await Service.aggregate([
        {
            $group: {
                _id: '$category',
                count: { $sum: 1 }
            }
        }
    ]);

    res.status(200).json({
        success: true,
        data: {
            overview: {
                totalUsers,
                totalServices,
                totalBookings,
                totalPayments,
                totalRevenue: totalRevenue[0]?.total || 0
            },
            recentActivity: {
                users: recentUsers,
                bookings: recentBookings
            },
            revenue: {
                monthly: monthlyRevenue
            },
            statistics: {
                bookings: bookingStats,
                services: serviceStats
            }
        }
    });
});

// @desc    Get revenue analytics
// @route   GET /api/admin/revenue
// @access  Private (Admin)
exports.getRevenueAnalytics = asyncHandler(async (req, res, next) => {
    const { period = 'monthly', startDate, endDate } = req.query;

    let dateFilter = {};
    if (startDate && endDate) {
        dateFilter = {
            createdAt: {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            }
        };
    }

    let groupBy = {};
    switch (period) {
        case 'daily':
            groupBy = {
                year: { $year: '$createdAt' },
                month: { $month: '$createdAt' },
                day: { $dayOfMonth: '$createdAt' }
            };
            break;
        case 'weekly':
            groupBy = {
                year: { $year: '$createdAt' },
                week: { $week: '$createdAt' }
            };
            break;
        case 'monthly':
        default:
            groupBy = {
                year: { $year: '$createdAt' },
                month: { $month: '$createdAt' }
            };
            break;
    }

    const revenue = await Payment.aggregate([
        { $match: { status: 'completed', ...dateFilter } },
        {
            $group: {
                _id: groupBy,
                total: { $sum: '$amount' },
                count: { $sum: 1 }
            }
        },
        { $sort: { '_id.year': -1, '_id.month': -1, '_id.day': -1, '_id.week': -1 } }
    ]);

    // Get payment method distribution
    const paymentMethods = await Payment.aggregate([
        { $match: { status: 'completed', ...dateFilter } },
        {
            $group: {
                _id: '$paymentMethod',
                total: { $sum: '$amount' },
                count: { $sum: 1 }
            }
        }
    ]);

    res.status(200).json({
        success: true,
        data: {
            revenue,
            paymentMethods
        }
    });
});

// @desc    Get booking analytics
// @route   GET /api/admin/bookings
// @access  Private (Admin)
exports.getBookingAnalytics = asyncHandler(async (req, res, next) => {
    const { period = 'monthly', startDate, endDate } = req.query;

    let dateFilter = {};
    if (startDate && endDate) {
        dateFilter = {
            createdAt: {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            }
        };
    }

    // Get booking trends
    const bookingTrends = await Booking.aggregate([
        { $match: dateFilter },
        {
            $group: {
                _id: {
                    year: { $year: '$createdAt' },
                    month: { $month: '$createdAt' }
                },
                count: { $sum: 1 },
                totalAmount: { $sum: '$totalAmount' }
            }
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } }
    ]);

    // Get booking status distribution
    const statusDistribution = await Booking.aggregate([
        { $match: dateFilter },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                totalAmount: { $sum: '$totalAmount' }
            }
        }
    ]);

    // Get top services by bookings
    const topServices = await Booking.aggregate([
        { $match: dateFilter },
        {
            $group: {
                _id: '$service',
                count: { $sum: 1 },
                totalAmount: { $sum: '$totalAmount' }
            }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
    ]);

    // Populate service details
    const populatedTopServices = await Booking.populate(topServices, {
        path: '_id',
        select: 'name category price'
    });

    res.status(200).json({
        success: true,
        data: {
            trends: bookingTrends,
            statusDistribution,
            topServices: populatedTopServices
        }
    });
});

// @desc    Get user analytics
// @route   GET /api/admin/users
// @access  Private (Admin)
exports.getUserAnalytics = asyncHandler(async (req, res, next) => {
    // Get user registration trends
    const userTrends = await User.aggregate([
        {
            $group: {
                _id: {
                    year: { $year: '$createdAt' },
                    month: { $month: '$createdAt' }
                },
                count: { $sum: 1 }
            }
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } }
    ]);

    // Get user role distribution
    const roleDistribution = await User.aggregate([
        {
            $group: {
                _id: '$role',
                count: { $sum: 1 }
            }
        }
    ]);

    // Get user activity (users with most bookings)
    const activeUsers = await Booking.aggregate([
        {
            $group: {
                _id: '$user',
                bookingCount: { $sum: 1 },
                totalSpent: { $sum: '$totalAmount' }
            }
        },
        { $sort: { bookingCount: -1 } },
        { $limit: 10 }
    ]);

    // Populate user details
    const populatedActiveUsers = await Booking.populate(activeUsers, {
        path: '_id',
        select: 'firstName lastName email role'
    });

    // Get user verification status
    const verificationStats = await User.aggregate([
        {
            $group: {
                _id: '$isEmailVerified',
                count: { $sum: 1 }
            }
        }
    ]);

    res.status(200).json({
        success: true,
        data: {
            trends: userTrends,
            roleDistribution,
            activeUsers: populatedActiveUsers,
            verificationStats
        }
    });
});

// @desc    Get service analytics
// @route   GET /api/admin/services
// @access  Private (Admin)
exports.getServiceAnalytics = asyncHandler(async (req, res, next) => {
    // Get service creation trends
    const serviceTrends = await Service.aggregate([
        {
            $group: {
                _id: {
                    year: { $year: '$createdAt' },
                    month: { $month: '$createdAt' }
                },
                count: { $sum: 1 }
            }
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } }
    ]);

    // Get service category distribution
    const categoryDistribution = await Service.aggregate([
        {
            $group: {
                _id: '$category',
                count: { $sum: 1 },
                avgPrice: { $avg: '$price' },
                avgRating: { $avg: '$rating' }
            }
        }
    ]);

    // Get top performing services
    const topServices = await Service.aggregate([
        {
            $group: {
                _id: '$_id',
                name: { $first: '$name' },
                category: { $first: '$category' },
                price: { $first: '$price' },
                rating: { $first: '$rating' },
                reviewCount: { $size: '$reviews' }
            }
        },
        { $sort: { rating: -1, reviewCount: -1 } },
        { $limit: 10 }
    ]);

    // Get service status distribution
    const statusDistribution = await Service.aggregate([
        {
            $group: {
                _id: '$isActive',
                count: { $sum: 1 }
            }
        }
    ]);

    res.status(200).json({
        success: true,
        data: {
            trends: serviceTrends,
            categoryDistribution,
            topServices,
            statusDistribution
        }
    });
});

// @desc    Get system health
// @route   GET /api/admin/system-health
// @access  Private (Admin)
exports.getSystemHealth = asyncHandler(async (req, res, next) => {
    // Database connection status
    const dbStatus = {
        connected: true, // This would be checked against actual DB connection
        collections: {
            users: await User.countDocuments(),
            services: await Service.countDocuments(),
            bookings: await Booking.countDocuments(),
            payments: await Payment.countDocuments()
        }
    };

    // System performance metrics
    const performance = {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
    };

    // Recent errors (this would be implemented with error logging)
    const recentErrors = [];

    // System alerts
    const alerts = [];

    // Check for potential issues
    const pendingBookings = await Booking.countDocuments({ status: 'pending' });
    if (pendingBookings > 50) {
        alerts.push({
            type: 'warning',
            message: `High number of pending bookings: ${pendingBookings}`
        });
    }

    const failedPayments = await Payment.countDocuments({ status: 'failed' });
    if (failedPayments > 10) {
        alerts.push({
            type: 'error',
            message: `Multiple failed payments: ${failedPayments}`
        });
    }

    res.status(200).json({
        success: true,
        data: {
            database: dbStatus,
            performance,
            errors: recentErrors,
            alerts
        }
    });
});

// @desc    Send bulk notifications
// @route   POST /api/admin/notifications
// @access  Private (Admin)
exports.sendBulkNotifications = asyncHandler(async (req, res, next) => {
    const { type, message, recipients, filters } = req.body;

    let userQuery = {};

    // Apply filters
    if (filters) {
        if (filters.role) userQuery.role = filters.role;
        if (filters.isActive !== undefined) userQuery.isActive = filters.isActive;
        if (filters.isEmailVerified !== undefined) userQuery.isEmailVerified = filters.isEmailVerified;
    }

    // Get users based on filters
    const users = await User.find(userQuery);

    // Send notifications (this would integrate with email/SMS service)
    const notificationResults = users.map(user => ({
        userId: user._id,
        email: user.email,
        status: 'sent', // This would be actual sending status
        type,
        message
    }));

    res.status(200).json({
        success: true,
        data: {
            sent: notificationResults.length,
            results: notificationResults
        }
    });
});

// @desc    Export data
// @route   GET /api/admin/export
// @access  Private (Admin)
exports.exportData = asyncHandler(async (req, res, next) => {
    const { type, format = 'json', filters } = req.query;

    let data = [];

    switch (type) {
        case 'users':
            data = await User.find(filters ? JSON.parse(filters) : {});
            break;
        case 'services':
            data = await Service.find(filters ? JSON.parse(filters) : {})
                .populate('provider', 'name email');
            break;
        case 'bookings':
            data = await Booking.find(filters ? JSON.parse(filters) : {})
                .populate('user', 'name email')
                .populate('service', 'name')
                .populate('provider', 'name email');
            break;
        case 'payments':
            data = await Payment.find(filters ? JSON.parse(filters) : {})
                .populate('user', 'name email');
            break;
        default:
            return next(new ErrorResponse('Invalid export type', 400));
    }

    if (format === 'csv') {
        // Convert to CSV format
        const csvData = data.map(item => {
            const flatItem = {};
            flattenObject(item.toObject(), flatItem);
            return flatItem;
        });

        res.status(200).json({
            success: true,
            data: csvData
        });
    } else {
        res.status(200).json({
            success: true,
            data
        });
    }
});

// Helper function to flatten object for CSV export
const flattenObject = (obj, prefix = '') => {
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const newKey = prefix ? `${prefix}.${key}` : key;
            if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                flattenObject(obj[key], newKey);
            } else {
                obj[newKey] = obj[key];
                if (prefix) delete obj[key];
            }
        }
    }
};
