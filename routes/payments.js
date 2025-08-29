const express = require('express');
const { body, validationResult } = require('express-validator');
const { protect, authorize } = require('../middleware/auth');
const {
  getPaymentHistory,
  getPaymentDetails,
  getPaymentStats,
  getAllPayments,
  exportPayments
} = require('../controllers/paymentController');

// Import Razorpay controllers
const {
  createRazorpayOrder,
  verifyRazorpayPayment,
  getRazorpayPaymentDetails,
  refundRazorpayPayment,
  handleRazorpayWebhook,
  getRazorpayPaymentMethods,
  createRazorpayCustomer
} = require('../controllers/razorpayController');

const router = express.Router();

const razorpayOrderValidation = [
  body('amount')
    .isFloat({ min: 1 })
    .withMessage('Valid amount is required (minimum 1)'),
  body('currency')
    .optional()
    .isIn(['INR', 'USD', 'EUR', 'GBP'])
    .withMessage('Invalid currency'),
  body('receipt')
    .optional()
    .isString()
    .withMessage('Receipt must be a string'),
  body('notes')
    .optional()
    .isObject()
    .withMessage('Notes must be an object')
];

const refundValidation = [
  body('amount')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Valid refund amount is required'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Reason cannot exceed 200 characters')
];

// Check validation results
const checkValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }
  next();
};

// Public routes (webhooks)
router.post('/razorpay/webhook', handleRazorpayWebhook);

// Public Razorpay routes
router.get('/razorpay/payment-methods', getRazorpayPaymentMethods);

// All other routes are protected
router.use(protect);

// Razorpay routes
router.post('/razorpay/create-order', authorize('user'), razorpayOrderValidation, checkValidation, createRazorpayOrder);
router.post('/razorpay/verify', authorize('user'), verifyRazorpayPayment);
router.get('/razorpay/:paymentId', authorize('user', 'admin'), getRazorpayPaymentDetails);
router.post('/razorpay/:paymentId/refund', authorize('admin'), refundValidation, checkValidation, refundRazorpayPayment);
router.post('/razorpay/customer', authorize('user'), createRazorpayCustomer);

// Generic payment data routes
router.get('/history', authorize('user'), getPaymentHistory);

// Statistics route (must be declared BEFORE dynamic :paymentId)
router.get('/stats', protect, getPaymentStats);

// Dynamic payment detail route
router.get('/:paymentId', authorize('user', 'admin'), getPaymentDetails);
router.get('/', authorize('admin'), getAllPayments);
router.get('/export', authorize('admin'), exportPayments);

module.exports = router;
