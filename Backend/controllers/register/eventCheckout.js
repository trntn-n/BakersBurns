// controllers/register/checkoutEventsController.js
'use strict';

/*
 * Select the correct Stripe secret key based on STRIPE_MODE.
 */
const stripeModeIsTest =
  process.env.STRIPE_MODE === 'test';

const stripeSecretKey = stripeModeIsTest
  ? process.env.STRIPE_TEST_SECRET_KEY
  : process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error(
    stripeModeIsTest
      ? 'Missing STRIPE_TEST_SECRET_KEY environment variable.'
      : 'Missing STRIPE_SECRET_KEY environment variable.'
  );
}

const stripe = require('stripe')(
  stripeSecretKey
);

const Event = require('../../models/event');

/**
 * Create a Stripe Checkout Session for a paid event preorder.
 *
 * Expected request body:
 *
 * {
 *   "eventId": 12,
 *   "quantity": 2,
 *   "metadata": {
 *     "hasAcceptedPrivacy": true,
 *     "hasAcceptedTermsOfService": true
 *   }
 * }
 *
 * This checkout:
 * - Does not use the guest cart
 * - Does not calculate shipping
 * - Does not collect a shipping address
 * - Does not modify product inventory
 * - Creates a direct charge on the Bakers Burns account
 */
