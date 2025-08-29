const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const mongoose = require('mongoose');

// @desc    Get payment history
// @route   GET /api/payments/history
// @access  Private
exports.getPaymentHistory = asyncHandler(async (req, res, next) => {
  const payments = await Payment.find({ user: req.user.id })
    .populate('booking', 'service bookingDate')
    .sort('-createdAt');

  res.status(200).json({
    success: true,
    count: payments.length,
    payments: payments,
    pagination: {
      page: 1,
      limit: payments.length,
      total: payments.length,
      totalPages: 1
    }
  });
});

// @desc    Get payment details
// @route   GET /api/payments/:paymentId
// @access  Private
exports.getPaymentDetails = asyncHandler(async (req, res, next) => {
  const payment = await Payment.findById(req.params.paymentId)
    .populate('user', 'name email')
    .populate('booking', 'service bookingDate totalAmount');

  if (!payment) {
    return next(new ErrorResponse(`Payment not found with id of ${req.params.paymentId}`, 404));
  }

  // Make sure user owns payment or is admin
  if (payment.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to access this payment`, 401));
  }

  res.status(200).json({
    success: true,
    payment: payment
  });
});

// @desc    Get payment statistics
// @route   GET /api/payments/stats
// @access  Private
exports.getPaymentStats = asyncHandler(async (req, res, next) => {
  const { period, startDate, endDate } = req.query;
  const userId = req.user.role === 'admin' ? null : req.user.id;

  // Build match conditions
  let matchConditions = {};

  // Filter by user if not admin
  if (userId) {
    matchConditions.user = mongoose.Types.ObjectId(userId);
  }

  // Filter by date range if provided
  if (startDate && endDate) {
    matchConditions.createdAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  } else if (period) {
    const now = new Date();
    let startDate;

    switch (period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
    }

    matchConditions.createdAt = {
      $gte: startDate,
      $lte: now
    };
  }

  // Get status-based statistics
  const statusStats = await Payment.aggregate([
    { $match: matchConditions },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    }
  ]);

  // Get total statistics
  const totalStats = await Payment.aggregate([
    { $match: matchConditions },
    {
      $group: {
        _id: null,
        totalPayments: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        averageAmount: { $avg: '$amount' },
        completedPayments: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        completedAmount: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$amount', 0] }
        },
        pendingPayments: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        },
        failedPayments: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
        }
      }
    }
  ]);

  // Get monthly statistics for the last 12 months
  const monthlyStats = await Payment.aggregate([
    { $match: matchConditions },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
    { $limit: 12 }
  ]);

  // Get payment method statistics
  const methodStats = await Payment.aggregate([
    { $match: matchConditions },
    {
      $group: {
        _id: '$paymentMethod',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    }
  ]);

  const stats = {
    status: statusStats,
    totals: totalStats[0] || {
      totalPayments: 0,
      totalAmount: 0,
      averageAmount: 0,
      completedPayments: 0,
      completedAmount: 0,
      pendingPayments: 0,
      failedPayments: 0
    },
    monthly: monthlyStats,
    methods: methodStats
  };

  res.status(200).json({
    success: true,
    stats: stats
  });
});

// @desc    Get all payments (Admin)
// @route   GET /api/payments
// @access  Private (Admin)
exports.getAllPayments = asyncHandler(async (req, res, next) => {
  const payments = await Payment.find()
    .populate('user', 'name email')
    .populate('booking', 'service bookingDate')
    .sort('-createdAt');

  res.status(200).json({
    success: true,
    count: payments.length,
    payments: payments,
    pagination: {
      page: 1,
      limit: payments.length,
      total: payments.length,
      totalPages: 1
    }
  });
});

// @desc    Export payments
// @route   GET /api/payments/export
// @access  Private (Admin)
exports.exportPayments = asyncHandler(async (req, res, next) => {
  const payments = await Payment.find()
    .populate('user', 'name email')
    .populate('booking', 'service bookingDate');

  // Convert to simple JSON rows (CSV generation can be added later)
  const csvData = payments.map(payment => ({
    id: payment._id,
    user: payment.user.name,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    paymentMethod: payment.paymentMethod,
    createdAt: payment.createdAt
  }));

  res.status(200).json({
    success: true,
    data: csvData
  });
});
