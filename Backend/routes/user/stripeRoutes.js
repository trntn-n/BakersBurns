const express = require('express');
const router = express.Router();

const stripeController = require('../../controllers/hybrid/stripeController');
const stripeCartWebhookController = require('../../controllers/hybrid/stripeCartWebhookController')
const userAuthMiddleware = require('../../middleware/userAuthMiddleware');

// Route to create a checkout session
router.post('/create-checkout-session', userAuthMiddleware('user'), stripeController.createCheckoutSession);

// Route to retrieve all past Stripe events (for logging/debugging)
router.get('/events', stripeController.getStripeEvents);

// Route to refund a payment
router.post('/refund', stripeController.refundPayment);

// Route to handle Stripe webhook events (no auth middleware here to allow Stripe access)


module.exports = router;