const createEventCheckoutSession = async (
  req,
  res
) => {
  try {
    const {
      eventId,
      metadata,
    } = req.body;

    const quantity = Number(
      req.body.quantity ?? 1
    );

    /*
     * Validate request information.
     */
    if (!eventId) {
      return res.status(400).json({
        message:
          'Event ID is required.',
      });
    }

    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 20
    ) {
      return res.status(400).json({
        message:
          'Quantity must be an integer between 1 and 20.',
      });
    }

    if (
      metadata?.hasAcceptedPrivacy !== true ||
      metadata?.hasAcceptedTermsOfService !== true
    ) {
      return res.status(400).json({
        message:
          'You must accept the Terms of Service and Privacy Policy to continue.',
        redirect:
          '/accept-privacy-terms',
      });
    }

    if (!process.env.REGISTER_FRONTEND) {
      throw new Error(
        'Missing REGISTER_FRONTEND environment variable.'
      );
    }

    /*
     * Bakers Burns is a Standard connected account.
     * The Checkout Session is created directly on that account.
     */
    const connectedAccountId =
      process.env.BAKERS_BURNS_ACCOUNT_ID;

    if (
      !connectedAccountId?.startsWith(
        'acct_'
      )
    ) {
      throw new Error(
        'BAKERS_BURNS_ACCOUNT_ID is missing or invalid.'
      );
    }

    /*
     * Always load the event and price from the database.
     * Never accept the event price from the frontend.
     */
    const eventRecord =
      await Event.findByPk(eventId);

    if (!eventRecord) {
      return res.status(404).json({
        message:
          'Event not found.',
      });
    }

    /*
     * Adjust these property names if your Event model
     * uses different names.
     */
    const eventName =
      eventRecord.title ||
      eventRecord.name;

    const eventPrice =
      Number(eventRecord.price);

    if (!eventName) {
      throw new Error(
        `Event ${eventRecord.id} does not have a title or name.`
      );
    }

    if (
      !Number.isFinite(eventPrice) ||
      eventPrice <= 0
    ) {
      return res.status(400).json({
        message:
          'This event does not have a valid paid preorder price.',
      });
    }

    /*
     * Optional event-status validation.
     *
     * This only runs when the model contains these fields.
     */
    if (
      eventRecord.isPaid !== undefined &&
      eventRecord.isPaid !== null &&
      eventRecord.isPaid !== true
    ) {
      return res.status(400).json({
        message:
          'This event is not configured as a paid event.',
      });
    }

    if (
      eventRecord.isActive !== undefined &&
      eventRecord.isActive !== null &&
      eventRecord.isActive !== true
    ) {
      return res.status(400).json({
        message:
          'This event is not currently available.',
      });
    }

    const currentTime =
      new Date();

    if (
      eventRecord.preorderStart &&
      currentTime <
        new Date(
          eventRecord.preorderStart
        )
    ) {
      return res.status(400).json({
        message:
          'Preorders for this event have not started yet.',
      });
    }

    if (
      eventRecord.preorderEnd &&
      currentTime >
        new Date(
          eventRecord.preorderEnd
        )
    ) {
      return res.status(400).json({
        message:
          'Preorders for this event have ended.',
      });
    }

    /*
     * Optional capacity check.
     *
     * This assumes your Event model has:
     * - capacity
     * - preorderCount
     *
     * Remove or modify this section if capacity is stored
     * in a separate EventPreorder model.
     */
    const capacity =
      Number(eventRecord.capacity);

    const preorderCount =
      Number(
        eventRecord.preorderCount || 0
      );

    if (
      Number.isFinite(capacity) &&
      capacity > 0
    ) {
      const remainingCapacity =
        capacity - preorderCount;

      if (remainingCapacity <= 0) {
        return res.status(400).json({
          message:
            'This event is sold out.',
        });
      }

      if (
        quantity >
        remainingCapacity
      ) {
        return res.status(400).json({
          message:
            `Only ${remainingCapacity} preorder spot` +
            `${remainingCapacity === 1 ? '' : 's'} remain.`,
        });
      }
    }

    /*
     * Optional event image.
     *
     * This supports common field names such as:
     * - thumbnail
     * - image
     * - imageUrl
     */
    const storedImage =
      eventRecord.thumbnail ||
      eventRecord.image ||
      eventRecord.imageUrl;

    let eventImageUrl = null;

    if (storedImage) {
      if (
        storedImage.startsWith(
          'http://'
        ) ||
        storedImage.startsWith(
          'https://'
        )
      ) {
        eventImageUrl =
          storedImage;
      } else if (
        process.env.BASE_URL
      ) {
        eventImageUrl =
          `${process.env.BASE_URL}/uploads/${storedImage}`;
      }
    }

    const eventDescription =
      eventRecord.description
        ? String(
            eventRecord.description
          ).slice(0, 500)
        : `Preorder for ${eventName}`;

    /*
     * Store enough information for the Stripe webhook
     * to distinguish event purchases from product orders.
     */
    const stripeMetadata = {
      checkoutType:
        'event_preorder',

      eventId:
        String(eventRecord.id),

      quantity:
        String(quantity),

      connectedAccountId,

      hasAcceptedPrivacy:
        'true',

      hasAcceptedTermsOfService:
        'true',

      /*
       * req.user may exist when an authenticated user
       * creates the checkout.
       */
      userId:
        req.user?.id
          ? String(req.user.id)
          : '',

      eventName:
        String(eventName).slice(
          0,
          500
        ),
    };

    const checkoutSession =
      await stripe.checkout.sessions.create(
        {
          mode:
            'payment',

          payment_method_types: [
            'card',
          ],

          line_items: [
            {
              price_data: {
                currency:
                  'usd',

                product_data: {
                  name:
                    eventName,

                  description:
                    eventDescription,

                  ...(eventImageUrl
                    ? {
                        images: [
                          eventImageUrl,
                        ],
                      }
                    : {}),
                },

                unit_amount:
                  Math.round(
                    eventPrice * 100
                  ),
              },

              quantity,
            },
          ],

          metadata:
            stripeMetadata,

          payment_intent_data: {
            metadata:
              stripeMetadata,

            /*
             * Add this only when DCFLUX should collect
             * an application fee:
             *
             * application_fee_amount: 100,
             */
          },

          expires_at:
            Math.floor(
              Date.now() / 1000
            ) +
            60 * 30,

          success_url:
            `${process.env.REGISTER_FRONTEND}` +
            `/events/${eventRecord.id}` +
            '?checkout=success' +
            '&session_id={CHECKOUT_SESSION_ID}',

          cancel_url:
            `${process.env.REGISTER_FRONTEND}` +
            `/events/${eventRecord.id}` +
            '?checkout=cancelled' +
            '&session_id={CHECKOUT_SESSION_ID}',

          /*
           * We can still collect a billing address for
           * payment verification, but there is no
           * shipping_address_collection.
           */
          billing_address_collection:
            'required',
        },
        {
          stripeAccount:
            connectedAccountId,
        }
      );

    console.log(
      'Event Checkout Session created:',
      {
        stripeSessionId:
          checkoutSession.id,

        eventId:
          eventRecord.id,

        quantity,

        connectedAccountId,
      }
    );

    return res.status(200).json({
      url:
        checkoutSession.url,

      sessionId:
        checkoutSession.id,
    });
  } catch (error) {
    console.error(
      'Error creating event Checkout Session:',
      {
        type:
          error.type,

        code:
          error.code,

        message:
          error.message,

        requestId:
          error.requestId,
      }
    );

    return res.status(500).json({
      message:
        'Failed to create event Checkout Session.',

      error:
        error.message,
    });
  }
};

module.exports = {
  createEventCheckoutSession,
};