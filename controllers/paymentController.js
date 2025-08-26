const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');

// @desc    Create payment intent
// @route   POST /api/payments/create-intent
// @access  Private
exports.createPaymentIntent = asyncHandler(async (req, res, next) => {
  const { amount, currency, metadata } = req.body;

  // Create payment intent with Stripe
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // Convert to cents
    currency: currency || 'usd',
    metadata: {
      userId: req.user.id,
      ...metadata
    }
  });

  res.status(200).json({
    success: true,
    data: {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    }
  });
});

// @desc    Confirm payment
// @route   POST /api/payments/confirm
// @access  Private
exports.confirmPayment = asyncHandler(async (req, res, next) => {
  const { paymentIntentId, paymentMethodId } = req.body;

  // Confirm the payment with Stripe
  const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
    payment_method: paymentMethodId
  });

  if (paymentIntent.status === 'succeeded') {
    // Create payment record in database
    const payment = await Payment.create({
      user: req.user.id,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount / 100, // Convert from cents
      currency: paymentIntent.currency,
      status: 'completed',
      paymentMethod: 'card',
      metadata: paymentIntent.metadata
    });

    // Update booking payment status if applicable
    if (paymentIntent.metadata.bookingId) {
      await Booking.findByIdAndUpdate(paymentIntent.metadata.bookingId, {
        paymentStatus: 'paid',
        paymentId: payment._id
      });
    }

    res.status(200).json({
      success: true,
      data: payment
    });
  } else {
    return next(new ErrorResponse('Payment confirmation failed', 400));
  }
});

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
// @route   GET /api/payments/:id
// @access  Private
exports.getPaymentDetails = asyncHandler(async (req, res, next) => {
  const payment = await Payment.findById(req.params.id)
    .populate('user', 'name email')
    .populate('booking', 'service bookingDate totalAmount');

  if (!payment) {
    return next(new ErrorResponse(`Payment not found with id of ${req.params.id}`, 404));
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

// @desc    Refund payment
// @route   POST /api/payments/:id/refund
// @access  Private (Admin)
exports.refundPayment = asyncHandler(async (req, res, next) => {
  const payment = await Payment.findById(req.params.id);

  if (!payment) {
    return next(new ErrorResponse(`Payment not found with id of ${req.params.id}`, 404));
  }

  // Create refund with Stripe
  const refund = await stripe.refunds.create({
    payment_intent: payment.paymentIntentId,
    amount: Math.round(payment.amount * 100), // Convert to cents
    reason: req.body.reason || 'requested_by_customer'
  });

  // Update payment record
  payment.status = 'refunded';
  payment.refundId = refund.id;
  payment.refundAmount = payment.amount;
  payment.refundReason = req.body.reason;
  await payment.save();

  // Update booking if applicable
  if (payment.booking) {
    await Booking.findByIdAndUpdate(payment.booking, {
      paymentStatus: 'refunded'
    });
  }

  res.status(200).json({
    success: true,
    data: payment
  });
});

// @desc    Create Stripe customer
// @route   POST /api/payments/customer
// @access  Private
exports.createStripeCustomer = asyncHandler(async (req, res, next) => {
  const { email, name, phone } = req.body;

  // Create customer with Stripe
  const customer = await stripe.customers.create({
    email: email || req.user.email,
    name: name || `${req.user.firstName} ${req.user.lastName}`,
    phone: phone || req.user.phone,
    metadata: {
      userId: req.user.id
    }
  });

  // Update user with Stripe customer ID
  await User.findByIdAndUpdate(req.user.id, {
    stripeCustomerId: customer.id
  });

  res.status(200).json({
    success: true,
    data: customer
  });
});

// @desc    Get payment methods
// @route   GET /api/payments/payment-methods
// @access  Private
exports.getPaymentMethods = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  if (!user.stripeCustomerId) {
    return res.status(200).json({
      success: true,
      data: []
    });
  }

  const paymentMethods = await stripe.paymentMethods.list({
    customer: user.stripeCustomerId,
    type: 'card'
  });

  res.status(200).json({
    success: true,
    data: paymentMethods.data
  });
});

// @desc    Add payment method
// @route   POST /api/payments/payment-methods
// @access  Private
exports.addPaymentMethod = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  if (!user.stripeCustomerId) {
    return next(new ErrorResponse('Stripe customer not found', 400));
  }

  const { paymentMethodId } = req.body;

  // Attach payment method to customer
  await stripe.paymentMethods.attach(paymentMethodId, {
    customer: user.stripeCustomerId
  });

  res.status(200).json({
    success: true,
    data: { paymentMethodId }
  });
});

// @desc    Update payment method
// @route   PUT /api/payments/payment-method/:id
// @access  Private
exports.updatePaymentMethod = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { billing_details } = req.body;

  const paymentMethod = await stripe.paymentMethods.update(id, {
    billing_details
  });

  res.status(200).json({
    success: true,
    data: paymentMethod
  });
});

// @desc    Delete payment method
// @route   DELETE /api/payments/payment-methods/:id
// @access  Private
exports.deletePaymentMethod = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  await stripe.paymentMethods.detach(id);

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Set default payment method
// @route   PUT /api/payments/payment-methods/:id/default
// @access  Private
exports.setDefaultPaymentMethod = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  const { id } = req.params;

  if (!user.stripeCustomerId) {
    return next(new ErrorResponse('Stripe customer not found', 400));
  }

  // Update customer's default payment method
  await stripe.customers.update(user.stripeCustomerId, {
    invoice_settings: {
      default_payment_method: id
    }
  });

  res.status(200).json({
    success: true,
    data: { paymentMethodId: id }
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

  // Convert to CSV format
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

// @desc    Handle Stripe webhook
// @route   POST /api/payments/webhook
// @access  Public
exports.handleWebhook = asyncHandler(async (req, res, next) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return next(new ErrorResponse(`Webhook Error: ${err.message}`, 400));
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      await handlePaymentSuccess(paymentIntent);
      break;
    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      await handlePaymentFailure(failedPayment);
      break;
    case 'charge.refunded':
      const refund = event.data.object;
      await handleRefund(refund);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.status(200).json({ received: true });
});

// Helper functions for webhook handling
const handlePaymentSuccess = async (paymentIntent) => {
  // Update payment status in database
  await Payment.findOneAndUpdate(
    { paymentIntentId: paymentIntent.id },
    { status: 'completed' }
  );

  // Update booking payment status if applicable
  if (paymentIntent.metadata.bookingId) {
    await Booking.findByIdAndUpdate(paymentIntent.metadata.bookingId, {
      paymentStatus: 'paid'
    });
  }
};

const handlePaymentFailure = async (paymentIntent) => {
  // Update payment status in database
  await Payment.findOneAndUpdate(
    { paymentIntentId: paymentIntent.id },
    { status: 'failed' }
  );

  // Update booking payment status if applicable
  if (paymentIntent.metadata.bookingId) {
    await Booking.findByIdAndUpdate(paymentIntent.metadata.bookingId, {
      paymentStatus: 'failed'
    });
  }
};

const handleRefund = async (charge) => {
  // Update payment status in database
  await Payment.findOneAndUpdate(
    { paymentIntentId: charge.payment_intent },
    { 
      status: 'refunded',
      refundAmount: charge.amount_refunded / 100
    }
  );
};
