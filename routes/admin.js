const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const {
  getDashboardStats,
  getRevenueAnalytics,
  getBookingAnalytics,
  getUserAnalytics,
  getServiceAnalytics,
  exportData,
  getSystemHealth,
  sendBulkNotifications
} = require('../controllers/adminController');

const router = express.Router();

// All routes are protected and require admin access
router.use(protect);
router.use(authorize('admin'));

// Dashboard and analytics
router.get('/dashboard', getDashboardStats);
router.get('/analytics/revenue', getRevenueAnalytics);
router.get('/analytics/bookings', getBookingAnalytics);
router.get('/analytics/users', getUserAnalytics);
router.get('/analytics/services', getServiceAnalytics);

// System management
router.get('/system/health', getSystemHealth);
router.post('/notifications/bulk', sendBulkNotifications);

// Data export
router.get('/export/:type', exportData);

module.exports = router;
