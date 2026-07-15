// controllers/hybrid/stripeEventWebhookController.js
'use strict';

const stripeModeIsTest =
  process.env.STRIPE_MODE === 'test';

const stripeSecretKey =
  stripeModeIsTest
    ? process.env.STRIPE_TEST_SECRET_KEY
    : process.env.STRIPE_SECRET_KEY;

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
  require('stripe')(stripeSecretKey);

const {
  handleEventCheckoutCompleted,
  handleEventCheckoutExpired,
} = require(
  '../register/eventWebhookHandlers'
);

const handleEventWebhook = async (
  req,
  res
) => {
  const signature =
    req.headers[
      'stripe-signature'
    ];

  let stripeEvent;

  try {
    stripeEvent =
      stripe.webhooks.constructEvent(
        req.body,
        signature,
        stripeWebhookSecret
      );
  } catch (error) {
    console.error(
      'Event Stripe webhook signature verification failed:',
      error.message
    );

    return res
      .status(400)
      .send(
        `Webhook Error: ${error.message}`
      );
  }

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const handled =
          await handleEventCheckoutCompleted(
            stripeEvent.data.object
          );

        if (handled) {
          console.log(
            'Event checkout completed:',
            {
              stripeSessionId:
                stripeEvent.data
                  .object.id,
              holdToken:
                stripeEvent.data
                  .object.metadata
                  ?.holdToken,
            }
          );
        } else {
          console.log(
            'Event checkout completion ignored:',
            stripeEvent.data
              .object.id
          );
        }

        break;
      }

      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed': {
        const handled =
          await handleEventCheckoutExpired(
            stripeEvent.data.object
          );

        if (handled) {
          console.log(
            'Event checkout inventory released:',
            {
              stripeSessionId:
                stripeEvent.data
                  .object.id,
              holdToken:
                stripeEvent.data
                  .object.metadata
                  ?.holdToken,
            }
          );
        } else {
          console.log(
            'Event checkout expiration ignored:',
            stripeEvent.data
              .object.id
          );
        }

        break;
      }

      default:
        console.log(
          `Unhandled event Stripe webhook type: ${stripeEvent.type}`
        );
    }

    return res.status(200).json({
      received: true,
    });
  } catch (error) {
    console.error(
      'Error processing event Stripe webhook:',
      error
    );

    /*
     * Return 500 so Stripe retries the webhook.
     */
    return res.status(500).json({
      message:
        'Event webhook processing failed.',
    });
  }
};

module.exports = {
  handleEventWebhook,
};