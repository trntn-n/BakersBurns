// controllers/hybrid/stripeEventWebhookController.js
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

/*
 * ============================================================
 * Stripe configuration
 * ============================================================
 *
 * Test mode:
 *   STRIPE_TEST_SECRET_KEY
 *   STRIPE_TEST_EVENT_WEBHOOK_SECRET
 *   BAKERS_BURNS_TEST_ACCOUNT_ID
 *
 * Live mode:
 *   STRIPE_SECRET_KEY
 *   STRIPE_EVENT_WEBHOOK_SECRET
 *   BAKERS_BURNS_LIVE_ACCOUNT_ID
 */

const stripeMode = String(
  process.env.STRIPE_MODE || 'live'
)
  .trim()
  .toLowerCase();

if (
  stripeMode !== 'test' &&
  stripeMode !== 'live'
) {
  throw new Error(
    'STRIPE_MODE must be either "test" or "live".'
  );
}

const stripeModeTest =
  stripeMode === 'test';

const stripeSecretKey =
  stripeModeTest
    ? process.env.STRIPE_TEST_SECRET_KEY
    : process.env.STRIPE_SECRET_KEY;

const stripeWebhookSecret =
  stripeModeTest
    ? process.env
        .STRIPE_TEST_EVENT_WEBHOOK_SECRET
    : process.env
        .STRIPE_EVENT_WEBHOOK_SECRET;

const stripeConnectedAccountId =
  stripeModeTest
    ? process.env
        .BAKERS_BURNS_TEST_ACCOUNT_ID
    : process.env
        .BAKERS_BURNS_LIVE_ACCOUNT_ID;

const stripeSecretKeyEnvName =
  stripeModeTest
    ? 'STRIPE_TEST_SECRET_KEY'
    : 'STRIPE_SECRET_KEY';

const stripeWebhookSecretEnvName =
  stripeModeTest
    ? 'STRIPE_TEST_EVENT_WEBHOOK_SECRET'
    : 'STRIPE_EVENT_WEBHOOK_SECRET';

const stripeConnectedAccountEnvName =
  stripeModeTest
    ? 'BAKERS_BURNS_TEST_ACCOUNT_ID'
    : 'BAKERS_BURNS_LIVE_ACCOUNT_ID';

if (!stripeSecretKey) {
  throw new Error(
    `Missing ${stripeSecretKeyEnvName} environment variable.`
  );
}

if (!stripeWebhookSecret) {
  throw new Error(
    `Missing ${stripeWebhookSecretEnvName} environment variable.`
  );
}

if (
  !stripeConnectedAccountId ||
  !stripeConnectedAccountId.startsWith(
    'acct_'
  )
) {
  throw new Error(
    `${stripeConnectedAccountEnvName} is missing or invalid.`
  );
}

const stripe = require('stripe')(
  stripeSecretKey
);

/*
 * ============================================================
 * Constants
 * ============================================================
 */

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

console.log(
  'Event Stripe webhook configuration loaded:',
  {
    stripeMode,

    stripeModeTest,

    connectedAccountId:
      stripeConnectedAccountId,

    secretKeyConfigured:
      Boolean(stripeSecretKey),

    webhookSecretConfigured:
      Boolean(stripeWebhookSecret),
  }
);

/*
 * ============================================================
 * Stripe object helpers
 * ============================================================
 */

/**
 * Determine whether a Checkout Session belongs to the event
 * checkout system.
 *
 * Product/cart Checkout Sessions are intentionally ignored.
 *
 * @param {object} session
 * @returns {boolean}
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

/**
 * Extract the purchaser's email address from a Checkout Session.
 *
 * @param {object} session
 * @returns {string|null}
 */
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

/**
 * Extract the PaymentIntent ID from either an expanded or
 * unexpanded Checkout Session.
 *
 * @param {object} session
 * @returns {string|null}
 */
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
    session
      ?.payment_intent?.id ||
    null
  );
};

/*
 * ============================================================
 * Webhook account validation
 * ============================================================
 */

/**
 * Validate that the incoming Stripe event belongs to the
 * configured Stripe mode and connected account.
 *
 * @param {object} stripeEvent
 */
