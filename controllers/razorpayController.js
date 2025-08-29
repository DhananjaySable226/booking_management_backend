const Razorpay = require('razorpay');
const crypto = require('crypto');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// @desc    Create Razorpay order
// @route   POST /api/payments/razorpay/create-order
// @access  Private
exports.createRazorpayOrder = asyncHandler(async (req, res, next) => {
  const { amount, currency = 'INR', receipt, notes } = req.body;

  if (!amount || amount < 1) {
    return next(new ErrorResponse('Valid amount is required (minimum 1)', 400));
  }

  // Create order options
  const orderOptions = {
    amount: Math.round(amount * 100), // Convert to paise (smallest currency unit)
    currency: currency.toUpperCase(),
    receipt: receipt || `receipt_${Date.now()}`,
    notes: {
      userId: req.user.id,
      ...notes
    }
  };

  try {
    // Create order with Razorpay
    const order = await razorpay.orders.create(orderOptions);

    // Create payment record in database
    const payment = await Payment.create({
      user: req.user.id,
      paymentIntentId: order.id,
      razorpayOrderId: order.id,
      amount: amount,
      currency: currency.toUpperCase(),
      status: 'pending',
      paymentMethod: 'razorpay',
      description: notes?.description || 'Payment for booking',
      metadata: {
        orderId: order.id,
        userId: req.user.id,
        ...notes
      }
    });

    res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        paymentId: payment._id,
        keyId: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    console.error('Razorpay order creation error:', error);
    return next(new ErrorResponse('Failed to create payment order', 500));
  }
});

// @desc    Verify Razorpay payment
// @route   POST /api/payments/razorpay/verify
// @access  Private
exports.verifyRazorpayPayment = asyncHandler(async (req, res, next) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return next(new ErrorResponse('Missing payment verification parameters', 400));
  }

  try {
    if (!process.env.RAZORPAY_KEY_SECRET) {
      console.error('Missing RAZORPAY_KEY_SECRET');
      return next(new ErrorResponse('Payment configuration error', 500));
    }
    // Verify the payment signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return next(new ErrorResponse('Invalid payment signature', 400));
    }

    // Update payment record in database (trust signature for status)
    const updatedPayment = await Payment.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id }, 
      {
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        status: 'completed',
        paymentMethod: 'razorpay',
        metadata: {
          verifiedAt: new Date(),
          userId: req.user.id
        }
      },
      { new: true }
    );

    if (!updatedPayment) {
      return next(new ErrorResponse('Payment record not found', 404));
    }

    // Update booking payment status if applicable
    if (updatedPayment.booking) {
      await Booking.findByIdAndUpdate(updatedPayment.booking, {
        paymentStatus: updatedPayment.status === 'completed' ? 'paid' : 'failed',
        paymentId: updatedPayment._id
      });
    }

    res.status(200).json({
      success: true,
      payment: updatedPayment
    });
  } catch (error) {
    console.error('Razorpay payment verification error:', error?.message || error);
    // Surface common causes clearly
    if (error?.status === 404 || /No such payment/i.test(error?.message || '')) {
      return next(new ErrorResponse('Razorpay payment not found. Ensure IDs are from the same order.', 400));
    }
    return next(new ErrorResponse('Payment verification failed', 500));
  }
});

// @desc    Get Razorpay payment details
// @route   GET /api/payments/razorpay/:paymentId
// @access  Private
exports.getRazorpayPaymentDetails = asyncHandler(async (req, res, next) => {
  const { paymentId } = req.params;

  try {
    const payment = await razorpay.payments.fetch(paymentId);

    res.status(200).json({
      success: true,
      payment: payment
    });
  } catch (error) {
    console.error('Razorpay payment fetch error:', error);
    return next(new ErrorResponse('Failed to fetch payment details', 500));
  }
});

// @desc    Refund Razorpay payment
// @route   POST /api/payments/razorpay/:paymentId/refund
// @access  Private (Admin)
exports.refundRazorpayPayment = asyncHandler(async (req, res, next) => {
  const { paymentId } = req.params;
  const { amount, reason = 'requested_by_customer' } = req.body;

  try {
    // Create refund with Razorpay
    const refundOptions = {
      amount: amount ? Math.round(amount * 100) : undefined, // Convert to paise
      reason: reason
    };

    const refund = await razorpay.payments.refund(paymentId, refundOptions);

    // Update payment record in database
    const payment = await Payment.findOneAndUpdate(
      { razorpayPaymentId: paymentId },
      {
        status: 'refunded',
        refundId: refund.id,
        refundAmount: refund.amount / 100, // Convert from paise
        refundReason: reason
      },
      { new: true }
    );

    if (!payment) {
      return next(new ErrorResponse('Payment record not found', 404));
    }

    // Update booking if applicable
    if (payment.booking) {
      await Booking.findByIdAndUpdate(payment.booking, {
        paymentStatus: 'refunded'
      });
    }

    res.status(200).json({
      success: true,
      payment: payment,
      refund: refund
    });
  } catch (error) {
    console.error('Razorpay refund error:', error);
    return next(new ErrorResponse('Refund failed', 500));
  }
});

