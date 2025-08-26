const Service = require('../models/Service');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');

// @desc    Get all services
// @route   GET /api/services
// @access  Public
exports.getServices = asyncHandler(async (req, res, next) => {
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
  query = Service.find(JSON.parse(queryStr)).populate('provider', 'name email avatar');

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
  const limit = parseInt(req.query.limit, 10) || 12;
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const total = await Service.countDocuments();

  query = query.skip(startIndex).limit(limit);

  // Executing query
  const services = await query;

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
    count: services.length,
    pagination,
    data: services
  });
});

// @desc    Get single service
// @route   GET /api/services/:id
// @access  Public
exports.getService = asyncHandler(async (req, res, next) => {
  const service = await Service.findById(req.params.id)
    .populate('provider', 'name email avatar phone')
    .populate('reviews.user', 'name avatar');

  if (!service) {
    return next(new ErrorResponse(`Service not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: service
  });
});

// @desc    Create new service
// @route   POST /api/services
// @access  Private
exports.createService = asyncHandler(async (req, res, next) => {
  // Add user to req.body
  req.body.provider = req.user.id;

  const service = await Service.create(req.body);

  res.status(201).json({
    success: true,
    data: service
  });
});

// @desc    Update service
// @route   PUT /api/services/:id
// @access  Private
exports.updateService = asyncHandler(async (req, res, next) => {
  let service = await Service.findById(req.params.id);

  if (!service) {
    return next(new ErrorResponse(`Service not found with id of ${req.params.id}`, 404));
  }

  // Make sure user is service provider or admin
  if (service.provider.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to update this service`, 401));
  }

  service = await Service.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    success: true,
    data: service
  });
});

// @desc    Delete service
// @route   DELETE /api/services/:id
// @access  Private
exports.deleteService = asyncHandler(async (req, res, next) => {
  const service = await Service.findById(req.params.id);

  if (!service) {
    return next(new ErrorResponse(`Service not found with id of ${req.params.id}`, 404));
  }

  // Make sure user is service provider or admin
  if (service.provider.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to delete this service`, 401));
  }

  await service.remove();

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Get services within a radius
// @route   GET /api/services/radius/:zipcode/:distance
// @access  Private
exports.getServicesInRadius = asyncHandler(async (req, res, next) => {
  const { zipcode, distance } = req.params;

  // Get lat/lng from geocoder
  const loc = await geocoder.geocode(zipcode);
  const lat = loc[0].latitude;
  const lng = loc[0].longitude;

  // Calc radius using radians
  // Divide dist by radius of Earth
  // Earth Radius = 3,963 mi / 6,378 km
  const radius = distance / 3963;

  const services = await Service.find({
    location: { $geoWithin: { $centerSphere: [[lng, lat], radius] } }
  });

  res.status(200).json({
    success: true,
    count: services.length,
    data: services
  });
});

// @desc    Upload photo for service
// @route   PUT /api/services/:id/photo
// @access  Private
exports.servicePhotoUpload = asyncHandler(async (req, res, next) => {
  const service = await Service.findById(req.params.id);

  if (!service) {
    return next(new ErrorResponse(`Service not found with id of ${req.params.id}`, 404));
  }

  // Make sure user is service provider or admin
  if (service.provider.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to update this service`, 401));
  }

  if (!req.file) {
    return next(new ErrorResponse(`Please upload a file`, 400));
  }

  const file = req.file;

  // Make sure the image is a photo
  if (!file.mimetype.startsWith('image')) {
    return next(new ErrorResponse(`Please upload an image file`, 400));
  }

  // Check filesize
  if (file.size > process.env.MAX_FILE_SIZE) {
    return next(new ErrorResponse(`File size must be less than ${process.env.MAX_FILE_SIZE}`, 400));
  }

  // Create custom filename
  file.name = `photo_${service._id}${path.parse(file.name).ext}`;

  file.mv(`${process.env.FILE_UPLOAD_PATH}/${file.name}`, async err => {
    if (err) {
      console.error(err);
      return next(new ErrorResponse(`Problem with file upload`, 500));
    }

    await Service.findByIdAndUpdate(req.params.id, { photo: file.name });

    res.status(200).json({
      success: true,
      data: file.name
    });
  });
});

