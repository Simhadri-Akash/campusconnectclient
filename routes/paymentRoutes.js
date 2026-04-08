const express = require('express');
const router = express.Router();

// Import controller functions
const paymentController = require('../controllers/paymentController');

// Import middleware
const { authenticate, requireAdmin } = require('../middleware/authMiddleware');
const {
  validatePaymentVerification,
  validateExternalPaymentConfirmation,
  validateMongoId,
  validatePagination
} = require('../middleware/validationMiddleware');

/**
 * @route   GET /api/payments/key
 * @desc    Get Razorpay key for client-side
 * @access  Public
 */
router.get('/key', paymentController.getRazorpayKey);

/**
 * @route   POST /api/payments/create-order
 * @desc    Create Razorpay order for event registration
 * @access  Private
 */
router.post('/create-order', authenticate, paymentController.createOrder);

/**
 * @route   POST /api/payments/verify
 * @desc    Verify Razorpay payment and complete registration
 * @access  Private
 */
router.post('/verify', authenticate, validatePaymentVerification, paymentController.verifyPayment);

/**
 * @route   POST /api/payments/confirm-external
 * @desc    Confirm external RuPay/payment-url payment and complete registration
 * @access  Private
 */
router.post(
  '/confirm-external',
  authenticate,
  validateExternalPaymentConfirmation,
  paymentController.confirmExternalPayment
);

/**
 * @route   GET /api/payments/history
 * @desc    Get user's payment history
 * @access  Private
 */
router.get('/history', authenticate, validatePagination, paymentController.getPaymentHistory);

/**
 * @route   GET /api/payments/:paymentId
 * @desc    Get payment details
 * @access  Private
 */
router.get('/:paymentId', authenticate, validateMongoId('paymentId'), paymentController.getPaymentDetails);

/**
 * @route   POST /api/payments/:paymentId/refund
 * @desc    Process refund (Admin only)
 * @access  Private (Admin)
 */
router.post('/:paymentId/refund', authenticate, requireAdmin, validateMongoId('paymentId'), paymentController.processRefund);

// Legacy route for backward compatibility
/**
 * @route   POST /api/payments/razorpay-verify
 * @desc    Verify Razorpay payment (legacy route)
 * @access  Private
 */
router.post('/razorpay-verify', authenticate, validatePaymentVerification, paymentController.verifyPayment);

// Export router
module.exports = router;