// @desc    Handle Razorpay webhook
// @route   POST /api/payments/razorpay/webhook
// @access  Public
exports.handleRazorpayWebhook = asyncHandler(async (req, res, next) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers['x-razorpay-signature'];

  if (!signature) {
    return next(new ErrorResponse('Missing webhook signature', 400));
  }

  try {
    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (expectedSignature !== signature) {
      return next(new ErrorResponse('Invalid webhook signature', 400));
    }

    const event = req.body;

    // Handle different webhook events
    switch (event.event) {
      case 'payment.captured':
        await handlePaymentCaptured(event.payload.payment.entity);
        break;
      case 'payment.failed':
        await handlePaymentFailed(event.payload.payment.entity);
        break;
      case 'refund.processed':
        await handleRefundProcessed(event.payload.refund.entity);
        break;
      default:
        console.log(`Unhandled webhook event: ${event.event}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return next(new ErrorResponse('Webhook processing failed', 500));
  }
});

// Helper functions for webhook handling
const handlePaymentCaptured = async (payment) => {
  try {
    await Payment.findOneAndUpdate(
      { razorpayPaymentId: payment.id },
      {
        status: 'completed',
        paymentMethod: payment.method,
        metadata: {
          ...payment,
          capturedAt: new Date()
        }
      }
    );

    // Update booking payment status
    const paymentRecord = await Payment.findOne({ razorpayPaymentId: payment.id });
    if (paymentRecord && paymentRecord.booking) {
      await Booking.findByIdAndUpdate(paymentRecord.booking, {
        paymentStatus: 'paid'
      });
    }
  } catch (error) {
    console.error('Error handling payment captured:', error);
  }
};

const handlePaymentFailed = async (payment) => {
  try {
    await Payment.findOneAndUpdate(
      { razorpayPaymentId: payment.id },
      {
        status: 'failed',
        failureReason: payment.error_description,
        failureCode: payment.error_code
      }
    );

    // Update booking payment status
    const paymentRecord = await Payment.findOne({ razorpayPaymentId: payment.id });
    if (paymentRecord && paymentRecord.booking) {
      await Booking.findByIdAndUpdate(paymentRecord.booking, {
        paymentStatus: 'failed'
      });
    }
  } catch (error) {
    console.error('Error handling payment failed:', error);
  }
};

const handleRefundProcessed = async (refund) => {
  try {
    await Payment.findOneAndUpdate(
      { razorpayPaymentId: refund.payment_id },
      {
        status: 'refunded',
        refundId: refund.id,
        refundAmount: refund.amount / 100
      }
    );

    // Update booking payment status
    const paymentRecord = await Payment.findOne({ razorpayPaymentId: refund.payment_id });
    if (paymentRecord && paymentRecord.booking) {
      await Booking.findByIdAndUpdate(paymentRecord.booking, {
        paymentStatus: 'refunded'
      });
    }
  } catch (error) {
    console.error('Error handling refund processed:', error);
  }
};

// @desc    Get Razorpay payment methods
// @route   GET /api/payments/razorpay/payment-methods
// @access  Public
exports.getRazorpayPaymentMethods = asyncHandler(async (req, res, next) => {
  try {
    // Get available payment methods from Razorpay
    const paymentMethods = await razorpay.payments.fetchPaymentMethods();

    res.status(200).json({
      success: true,
      paymentMethods: paymentMethods
    });
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    return next(new ErrorResponse('Failed to fetch payment methods', 500));
  }
});

// @desc    Create Razorpay customer
// @route   POST /api/payments/razorpay/customer
// @access  Private
exports.createRazorpayCustomer = asyncHandler(async (req, res, next) => {
  const { name, email, contact, notes } = req.body;

  try {
    const customer = await razorpay.customers.create({
      name: name || `${req.user.firstName} ${req.user.lastName}`,
      email: email || req.user.email,
      contact: contact || req.user.phone,
      notes: {
        userId: req.user.id,
        ...notes
      }
    });

    // Update user with Razorpay customer ID
    await User.findByIdAndUpdate(req.user.id, {
      razorpayCustomerId: customer.id
    });

    res.status(200).json({
      success: true,
      customer: customer
    });
  } catch (error) {
    console.error('Error creating Razorpay customer:', error);
    return next(new ErrorResponse('Failed to create customer', 500));
  }
});
