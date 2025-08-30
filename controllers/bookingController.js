const Booking = require('../models/Booking');
const Service = require('../models/Service');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');

// @desc    Get all bookings
// @route   GET /api/bookings
// @access  Private
exports.getBookings = asyncHandler(async (req, res, next) => {
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
  query = Booking.find(JSON.parse(queryStr))
    .populate('user', 'name email')
    .populate('service', 'name price images')
    .populate('provider', 'name email');

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
  const total = await Booking.countDocuments();

  query = query.skip(startIndex).limit(limit);

  // Executing query
  const bookings = await query;

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
    count: bookings.length,
    pagination,
    data: bookings
  });
});

// @desc    Get single booking
// @route   GET /api/bookings/:id
// @access  Private
exports.getBooking = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id)
    .populate('user', 'name email phone')
    .populate('service', 'name price images description')
    .populate('provider', 'name email phone avatar');

  if (!booking) {
    return next(new ErrorResponse(`Booking not found with id of ${req.params.id}`, 404));
  }

  // Make sure user owns booking or is admin/provider
  if (booking.user._id.toString() !== req.user.id &&
    booking.provider._id.toString() !== req.user.id &&
    req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to access this booking`, 401));
  }

  res.status(200).json({
    success: true,
    data: booking
  });
});

// @desc    Create new booking
// @route   POST /api/bookings
// @access  Private
exports.createBooking = asyncHandler(async (req, res, next) => {
  // Add user to req.body
  req.body.user = req.user.id;

  // Check if service exists
  const service = await Service.findById(req.body.serviceId);
  if (!service) {
    return next(new ErrorResponse(`Service not found with id of ${req.body.serviceId}`, 404));
  }

  // Check if service is active
  if (!service.isActive) {
    return next(new ErrorResponse('Service is not available for booking', 400));
  }

  // Check availability
  const isAvailable = await Booking.checkAvailability(
    req.body.serviceId,
    req.body.bookingDate,
    req.body.startTime,
    req.body.endTime
  );

  if (!isAvailable) {
    return next(new ErrorResponse('Selected time slot is not available', 400));
  }

  // Calculate total amount (support both numeric and object price)
  const duration = Number(req.body.duration) || 1;
  const serviceUnitPrice = (service && service.price && typeof service.price === 'object')
    ? Number(service.price.amount || 0)
    : Number(service?.price || 0);
  const totalAmount = serviceUnitPrice * duration;

  const bookingData = {
    ...req.body,
    service: req.body.serviceId,
    provider: service.provider,
    totalAmount,
    status: 'pending',
    paymentStatus: 'pending'
  };

  const booking = await Booking.create(bookingData);

  res.status(201).json({
    success: true,
    data: booking
  });
});

// @desc    Update booking
// @route   PUT /api/bookings/:id
// @access  Private
exports.updateBooking = asyncHandler(async (req, res, next) => {
  let booking = await Booking.findById(req.params.id);

  if (!booking) {
    return next(new ErrorResponse(`Booking not found with id of ${req.params.id}`, 404));
  }

  // Make sure user owns booking or is admin/provider
  if (booking.user.toString() !== req.user.id &&
    booking.provider.toString() !== req.user.id &&
    req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to update this booking`, 401));
  }

  // Check if booking can be updated
  if (!booking.canBeCancelled()) {
    return next(new ErrorResponse('Booking cannot be updated at this time', 400));
  }

  booking = await Booking.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    success: true,
    data: booking
  });
});

// @desc    Delete booking
// @route   DELETE /api/bookings/:id
// @access  Private
exports.deleteBooking = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    return next(new ErrorResponse(`Booking not found with id of ${req.params.id}`, 404));
  }

  // Make sure user owns booking or is admin
  if (booking.user.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to delete this booking`, 401));
  }

  await booking.remove();

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Get user bookings (for both users and service providers)
// @route   GET /api/bookings/my-bookings
// @access  Private
exports.getUserBookings = asyncHandler(async (req, res, next) => {
  let bookings;

  if (req.user.role === 'service_provider') {
    // For service providers, get bookings where they are the provider
    bookings = await Booking.find({ provider: req.user.id })
      .populate('user', 'name email phone')
      .populate('service', 'name price images')
      .sort('-createdAt');
  } else {
    // For regular users, get bookings where they are the customer
    bookings = await Booking.find({ user: req.user.id })
      .populate('service', 'name price images')
      .populate('provider', 'name email avatar')
      .sort('-createdAt');
  }

  res.status(200).json({
    success: true,
    count: bookings.length,
    data: bookings
  });
});

// @desc    Get provider bookings
// @route   GET /api/bookings/provider
// @access  Private
exports.getProviderBookings = asyncHandler(async (req, res, next) => {
  const bookings = await Booking.find({ provider: req.user.id })
    .populate('user', 'name email phone')
    .populate('service', 'name price images')
    .sort('-createdAt');

  res.status(200).json({
    success: true,
    count: bookings.length,
    data: bookings
  });
});

// @desc    Cancel booking
// @route   PUT /api/bookings/:id/cancel
// @access  Private
exports.cancelBooking = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    return next(new ErrorResponse(`Booking not found with id of ${req.params.id}`, 404));
  }

  // Make sure user owns booking or is admin/provider
  if (booking.user.toString() !== req.user.id &&
    booking.provider.toString() !== req.user.id &&
    req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to cancel this booking`, 401));
  }

  // Check if booking can be cancelled
  if (!booking.canBeCancelled()) {
    return next(new ErrorResponse('Booking cannot be cancelled at this time', 400));
  }

  // Calculate cancellation fee
  const cancellationFee = booking.calculateCancellationFee();

  booking.status = 'cancelled';
  // Set cancelledBy based on user role, not user ID
  if (req.user.role === 'admin') {
    booking.cancelledBy = 'admin';
  } else if (req.user.role === 'provider') {
    booking.cancelledBy = 'provider';
  } else {
    booking.cancelledBy = 'user';
  }
  booking.cancellationReason = req.body.reason;
  booking.cancellationFee = cancellationFee;
  booking.refundAmount = booking.totalAmount - cancellationFee;

  await booking.save();

  res.status(200).json({
    success: true,
    data: booking
  });
});

