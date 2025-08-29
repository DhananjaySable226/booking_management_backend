const express = require('express');
const { body, validationResult } = require('express-validator');
const { protect, authorize } = require('../middleware/auth');
const {
  getBookings,
  getBooking,
  createBooking,
  updateBooking,
  deleteBooking,
  cancelBooking,
  getUserBookings,
  getProviderBookings,
  checkAvailability,
  addBookingNote,
  rateBooking,
  updateBookingStatus,
  getBookingStats,
  exportBookings
} = require('../controllers/bookingController');

const router = express.Router();

// Validation middleware
const createBookingValidation = [
  body('serviceId')
    .isMongoId()
    .withMessage('Valid service ID is required'),
  body('bookingDate')
    .isISO8601()
    .withMessage('Valid booking date is required'),
  body('startTime')
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Valid start time is required (HH:MM format)'),
  body('endTime')
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Valid end time is required (HH:MM format)'),
  body('duration')
    .isFloat({ min: 0.5, max: 24 })
    .withMessage('Duration must be between 0.5 and 24 hours'),
  body('specialRequests')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Special requests cannot exceed 500 characters')
];

const updateBookingValidation = [
  body('bookingDate')
    .optional()
    .isISO8601()
    .withMessage('Valid booking date is required'),
  body('startTime')
    .optional()
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Valid start time is required (HH:MM format)'),
  body('endTime')
    .optional()
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Valid end time is required (HH:MM format)'),
  body('specialRequests')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Special requests cannot exceed 500 characters')
];

const ratingValidation = [
  body('score')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('comment')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Comment cannot exceed 500 characters')
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

// Public routes (before protection)
router.get('/check-availability/:serviceId', checkAvailability);

// All other routes are protected
router.use(protect);

// User and provider routes
router.get('/my-bookings', authorize('user', 'service_provider'), getUserBookings);
router.post('/', authorize('user'), createBookingValidation, checkValidation, createBooking);
router.get('/:id', authorize('user', 'service_provider', 'admin'), getBooking);
router.put('/:id', authorize('user', 'service_provider', 'admin'), updateBookingValidation, checkValidation, updateBooking);
router.post('/:id/cancel', authorize('user', 'service_provider', 'admin'), cancelBooking);
router.post('/:id/rate', authorize('user'), ratingValidation, checkValidation, rateBooking);

// Provider routes
router.get('/provider/my-bookings', authorize('service_provider'), getProviderBookings);

// Admin routes
router.get('/', authorize('admin'), getBookings);
router.get('/stats', authorize('admin'), getBookingStats);
router.get('/export', authorize('admin'), exportBookings);

// Provider and admin routes
router.post('/:id/notes', authorize('service_provider', 'admin'), addBookingNote);
router.put('/:id/status', authorize('service_provider', 'admin'), updateBookingStatus);

module.exports = router;
