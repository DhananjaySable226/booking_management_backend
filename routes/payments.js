const express = require('express');
const { body, validationResult } = require('express-validator');
const { protect, authorize } = require('../middleware/auth');
const {
  createPaymentIntent,
  confirmPayment,
  getPaymentHistory,
  getPaymentDetails,
  refundPayment,
  createStripeCustomer,
  getPaymentMethods,
  addPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  setDefaultPaymentMethod,
  getPaymentStats,
  getAllPayments,
  exportPayments,
  handleWebhook
} = require('../controllers/paymentController');

const router = express.Router();

// Validation middleware
const paymentIntentValidation = [
  body('bookingId')
    .isMongoId()
    .withMessage('Valid booking ID is required'),
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Valid amount is required'),
  body('currency')
    .optional()
    .isIn(['USD', 'EUR', 'GBP', 'INR'])
    .withMessage('Invalid currency')
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

// Public routes (webhook)
router.post('/webhook', handleWebhook);

// All other routes are protected
router.use(protect);

// Payment routes
router.post('/create-payment-intent', authorize('user'), paymentIntentValidation, checkValidation, createPaymentIntent);
router.post('/confirm-payment', authorize('user'), confirmPayment);
router.get('/history', authorize('user'), getPaymentHistory);
router.get('/:paymentId', authorize('user', 'admin'), getPaymentDetails);
router.post('/:paymentId/refund', authorize('admin'), refundValidation, checkValidation, refundPayment);

// Payment methods
router.get('/payment-methods', authorize('user'), getPaymentMethods);
router.post('/payment-methods', authorize('user'), addPaymentMethod);
router.put('/payment-method/:id', authorize('user'), updatePaymentMethod);
router.delete('/payment-methods/:id', authorize('user'), deletePaymentMethod);
router.put('/payment-methods/:id/default', authorize('user'), setDefaultPaymentMethod);

// Customer management
router.post('/customer', authorize('user'), createStripeCustomer);

// Admin routes
router.get('/stats', authorize('admin'), getPaymentStats);
router.get('/', authorize('admin'), getAllPayments);
router.get('/export', authorize('admin'), exportPayments);

module.exports = router;
