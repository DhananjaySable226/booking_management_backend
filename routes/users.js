const express = require('express');
const { body, validationResult } = require('express-validator');
const { protect, authorize } = require('../middleware/auth');
const {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  updateUserRole,
  toggleUserActive,
  verifyUserEmail,
  getUsersByRole,
  searchUsers,
  exportUsers,
  bulkUpdateUsers,
  bulkDeleteUsers,
  getUserStats
} = require('../controllers/userController');

const router = express.Router();

// Validation middleware
const updateUserValidation = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('phone')
    .optional()
    .matches(/^\+?[\d\s-()]+$/)
    .withMessage('Please provide a valid phone number'),
  body('role')
    .optional()
    .isIn(['user', 'service_provider', 'admin'])
    .withMessage('Invalid role')
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

// All routes are protected
router.use(protect);

// Admin routes
router.get('/', authorize('admin'), getUsers);
router.get('/stats', authorize('admin'), getUserStats);
router.get('/search', authorize('admin'), searchUsers);
router.get('/export', authorize('admin'), exportUsers);
router.get('/role/:role', authorize('admin'), getUsersByRole);
router.get('/:id', authorize('admin'), getUser);

router.post('/', authorize('admin'), createUser);
router.put('/:id', authorize('admin'), updateUserValidation, checkValidation, updateUser);
router.put('/:id/role', authorize('admin'), updateUserRole);
router.put('/:id/toggle-active', authorize('admin'), toggleUserActive);
router.put('/:id/verify-email', authorize('admin'), verifyUserEmail);
router.put('/bulk-update', authorize('admin'), bulkUpdateUsers);

router.delete('/:id', authorize('admin'), deleteUser);
router.delete('/bulk-delete', authorize('admin'), bulkDeleteUsers);

module.exports = router;
