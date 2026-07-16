// controllers/hybrid/stripeEventWebhookController.js
'use strict';

const stripeModeIsTest =
  process.env.STRIPE_MODE ===
  'test';

const stripeSecretKey =
  stripeModeIsTest
    ? process.env
        .STRIPE_TEST_SECRET_KEY
    : process.env
        .STRIPE_SECRET_KEY;

const stripeWebhookSecret =
  stripeModeIsTest
    ? process.env
        .STRIPE_TEST_EVENT_WEBHOOK_SECRET
    : process.env
        .STRIPE_EVENT_WEBHOOK_SECRET;

if (!stripeSecretKey) {
  throw new Error(
    stripeModeIsTest
      ? 'Missing STRIPE_TEST_SECRET_KEY environment variable.'
      : 'Missing STRIPE_SECRET_KEY environment variable.'
  );
}

if (!stripeWebhookSecret) {
  throw new Error(
    stripeModeIsTest
      ? 'Missing STRIPE_TEST_EVENT_WEBHOOK_SECRET environment variable.'
      : 'Missing STRIPE_EVENT_WEBHOOK_SECRET environment variable.'
  );
}

const stripe =
  require('stripe')(
    stripeSecretKey
  );

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

const COMPLETED_EVENT_TYPES =
  new Set([
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
  ]);

const RELEASE_EVENT_TYPES =
  new Set([
    'checkout.session.expired',
    'checkout.session.async_payment_failed',
  ]);

/*
 * Determine whether this Stripe Checkout Session
 * belongs to the event checkout system.
 */
const isEventCheckoutSession = (
  session
) => {
  return (
    session?.metadata
      ?.checkoutType ===
    EVENT_CHECKOUT_TYPE
  );
};

const getPurchaserEmail = (
  session
) => {
  return (
    session?.customer_details
      ?.email ||
    session?.customer_email ||
    null
  );
};

const getPaymentIntentId = (
  session
) => {
  if (
    typeof session
      ?.payment_intent ===
    'string'
  ) {
    return session.payment_intent;
  }

  return (
    session?.payment_intent?.id ||
    null
  );
};

/*
 * Completes inventory and reservation records for
 * a successfully paid event Checkout Session.
 */
