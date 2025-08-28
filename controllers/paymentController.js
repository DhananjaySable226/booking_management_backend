const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');

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
    data: payments
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
    data: payment
  });
});

// @desc    Get payment statistics
// @route   GET /api/payments/stats
// @access  Private (Admin)
exports.getPaymentStats = asyncHandler(async (req, res, next) => {
  const stats = await Payment.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    }
  ]);

  res.status(200).json({
    success: true,
    data: stats
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
    data: payments
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
