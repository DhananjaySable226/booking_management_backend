const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');

// @desc    Get all users
// @route   GET /api/users
// @access  Private (Admin)
exports.getUsers = asyncHandler(async (req, res, next) => {
  let query;

  // Copy req.query
  const reqQuery = { ...req.query };

  // Fields to exclude
  const removeFields = ['select', 'sort', 'page', 'limit'];

  // Loop over removeFields and delete them from reqQuery
  removeFields.forEach(param => delete reqQuery[param]);

  // Create query string
  let queryStr = JSON.stringify(reqQuery);

  // Create operators ($gt, $gte, etc)
  queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, match => `$${match}`);

  // Finding resource
  query = User.find(JSON.parse(queryStr));

  // Select Fields
  if (req.query.select) {
    const fields = req.query.select.split(',').join(' ');
    query = query.select(fields);
  }

  // Sort
  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    query = query.sort(sortBy);
  } else {
    query = query.sort('-createdAt');
  }

  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const total = await User.countDocuments();

  query = query.skip(startIndex).limit(limit);

  // Executing query
  const users = await query;

  // Pagination result
  const pagination = {};

  if (endIndex < total) {
    pagination.next = {
      page: page + 1,
      limit
    };
  }

  if (startIndex > 0) {
    pagination.prev = {
      page: page - 1,
      limit
    };
  }

  res.status(200).json({
    success: true,
    count: users.length,
    pagination,
    data: users
  });
});

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private (Admin)
exports.getUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Create user
// @route   POST /api/users
// @access  Private (Admin)
exports.createUser = asyncHandler(async (req, res, next) => {
  const user = await User.create(req.body);

  res.status(201).json({
    success: true,
    data: user
  });
});

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private (Admin)
exports.updateUser = asyncHandler(async (req, res, next) => {
  let user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
  }

  user = await User.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private (Admin)
exports.deleteUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
  }

  await user.remove();

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Get user statistics
// @route   GET /api/users/stats
// @access  Private (Admin)
exports.getUserStats = asyncHandler(async (req, res, next) => {
  const stats = await User.aggregate([
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 }
      }
    }
  ]);

  const verificationStats = await User.aggregate([
    {
      $group: {
        _id: '$isEmailVerified',
        count: { $sum: 1 }
      }
    }
  ]);

  const activeStats = await User.aggregate([
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
      roleDistribution: stats,
      verificationStats,
      activeStats
    }
  });
});

// @desc    Update user role
// @route   PUT /api/users/:id/role
// @access  Private (Admin)
exports.updateUserRole = asyncHandler(async (req, res, next) => {
  const { role } = req.body;

  if (!['user', 'service_provider', 'admin'].includes(role)) {
    return next(new ErrorResponse('Invalid role. Must be user, service_provider, or admin', 400));
  }

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { role },
    {
      new: true,
      runValidators: true
    }
  );

  if (!user) {
    return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Toggle user active status
// @route   PUT /api/users/:id/toggle-active
// @access  Private (Admin)
exports.toggleUserActive = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
  }

  user.isActive = !user.isActive;
  await user.save();

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Verify user email
// @route   PUT /api/users/:id/verify-email
// @access  Private (Admin)
exports.verifyUserEmail = asyncHandler(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isEmailVerified: true },
    {
      new: true,
      runValidators: true
    }
  );

  if (!user) {
    return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Get users by role
// @route   GET /api/users/role/:role
// @access  Private (Admin)
exports.getUsersByRole = asyncHandler(async (req, res, next) => {
  const users = await User.find({ role: req.params.role }).sort('-createdAt');

  res.status(200).json({
    success: true,
    count: users.length,
    data: users
  });
});

// @desc    Search users
// @route   GET /api/users/search
// @access  Private (Admin)
exports.searchUsers = asyncHandler(async (req, res, next) => {
  const { q, role, isActive, isEmailVerified } = req.query;

  let query = {};

  // Search by query
  if (q) {
    query.$or = [
      { firstName: { $regex: q, $options: 'i' } },
      { lastName: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } }
    ];
  }

  // Filter by role
  if (role) {
    query.role = role;
  }

  // Filter by active status
  if (isActive !== undefined) {
    query.isActive = isActive === 'true';
  }

  // Filter by email verification
  if (isEmailVerified !== undefined) {
    query.isEmailVerified = isEmailVerified === 'true';
  }

  const users = await User.find(query).sort('-createdAt');

  res.status(200).json({
    success: true,
    count: users.length,
    data: users
  });
});

// @desc    Export users
// @route   GET /api/users/export
// @access  Private (Admin)
exports.exportUsers = asyncHandler(async (req, res, next) => {
  const { format = 'json', filters } = req.query;

  let query = {};
  if (filters) {
    query = JSON.parse(filters);
  }

  const users = await User.find(query).select('-password');

  if (format === 'csv') {
    // Convert to CSV format
    const csvData = users.map(user => ({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isActive: user.isActive,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt
    }));

    res.status(200).json({
      success: true,
      data: csvData
    });
  } else {
    res.status(200).json({
      success: true,
      data: users
    });
  }
});

// @desc    Bulk update users
// @route   PUT /api/users/bulk-update
// @access  Private (Admin)
exports.bulkUpdateUsers = asyncHandler(async (req, res, next) => {
  const { userIds, updates } = req.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return next(new ErrorResponse('Please provide an array of user IDs', 400));
  }

  if (!updates || Object.keys(updates).length === 0) {
    return next(new ErrorResponse('Please provide updates to apply', 400));
  }

  const result = await User.updateMany(
    { _id: { $in: userIds } },
    updates
  );

  res.status(200).json({
    success: true,
    data: {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    }
  });
});

// @desc    Delete multiple users
// @route   DELETE /api/users/bulk-delete
// @access  Private (Admin)
exports.bulkDeleteUsers = asyncHandler(async (req, res, next) => {
  const { userIds } = req.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return next(new ErrorResponse('Please provide an array of user IDs', 400));
  }

  const result = await User.deleteMany({ _id: { $in: userIds } });

  res.status(200).json({
    success: true,
    data: {
      deletedCount: result.deletedCount
    }
  });
});