// @desc    Search services
// @route   GET /api/services/search
// @access  Public
exports.searchServices = asyncHandler(async (req, res, next) => {
  const { q, category, location, minPrice, maxPrice, rating } = req.query;

  let query = {};

  // Search by query
  if (q) {
    query.$or = [
      { name: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
      { category: { $regex: q, $options: 'i' } }
    ];
  }

  // Filter by category
  if (category) {
    query.category = category;
  }

  // Filter by location
  if (location) {
    query['location.city'] = { $regex: location, $options: 'i' };
  }

  // Filter by price range
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = parseFloat(minPrice);
    if (maxPrice) query.price.$lte = parseFloat(maxPrice);
  }

  // Filter by rating
  if (rating) {
    query.rating = { $gte: parseFloat(rating) };
  }

  // Only show active services
  query.isActive = true;

  const services = await Service.find(query)
    .populate('provider', 'name email avatar')
    .sort('-createdAt');

  res.status(200).json({
    success: true,
    count: services.length,
    data: services
  });
});

// @desc    Get services by category
// @route   GET /api/services/category/:category
// @access  Public
exports.getServicesByCategory = asyncHandler(async (req, res, next) => {
  const services = await Service.find({ 
    category: req.params.category,
    isActive: true 
  }).populate('provider', 'name email avatar');

  res.status(200).json({
    success: true,
    count: services.length,
    data: services
  });
});

// @desc    Get featured services
// @route   GET /api/services/featured
// @access  Public
exports.getFeaturedServices = asyncHandler(async (req, res, next) => {
  const services = await Service.find({ 
    isFeatured: true,
    isActive: true 
  })
    .populate('provider', 'name email avatar')
    .limit(6)
    .sort('-rating');

  res.status(200).json({
    success: true,
    count: services.length,
    data: services
  });
});

// @desc    Add review to service
// @route   POST /api/services/:id/reviews
// @access  Private
exports.addServiceReview = asyncHandler(async (req, res, next) => {
  const service = await Service.findById(req.params.id);

  if (!service) {
    return next(new ErrorResponse(`Service not found with id of ${req.params.id}`, 404));
  }

  // Check if user already reviewed
  const existingReview = service.reviews.find(
    review => review.user.toString() === req.user.id
  );

  if (existingReview) {
    return next(new ErrorResponse('User has already reviewed this service', 400));
  }

  const review = {
    user: req.user.id,
    rating: req.body.rating,
    comment: req.body.comment
  };

  service.reviews.push(review);

  // Update average rating
  service.rating = service.reviews.reduce((acc, item) => item.rating + acc, 0) / service.reviews.length;

  await service.save();

  res.status(200).json({
    success: true,
    data: service
  });
});

// @desc    Update service availability
// @route   PUT /api/services/:id/availability
// @access  Private
exports.updateServiceAvailability = asyncHandler(async (req, res, next) => {
  const service = await Service.findById(req.params.id);

  if (!service) {
    return next(new ErrorResponse(`Service not found with id of ${req.params.id}`, 404));
  }

  // Make sure user is service provider or admin
  if (service.provider.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to update this service`, 401));
  }

  service.availability = req.body.availability;
  await service.save();

  res.status(200).json({
    success: true,
    data: service
  });
});

// @desc    Get provider services
// @route   GET /api/services/provider/:providerId
// @access  Public
exports.getProviderServices = asyncHandler(async (req, res, next) => {
  const services = await Service.find({ 
    provider: req.params.providerId,
    isActive: true 
  }).populate('provider', 'name email avatar');

  res.status(200).json({
    success: true,
    count: services.length,
    data: services
  });
});

// @desc    Get service statistics
// @route   GET /api/services/stats
// @access  Private (Admin)
exports.getServiceStats = asyncHandler(async (req, res, next) => {
  const stats = await Service.aggregate([
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        avgRating: { $avg: '$rating' },
        avgPrice: { $avg: '$price' }
      }
    }
  ]);

  res.status(200).json({
    success: true,
    data: stats
  });
});