const validateWebhookAccount = (
  stripeEvent
) => {
  const expectedLiveMode =
    !stripeModeTest;

  if (
    Boolean(
      stripeEvent.livemode
    ) !== expectedLiveMode
  ) {
    const error = new Error(
      `Stripe webhook mode mismatch. Expected ${
        expectedLiveMode
          ? 'live'
          : 'test'
      } mode.`
    );

    error.status = 400;

    throw error;
  }

  /*
   * Stripe Connect webhook events normally include the
   * connected account in stripeEvent.account.
   *
   * Some platform-level events may not include an account,
   * so account validation is performed only when one exists.
   */
  if (
    stripeEvent.account &&
    stripeEvent.account !==
      stripeConnectedAccountId
  ) {
    const error = new Error(
      `Stripe webhook account mismatch. Expected ${stripeConnectedAccountId}, received ${stripeEvent.account}.`
    );

    error.status = 400;

    throw error;
  }
};

/*
 * ============================================================
 * Checkout Session retrieval
 * ============================================================
 */

/**
 * Retrieve the complete Checkout Session from the connected
 * Stripe account.
 *
 * The event Checkout Session was created directly on the
 * connected account, so the same Stripe account must be used
 * when retrieving it.
 *
 * @param {object} webhookSession
 * @returns {Promise<object>}
 */
const retrieveEventCheckoutSession =
  async (
    webhookSession
  ) => {
    if (!webhookSession?.id) {
      throw new Error(
        'Stripe Checkout Session ID is missing.'
      );
    }

    return stripe
      .checkout
      .sessions
      .retrieve(
        webhookSession.id,
        {
          expand: [
            'payment_intent',
            'customer',
          ],
        },
        {
          stripeAccount:
            stripeConnectedAccountId,
        }
      );
  };

/*
 * ============================================================
 * Completed event checkout handling
 * ============================================================
 */

/**
 * Process a successfully completed event Checkout Session.
 *
 * This function:
 *
 * 1. Retrieves the full Checkout Session.
 * 2. Verifies that it is an event checkout.
 * 3. Verifies that Stripe considers it paid.
 * 4. Converts the inventory hold into sold reservations.
 * 5. Creates EventReservation records through the inventory
 *    service.
 * 6. Sends the customer confirmation email.
 * 7. Sends the admin event-purchase notification email.
 *
 * @param {object} webhookSession
 * @returns {Promise<object>}
 */
const processCompletedEventCheckout =
  async (
    webhookSession
  ) => {
    const session =
      await retrieveEventCheckoutSession(
        webhookSession
      );

    if (
      !isEventCheckoutSession(
        session
      )
    ) {
      console.log(
        'Ignored non-event Checkout Session:',
        {
          stripeSessionId:
            session?.id ||
            null,

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
     * checkout.session.completed can occur before an
     * asynchronous payment method has fully succeeded.
     *
     * For those payment methods, processing will happen after
     * checkout.session.async_payment_succeeded.
     */
    if (
      session.payment_status !==
      'paid'
    ) {
      console.log(
        'Event Checkout Session is not paid yet:',
        {
          stripeSessionId:
            session.id,

          paymentStatus:
            session
              .payment_status,
        }
      );

      return {
        handled: false,
        reason:
          'payment_not_paid',
      };
    }

    const purchaserEmail =
      getPurchaserEmail(
        session
      );

    const paymentIntentId =
      getPaymentIntentId(
        session
      );

    console.log(
      'Completing event checkout hold:',
      {
        stripeSessionId:
          session.id,

        paymentIntentId,

        holdToken,

        purchaserEmail,

        connectedAccountId:
          stripeConnectedAccountId,
      }
    );

    /*
     * completeEventCheckoutHold should:
     *
     * 1. Find the EventCheckoutHold.
     * 2. Convert reserved inventory into sold inventory.
     * 3. Create the EventReservation records.
     * 4. Mark the checkout hold completed.
     *
     * The inventory service must remain idempotent because
     * Stripe may deliver the same webhook more than once.
     */
    const completionResult =
      await completeEventCheckoutHold({
        holdToken,

        stripeSessionId:
          session.id,

        stripePaymentIntentId:
          paymentIntentId,

        purchaserEmail,
      });

    const reservations =
      Array.isArray(
        completionResult
          ?.reservations
      )
        ? completionResult
            .reservations
        : [];

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
            completionResult
              ?.event
          ),

        reservationCount:
          reservations.length,
      }
    );

    /*
     * The event success page depends on EventReservation
     * records existing.
     *
     * Do not acknowledge the Stripe webhook as successfully
     * handled if reservation creation failed.
     */
    if (
      reservations.length === 0
    ) {
      throw new Error(
        `Event Checkout Session ${session.id} completed without creating EventReservation records.`
      );
    }

    console.log(
      'Sending event confirmation emails:',
      {
        stripeSessionId:
          session.id,

        purchaserEmail,

        reservationCount:
          reservations.length,
      }
    );

    /*
     * sendEventCheckoutEmails is intentionally retained here.
     *
     * It should send:
     *
     * 1. The purchaser's event checkout confirmation.
     * 2. The admin notification about the new event purchase.
     *
     * The email utility should provide duplicate protection
     * because Stripe may retry the webhook.
     */
    const emailResults =
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
          emailResults
            ?.customer
            ?.emailId ||
          null,

        adminEmailId:
          emailResults
            ?.admins?.id ||
          emailResults
            ?.admins
            ?.emailId ||
          null,
      }
    );

    return {
      handled: true,
      completionResult,
      emailResults,
    };
  };

