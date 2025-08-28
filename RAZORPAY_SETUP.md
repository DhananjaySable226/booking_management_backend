# Razorpay Integration Setup Guide

This guide will help you set up Razorpay payment gateway integration in your booking management system.

## Prerequisites

1. Razorpay account (sign up at https://razorpay.com)
2. Node.js and npm installed
3. MongoDB database running

## Installation

1. Install Razorpay dependency:
```bash
npm install razorpay
```

## Environment Variables

Add the following environment variables to your `.env` file:

```env
# Razorpay Configuration
RAZORPAY_KEY_ID=rzp_test_your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret
```

## Getting Razorpay Credentials

1. **Sign up/Login to Razorpay Dashboard**
   - Go to https://dashboard.razorpay.com
   - Create an account or login

2. **Get API Keys**
   - Navigate to Settings > API Keys
   - Generate a new key pair
   - Copy the Key ID and Key Secret

3. **Set up Webhook**
   - Go to Settings > Webhooks
   - Add a new webhook with URL: `https://yourdomain.com/api/payments/razorpay/webhook`
   - Select events: `payment.captured`, `payment.failed`, `refund.processed`
   - Copy the webhook secret

## Frontend Configuration

Add the following environment variable to your frontend `.env` file:

```env
VITE_RAZORPAY_KEY_ID=rzp_test_your_razorpay_key_id
```

## API Endpoints

### Create Order
```
POST /api/payments/razorpay/create-order
Content-Type: application/json
Authorization: Bearer <token>

{
  "amount": 1000,
  "currency": "INR",
  "receipt": "receipt_123",
  "notes": {
    "bookingId": "booking_id",
    "description": "Payment for booking"
  }
}
```

### Verify Payment
```
POST /api/payments/razorpay/verify
Content-Type: application/json
Authorization: Bearer <token>

{
  "razorpay_order_id": "order_id",
  "razorpay_payment_id": "payment_id",
  "razorpay_signature": "signature"
}
```

### Get Payment Details
```
GET /api/payments/razorpay/:paymentId
Authorization: Bearer <token>
```

### Refund Payment
```
POST /api/payments/razorpay/:paymentId/refund
Content-Type: application/json
Authorization: Bearer <token>

{
  "amount": 500,
  "reason": "requested_by_customer"
}
```

### Webhook
```
POST /api/payments/razorpay/webhook
Content-Type: application/json
X-Razorpay-Signature: <signature>

{
  "event": "payment.captured",
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_id",
        "amount": 1000,
        "currency": "INR",
        "status": "captured"
      }
    }
  }
}
```

## Testing

### Test Cards
Use these test card numbers for testing:

- **Success**: 4111 1111 1111 1111
- **Failure**: 4000 0000 0000 0002
- **3D Secure**: 4000 0000 0000 0002

### Test UPI
- **Success**: success@razorpay
- **Failure**: failure@razorpay

## Features Implemented

1. **Order Creation**: Create payment orders with Razorpay
2. **Payment Verification**: Verify payment signatures
3. **Webhook Handling**: Handle payment status updates
4. **Refund Processing**: Process refunds through Razorpay
5. **Payment History**: Track all payment transactions
6. **Multiple Payment Methods**: Support for cards, UPI, net banking, wallets

## Security Considerations

1. **Signature Verification**: Always verify payment signatures
2. **Webhook Security**: Use webhook secrets for verification
3. **Environment Variables**: Never commit API keys to version control
4. **HTTPS**: Use HTTPS in production for all API calls

## Error Handling

The integration includes comprehensive error handling for:
- Invalid payment signatures
- Failed payments
- Network errors
- Invalid amounts
- Missing parameters

## Support

For issues related to:
- **Razorpay API**: Contact Razorpay support
- **Integration**: Check the logs and error messages
- **Configuration**: Verify environment variables

## Production Checklist

Before going live:
- [ ] Switch to live Razorpay keys
- [ ] Update webhook URL to production domain
- [ ] Test all payment flows
- [ ] Set up monitoring and logging
- [ ] Configure proper error handling
- [ ] Test refund functionality
- [ ] Verify webhook security
