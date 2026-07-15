'use strict';

const express = require('express');
const {
  createEventCheckoutSession,
} = require('../controllers/register/checkoutEventsController');

const router = express.Router();

/*
 * Inventory locking now happens inside the event checkout controller's
 * database transaction. Do not reuse the product-cart lockInventory middleware.
 */
router.post(
  '/checkout-events',
  createEventCheckoutSession
);

module.exports = router;
