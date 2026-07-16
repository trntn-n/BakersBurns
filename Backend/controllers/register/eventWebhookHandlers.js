'use strict';

const {
  completeEventCheckoutHold,
  releaseEventCheckoutHold,
} = require(
  '../../services/eventCheckoutInventoryService.js'
);

const {
  sendEventCheckoutEmails,
} = require(
  '../../utils/eventCheckSuccessEmail.js'
);

const EVENT_CHECKOUT_TYPE =
  'event_preorder';

const getPurchaserEmail = (
  session
) => {
  return (
    session.customer_details
      ?.email ||
    session.customer_email ||
    null
  );
};

const getPaymentIntentId = (
  session
) => {
  if (
    typeof session.payment_intent ===
    'string'
  ) {
    return session.payment_intent;
  }

  return (
    session.payment_intent
      ?.id ||
    null
  );
};

const isEventCheckoutSession = (
  session
) => {
  return (
    session?.metadata
      ?.checkoutType ===
    EVENT_CHECKOUT_TYPE
  );
};

const handleEventCheckoutCompleted =
  async (session) => {
    if (
      !isEventCheckoutSession(
        session
      )
    ) {
      return false;
    }

    const holdToken =
      session.metadata
        ?.holdToken;

    if (!holdToken) {
      throw new Error(
        `Event Checkout Session ${session.id} is missing holdToken metadata.`
      );
    }

    /*
     * Card-only Checkout Sessions should be paid
     * immediately. Keep this guard in place in case
     * delayed payment methods are enabled later.
     */
    if (
      session.payment_status !==
      'paid'
    ) {
      console.log(
        'Ignoring unpaid event Checkout Session:',
        {
          stripeSessionId:
            session.id,

          paymentStatus:
            session.payment_status,
        }
      );

      return false;
    }

    /*
     * Complete the hold before sending any email.
     *
     * This operation must remain idempotent because
     * Stripe can deliver the same webhook more than
     * once.
     *
     * completeEventCheckoutHold should return:
     *
     * {
     *   event,
     *   reservations
     * }
     */
    const completionResult =
      await completeEventCheckoutHold({
        holdToken,

        stripeSessionId:
          session.id,

        stripePaymentIntentId:
          getPaymentIntentId(
            session
          ),

        purchaserEmail:
          getPurchaserEmail(
            session
          ),
      });

    /*
     * Do not fail the Stripe webhook after the
     * reservations have already been completed merely
     * because an email provider is temporarily down.
     *
     * Throwing here would cause Stripe to retry the
     * entire completed event, which could create noisy
     * duplicate attempts.
     */
    try {
      await sendEventCheckoutEmails({
        session,
        completionResult,
      });
    } catch (emailError) {
      console.error(
        'Event checkout completed, but confirmation emails failed:',
        {
          stripeSessionId:
            session.id,

          holdToken,

          purchaserEmail:
            getPurchaserEmail(
              session
            ),

          message:
            emailError.message,

          stack:
            emailError.stack,
        }
      );
    }

    return true;
  };

const handleEventCheckoutExpired =
  async (session) => {
    if (
      !isEventCheckoutSession(
        session
      )
    ) {
      return false;
    }

    const holdToken =
      session.metadata
        ?.holdToken;

    if (!holdToken) {
      console.warn(
        `Expired Event Checkout Session ${session.id} is missing holdToken metadata.`
      );

      return false;
    }

    await releaseEventCheckoutHold(
      holdToken,
      'released'
    );

    return true;
  };

module.exports = {
  handleEventCheckoutCompleted,
  handleEventCheckoutExpired,
};