const processCompletedEventCheckout =
  async (session) => {
    if (
      !isEventCheckoutSession(
        session
      )
    ) {
      console.log(
        'Event webhook ignored non-event Checkout Session:',
        {
          stripeSessionId:
            session?.id,

          checkoutType:
            session?.metadata
              ?.checkoutType ||
            null,
        }
      );

      return {
        handled: false,
        reason:
          'not_event_checkout',
      };
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
     * checkout.session.completed may fire before an
     * asynchronous payment has actually succeeded.
     *
     * checkout.session.async_payment_succeeded will
     * call this function again once payment is paid.
     */
    if (
      session.payment_status !==
      'paid'
    ) {
      console.log(
        'Event checkout is not paid yet:',
        {
          stripeSessionId:
            session.id,

          paymentStatus:
            session.payment_status,
        }
      );

      return {
        handled: false,
        reason:
          'payment_not_paid',
      };
    }

    console.log(
      'Completing event checkout hold:',
      {
        stripeSessionId:
          session.id,

        holdToken,

        purchaserEmail:
          getPurchaserEmail(
            session
          ),
      }
    );

    /*
     * This service should be idempotent because Stripe
     * can send the same webhook more than once.
     *
     * Expected return value:
     *
     * {
     *   event: { ... },
     *   reservations: [ ... ]
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

    console.log(
      'Event checkout inventory completed:',
      {
        stripeSessionId:
          session.id,

        holdToken,

        hasCompletionResult:
          Boolean(
            completionResult
          ),

        hasEvent:
          Boolean(
            completionResult?.event
          ),

        reservationCount:
          Array.isArray(
            completionResult
              ?.reservations
          )
            ? completionResult
                .reservations
                .length
            : 0,
      }
    );

    /*
     * The reservation is already committed at this
     * point. Email failure should be logged separately
     * instead of undoing a successful purchase.
     */
    let emailResults = null;
    let emailError = null;

    try {
      console.log(
        'Sending event confirmation emails:',
        {
          stripeSessionId:
            session.id,

          purchaserEmail:
            getPurchaserEmail(
              session
            ),
        }
      );

      emailResults =
        await sendEventCheckoutEmails({
          session,
          completionResult,
        });

      console.log(
        'Event confirmation emails sent:',
        {
          stripeSessionId:
            session.id,

          customerEmailId:
            emailResults
              ?.customer?.id ||
            null,

          adminEmailId:
            emailResults
              ?.admins?.id ||
            null,
        }
      );
    } catch (error) {
      emailError = error;

      console.error(
        'Event checkout completed, but confirmation email delivery failed:',
        {
          stripeSessionId:
            session.id,

          holdToken,

          purchaserEmail:
            getPurchaserEmail(
              session
            ),

          message:
            error.message,

          stack:
            error.stack,
        }
      );
    }

    return {
      handled: true,
      completionResult,
      emailResults,
      emailError,
    };
  };

/*
 * Releases inventory reserved by an expired or failed
 * event Checkout Session.
 */
const processReleasedEventCheckout =
  async (session) => {
    if (
      !isEventCheckoutSession(
        session
      )
    ) {
      console.log(
        'Event webhook ignored non-event release event:',
        {
          stripeSessionId:
            session?.id,

          checkoutType:
            session?.metadata
              ?.checkoutType ||
            null,
        }
      );

      return {
        handled: false,
        reason:
          'not_event_checkout',
      };
    }

    const holdToken =
      session.metadata
        ?.holdToken;

    if (!holdToken) {
      console.warn(
        'Event Checkout Session could not release inventory because holdToken is missing:',
        {
          stripeSessionId:
            session.id,
        }
      );

      return {
        handled: false,
        reason:
          'missing_hold_token',
      };
    }

    await releaseEventCheckoutHold(
      holdToken,
      'released'
    );

    console.log(
      'Event checkout inventory released:',
      {
        stripeSessionId:
          session.id,

        holdToken,
      }
    );

    return {
      handled: true,
    };
  };

const handleEventWebhook = async (
  req,
  res
) => {
  const signature =
    req.headers[
      'stripe-signature'
    ];

  if (!signature) {
    console.error(
      'Event Stripe webhook request is missing the stripe-signature header.'
    );

    return res
      .status(400)
      .send(
        'Webhook Error: Missing Stripe signature.'
      );
  }

  let stripeEvent;

  try {
    /*
     * req.body must be the unmodified raw request body
     * for Stripe signature verification to succeed.
     */
    stripeEvent =
      stripe.webhooks
        .constructEvent(
          req.body,
          signature,
          stripeWebhookSecret
        );
  } catch (error) {
    console.error(
      'Event Stripe webhook signature verification failed:',
      {
        message:
          error.message,
      }
    );

    return res
      .status(400)
      .send(
        `Webhook Error: ${error.message}`
      );
  }

  console.log(
    'Event Stripe webhook received:',
    {
      stripeEventId:
        stripeEvent.id,

      type:
        stripeEvent.type,

      stripeSessionId:
        stripeEvent.data
          ?.object?.id ||
        null,

      connectedAccount:
        stripeEvent.account ||
        null,
    }
  );

  try {
    const session =
      stripeEvent.data.object;

    if (
      COMPLETED_EVENT_TYPES.has(
        stripeEvent.type
      )
    ) {
      const result =
        await processCompletedEventCheckout(
          session
        );

      if (result.handled) {
        console.log(
          'Event checkout webhook completed successfully:',
          {
            stripeEventId:
              stripeEvent.id,

            stripeSessionId:
              session.id,

            holdToken:
              session.metadata
                ?.holdToken,

            emailDeliverySucceeded:
              !result.emailError,
          }
        );
      } else {
        console.log(
          'Event checkout completion was not processed:',
          {
            stripeEventId:
              stripeEvent.id,

            stripeSessionId:
              session.id,

            reason:
              result.reason,
          }
        );
      }

      return res
        .status(200)
        .json({
          received: true,
          handled:
            result.handled,
          reason:
            result.reason ||
            null,
        });
    }

    if (
      RELEASE_EVENT_TYPES.has(
        stripeEvent.type
      )
    ) {
      const result =
        await processReleasedEventCheckout(
          session
        );

      return res
        .status(200)
        .json({
          received: true,
          handled:
            result.handled,
          reason:
            result.reason ||
            null,
        });
    }

    console.log(
      'Unhandled event Stripe webhook type:',
      {
        stripeEventId:
          stripeEvent.id,

        type:
          stripeEvent.type,
      }
    );

    return res
      .status(200)
      .json({
        received: true,
        handled: false,
        reason:
          'unhandled_event_type',
      });
  } catch (error) {
    console.error(
      'Error processing event Stripe webhook:',
      {
        stripeEventId:
          stripeEvent.id,

        type:
          stripeEvent.type,

        stripeSessionId:
          stripeEvent.data
            ?.object?.id ||
          null,

        message:
          error.message,

        stack:
          error.stack,
      }
    );

    /*
     * Returning 500 instructs Stripe to retry.
     *
     * This is appropriate for failures that occur
     * before the checkout reservation is successfully
     * completed or released.
     */
    return res
      .status(500)
      .json({
        message:
          'Event webhook processing failed.',
      });
  }
};

module.exports = {
  handleEventWebhook,
};