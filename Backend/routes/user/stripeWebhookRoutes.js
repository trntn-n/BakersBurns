// routes/hybrid/stripeWebhookRoutes.js
'use strict';

const express = require('express');
const router = express.Router();

const {
  handleCartWebhook,
} = require('../../controllers/hybrid/stripeCartWebhookController');

const {
  handleEventWebhook,
} = require('../../controllers/hybrid/stripeEventWebhookController');

/*
 * Product Checkout Webhook
 *
 * Endpoint:
 * POST /stripe-webhook
 */
router.post(
  '/',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    console.log('Stripe Cart webhook route accessed.');
    next();
  },
  handleCartWebhook
);

/*
 * Event Checkout Webhook
 *
 * Endpoint:
 * POST /stripe-webhook/events
 */
router.post(
  '/events',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    console.log('Stripe Event webhook route accessed.');
    next();
  },
  handleEventWebhook
);

module.exports = router;