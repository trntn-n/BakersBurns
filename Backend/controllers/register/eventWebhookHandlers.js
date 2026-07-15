'use strict';

const {
  completeEventCheckoutHold,
  releaseEventCheckoutHold,
} = require('../../services/eventCheckoutInventoryService.js');

const getPurchaserEmail = (session) =>
  session.customer_details?.email ||
  session.customer_email ||
  null;

const handleEventCheckoutCompleted = async (session) => {
  if (session.metadata?.checkoutType !== 'event_preorder') {
    return false;
  }

  const holdToken = session.metadata?.holdToken;

  if (!holdToken) {
    throw new Error(
      `Event Checkout Session ${session.id} is missing holdToken metadata.`
    );
  }

  /*
   * For card-only Checkout, payment_status should be "paid".
   * Keep the guard in case delayed payment methods are enabled later.
   */
  if (session.payment_status !== 'paid') {
    return false;
  }

  await completeEventCheckoutHold({
    holdToken,
    stripeSessionId: session.id,
    stripePaymentIntentId:
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || null,
    purchaserEmail: getPurchaserEmail(session),
  });

  return true;
};

const handleEventCheckoutExpired = async (session) => {
  if (session.metadata?.checkoutType !== 'event_preorder') {
    return false;
  }

  const holdToken = session.metadata?.holdToken;

  if (!holdToken) {
    return false;
  }

  await releaseEventCheckoutHold(holdToken, 'released');
  return true;
};

module.exports = {
  handleEventCheckoutCompleted,
  handleEventCheckoutExpired,
};