// @desc    Cancel booking (user-friendly)
//          - Always allow when status is 'pending'
//          - Allow when 'confirmed' only if canBeCancelled() returns true
// @route   POST /api/bookings/:id/cancel-user
// @access  Private
exports.cancelBookingUser = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    return next(new ErrorResponse(`Booking not found with id of ${req.params.id}`, 404));
  }

  // Make sure user owns booking or is admin/provider
  if (booking.user.toString() !== req.user.id &&
    booking.provider.toString() !== req.user.id &&
    req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to cancel this booking`, 401));
  }

  const status = booking.status;
  const isPending = status === 'pending';
  const isConfirmed = status === 'confirmed';

  if (!(isPending || (isConfirmed && booking.canBeCancelled()))) {
    return next(new ErrorResponse('Booking cannot be cancelled at this time', 400));
  }

  // Calculate fee only for confirmed bookings; pending incurs no fee
  const cancellationFee = isConfirmed ? booking.calculateCancellationFee() : 0;

  booking.status = 'cancelled';
  // Set cancelledBy based on user role, not user ID
  if (req.user.role === 'admin') {
    booking.cancelledBy = 'admin';
  } else if (req.user.role === 'provider') {
    booking.cancelledBy = 'provider';
  } else {
    booking.cancelledBy = 'user';
  }
  booking.cancellationReason = req.body.reason;
  booking.cancellationFee = cancellationFee;
  booking.refundAmount = booking.totalAmount - cancellationFee;

  await booking.save();

  res.status(200).json({
    success: true,
    data: booking
  });
});

// @desc    Rate booking
// @route   POST /api/bookings/:id/rate
// @access  Private
exports.rateBooking = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    return next(new ErrorResponse(`Booking not found with id of ${req.params.id}`, 404));
  }

  // Make sure user owns booking
  if (booking.user.toString() !== req.user.id) {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to rate this booking`, 401));
  }

  // Check if booking is completed
  if (booking.status !== 'completed') {
    return next(new ErrorResponse('Can only rate completed bookings', 400));
  }

  // Check if already rated
  if (booking.rating) {
    return next(new ErrorResponse('Booking has already been rated', 400));
  }

  booking.rating = req.body.rating;
  booking.review = req.body.review;
  await booking.save();

  // Update service rating
  const service = await Service.findById(booking.service);
  if (service) {
    await service.updateAverageRating();
  }

  res.status(200).json({
    success: true,
    data: booking
  });
});

// @desc    Check availability
// @route   GET /api/bookings/availability
// @access  Public
exports.checkAvailability = asyncHandler(async (req, res, next) => {
  const { serviceId, date, time } = req.query;

  if (!serviceId || !date || !time) {
    return next(new ErrorResponse('Please provide serviceId, date, and time', 400));
  }

  const isAvailable = await Booking.checkAvailability(serviceId, date, time);

  res.status(200).json({
    success: true,
    data: { available: isAvailable }
  });
});