/*
 * ============================================================
 * Released event checkout handling
 * ============================================================
 */

/**
 * Release inventory associated with an expired or failed
 * event Checkout Session.
 *
 * @param {object} webhookSession
 * @returns {Promise<object>}
 */
const processReleasedEventCheckout =
  async (
    webhookSession
  ) => {
    const session =
      await retrieveEventCheckoutSession(
        webhookSession
      );

    if (
      !isEventCheckoutSession(
        session
      )
    ) {
      console.log(
        'Ignored released non-event Checkout Session:',
        {
          stripeSessionId:
            session?.id ||
            null,

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
        'Unable to release event inventory because holdToken is missing:',
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

/*
 * ============================================================
 * Main event webhook controller
 * ============================================================
 */

/**
 * Handle customer-facing event Checkout Session webhooks.
 *
 * This controller intentionally handles only:
 *
 * - checkout.session.completed
 * - checkout.session.async_payment_succeeded
 * - checkout.session.expired
 * - checkout.session.async_payment_failed
 *
 * Admin batch-refund events are handled by the separate
 * adminEventWebhookController.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<object>}
 */
const handleEventWebhook =
  async (
    req,
    res
  ) => {
    const signature =
      req.headers[
        'stripe-signature'
      ];

    if (!signature) {
      console.error(
        'Event Stripe webhook request is missing the Stripe signature.'
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
       * req.body must be the original, unmodified raw Buffer.
       *
       * The Express route must use:
       *
       * express.raw({
       *   type: 'application/json',
       * })
       */
      stripeEvent =
        stripe.webhooks
          .constructEvent(
            req.body,
            signature,
            stripeWebhookSecret
          );

      validateWebhookAccount(
        stripeEvent
      );
    } catch (error) {
      console.error(
        'Event Stripe webhook verification failed:',
        {
          stripeMode,

          expectedConnectedAccount:
            stripeConnectedAccountId,

          message:
            error.message,
        }
      );

      return res
        .status(
          error.status ||
          400
        )
        .send(
          `Webhook Error: ${error.message}`
        );
    }

    const stripeObject =
      stripeEvent.data
        ?.object;

    console.log(
      'Event Stripe webhook received:',
      {
        stripeEventId:
          stripeEvent.id,

        type:
          stripeEvent.type,

        stripeObjectId:
          stripeObject?.id ||
          null,

        connectedAccount:
          stripeEvent.account ||
          null,

        expectedConnectedAccount:
          stripeConnectedAccountId,

        livemode:
          stripeEvent.livemode,
      }
    );

    try {
      let result;

      if (
        COMPLETED_EVENT_TYPES
          .has(
            stripeEvent.type
          )
      ) {
        result =
          await processCompletedEventCheckout(
            stripeObject
          );
      } else if (
        RELEASE_EVENT_TYPES
          .has(
            stripeEvent.type
          )
      ) {
        result =
          await processReleasedEventCheckout(
            stripeObject
          );
      } else {
        result = {
          handled: false,
          reason:
            'unhandled_event_type',
        };
      }

      console.log(
        'Event Stripe webhook processed:',
        {
          stripeEventId:
            stripeEvent.id,

          type:
            stripeEvent.type,

          handled:
            result.handled,

          reason:
            result.reason ||
            null,
        }
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
    } catch (error) {
      console.error(
        'Error processing event Stripe webhook:',
        {
          stripeEventId:
            stripeEvent.id,

          type:
            stripeEvent.type,

          stripeObjectId:
            stripeObject?.id ||
            null,

          connectedAccount:
            stripeEvent.account ||
            null,

          message:
            error.message,

          stack:
            error.stack,
        }
      );

      /*
       * Returning HTTP 500 tells Stripe that processing failed
       * and allows Stripe to retry the webhook delivery.
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