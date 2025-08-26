const express = require('express');
const { body, validationResult } = require('express-validator');
const { protect, authorize, optionalAuth } = require('../middleware/auth');
const {
  getServices,
  getService,
  createService,
  updateService,
  deleteService,
  searchServices,
  getServicesByCategory,
  getFeaturedServices,
  addServiceReview,
  updateServiceAvailability,
  servicePhotoUpload,
  getServicesInRadius,
  getProviderServices,
  getServiceStats
} = require('../controllers/serviceController');

const router = express.Router();

// Validation middleware
const createServiceValidation = [
  body('name')
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Service name must be between 3 and 100 characters'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  body('category')
    .isIn(['hotel', 'doctor', 'vehicle', 'transport', 'equipment', 'other'])
    .withMessage('Invalid category'),
  body('price.amount')
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),
  body('location.address')
    .trim()
    .notEmpty()
    .withMessage('Address is required'),
  body('location.city')
    .trim()
    .notEmpty()
    .withMessage('City is required'),
  body('location.state')
    .trim()
    .notEmpty()
    .withMessage('State is required'),
  body('location.country')
    .trim()
    .notEmpty()
    .withMessage('Country is required')
];

const updateServiceValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Service name must be between 3 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  body('category')
    .optional()
    .isIn(['hotel', 'doctor', 'vehicle', 'transport', 'equipment', 'other'])
    .withMessage('Invalid category'),
  body('price.amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number')
];

const reviewValidation = [
  body('rating')
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

// Public routes
router.get('/', optionalAuth, getServices);
router.get('/search', optionalAuth, searchServices);
router.get('/category/:category', optionalAuth, getServicesByCategory);
router.get('/featured', optionalAuth, getFeaturedServices);
router.get('/:id', optionalAuth, getService);

// Protected routes
router.use(protect);

// Service provider and admin routes
router.post('/', authorize('service_provider', 'admin'), createServiceValidation, checkValidation, createService);
router.put('/:id', authorize('service_provider', 'admin'), updateServiceValidation, checkValidation, updateService);
router.delete('/:id', authorize('service_provider', 'admin'), deleteService);
router.put('/:id/availability', authorize('service_provider', 'admin'), updateServiceAvailability);

// Image upload routes
router.put('/:id/photo', authorize('service_provider', 'admin'), servicePhotoUpload);

// Additional service routes
router.get('/radius/:zipcode/:distance', getServicesInRadius);
router.get('/provider/:providerId', getProviderServices);
router.get('/stats', authorize('admin'), getServiceStats);

// Review routes (users can add reviews)
router.post('/:id/reviews', authorize('user'), reviewValidation, checkValidation, addServiceReview);

module.exports = router;