// @desc    Add booking note
// @route   POST /api/bookings/:id/notes
// @access  Private
exports.addBookingNote = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    return next(new ErrorResponse(`Booking not found with id of ${req.params.id}`, 404));
  }

  // Make sure user is provider or admin
  if (booking.provider.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to add notes to this booking`, 401));
  }

  booking.notes.push({
    user: req.user.id,
    note: req.body.note,
    createdAt: new Date()
  });

  await booking.save();

  res.status(200).json({
    success: true,
    data: booking
  });
});

// @desc    Accept pending booking (Provider only)
// @route   PUT /api/bookings/:id/accept
// @access  Private (Service Provider)
exports.acceptBooking = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    return next(new ErrorResponse(`Booking not found with id of ${req.params.id}`, 404));
  }

  // Make sure user is the provider for this booking
  if (booking.provider.toString() !== req.user.id) {
    return next(new ErrorResponse(`You are not authorized to accept this booking`, 401));
  }

  // Check if booking can be accepted
  if (booking.status !== 'pending') {
    return next(new ErrorResponse(`Only pending bookings can be accepted. Current status: ${booking.status}`, 400));
  }

  // Update booking status to confirmed
  booking.status = 'confirmed';
  await booking.save();

  res.status(200).json({
    success: true,
    message: 'Booking accepted successfully',
    data: booking
  });
});

// @desc    Reject pending booking (Provider only)
// @route   PUT /api/bookings/:id/reject
// @access  Private (Service Provider)
exports.rejectBooking = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    return next(new ErrorResponse(`Booking not found with id of ${req.params.id}`, 404));
  }

  // Make sure user is the provider for this booking
  if (booking.provider.toString() !== req.user.id) {
    return next(new ErrorResponse(`You are not authorized to reject this booking`, 401));
  }

  // Check if booking can be rejected
  if (booking.status !== 'pending') {
    return next(new ErrorResponse(`Only pending bookings can be rejected. Current status: ${booking.status}`, 400));
  }

  // Validate rejection reason
  if (!req.body.reason || req.body.reason.trim().length === 0) {
    return next(new ErrorResponse('Rejection reason is required', 400));
  }

  // Update booking status to cancelled
  booking.status = 'cancelled';
  booking.cancelledBy = 'provider';
  booking.cancellationReason = req.body.reason;
  booking.cancellationFee = 0; // No fee when provider rejects
  booking.refundAmount = booking.totalAmount; // Full refund
  await booking.save();

  res.status(200).json({
    success: true,
    message: 'Booking rejected successfully',
    data: booking
  });
});

// @desc    Complete confirmed booking (Provider only)
// @route   PUT /api/bookings/:id/complete
// @access  Private (Service Provider)
exports.completeBooking = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    return next(new ErrorResponse(`Booking not found with id of ${req.params.id}`, 404));
  }

  // Make sure user is the provider for this booking
  if (booking.provider.toString() !== req.user.id) {
    return next(new ErrorResponse(`You are not authorized to complete this booking`, 401));
  }

  // Check if booking can be completed
  if (booking.status !== 'confirmed') {
    return next(new ErrorResponse(`Only confirmed bookings can be completed. Current status: ${booking.status}`, 400));
  }

  // Update booking status to completed
  booking.status = 'completed';
  await booking.save();

  res.status(200).json({
    success: true,
    message: 'Booking completed successfully',
    data: booking
  });
});

// @desc    Update booking status (Enhanced version)
// @route   PUT /api/bookings/:id/status
// @access  Private (Service Provider, Admin)
exports.updateBookingStatus = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    return next(new ErrorResponse(`Booking not found with id of ${req.params.id}`, 404));
  }

  // Make sure user is provider or admin
  if (booking.provider.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to update this booking status`, 401));
  }

  const { status, reason } = req.body;

  // Validate status transition
  const validTransitions = {
    'pending': ['confirmed', 'cancelled'],
    'confirmed': ['in_progress', 'completed', 'cancelled', 'no_show'],
    'in_progress': ['completed', 'cancelled'],
    'completed': [], // No further transitions
    'cancelled': [], // No further transitions
    'no_show': [] // No further transitions
  };

  if (!validTransitions[booking.status].includes(status)) {
    return next(new ErrorResponse(`Invalid status transition from ${booking.status} to ${status}`, 400));
  }

  // Handle cancellation if status is being changed to cancelled
  if (status === 'cancelled') {
    if (!reason || reason.trim().length === 0) {
      return next(new ErrorResponse('Cancellation reason is required', 400));
    }

    booking.cancelledBy = req.user.role === 'admin' ? 'admin' : 'provider';
    booking.cancellationReason = reason;

    // Calculate cancellation fee if applicable
    if (booking.status === 'confirmed') {
      const cancellationFee = booking.calculateCancellationFee();
      booking.cancellationFee = cancellationFee;
      booking.refundAmount = booking.totalAmount - cancellationFee;
    } else {
      booking.cancellationFee = 0;
      booking.refundAmount = booking.totalAmount;
    }
  }

  // Update status
  booking.status = status;
  await booking.save();

  res.status(200).json({
    success: true,
    message: `Booking status updated to ${status}`,
    data: booking
  });
});

// @desc    Get booking statistics
// @route   GET /api/bookings/stats
// @access  Private
exports.getBookingStats = asyncHandler(async (req, res, next) => {
  const stats = await Booking.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$totalAmount' }
      }
    }
  ]);

  res.status(200).json({
    success: true,
    data: stats
  });
});

// @desc    Export bookings
// @route   GET /api/bookings/export
// @access  Private (Admin)
exports.exportBookings = asyncHandler(async (req, res, next) => {
  const bookings = await Booking.find()
    .populate('user', 'name email')
    .populate('service', 'name')
    .populate('provider', 'name email');

  // Convert to CSV format
  const csvData = bookings.map(booking => ({
    id: booking._id,
    user: booking.user.name,
    service: booking.service.name,
    provider: booking.provider.name,
    date: booking.bookingDate,
    time: booking.startTime,
    status: booking.status,
    amount: booking.totalAmount,
    createdAt: booking.createdAt
  }));

  res.status(200).json({
    success: true,
    data: csvData
  });
});
