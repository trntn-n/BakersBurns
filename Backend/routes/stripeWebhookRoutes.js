
'use strict';

const express = require('express');
const router = express.Router();

const {
  handleCartWebhook,
} = require('../controllers/hybrid/stripeCartWebhookController');

const {
  handleEventWebhook,
} = require('../controllers/hybrid/stripeEventWebhookController');

const {handleAdminEventWebhook,} = require('../controllers/hybrid/stripeAdminEventWebhookController');
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
router.post(
  '/admin-refund',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    console.log('Stripe Admin-Event webhook route accessed.');
    next();
  },
  handleAdminEventWebhook
)
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