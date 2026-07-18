'use strict';

const sequelize = require('../../config/database');
const Event = require('../../models/events');
const EventOccurrence = require('../../models/eventOccurrence');
const EventCheckoutHold = require('../../models/eventCheckoutHold');
const EventReservation = require(
    '../../models/eventReservation'
  );
const {
  releaseEventCheckoutHold,
} = require('../../services/eventCheckoutInventoryService.js');

const stripeModeTest = process.env.STRIPE_MODE === 'test';
const stripeSecretKey = stripeModeTest 
                        ? process.env.STRIPE_TEST_SECRET_KEY
                        : process.env.STRIPE_SECRET_KEY;
        
const stripeConnectedAccountId = stripeModeTest
                                ? process.env.BAKERS_BURNS_TEST_ACCOUNT_ID
                                : process.env.BAKERS_BURNS_ACCOUNT_ID;

if (!stripeSecretKey) {
  throw new Error(
    stripeModeTest
      ? 'Missing STRIPE_TEST_SECRET_KEY environment variable.'
      : 'Missing STRIPE_SECRET_KEY environment variable.'
  );
}
const stripeConnectedAccountEnvCheck = stripeModeTest
                                        ? 'Missing BAKERS_BURNS_ACCOUNT_ID'
                                        : 'Missing BAKERS_BURNS_ACCOUNT_ID';
if (!stripeConnectedAccountId) {
    throw new Error(
        stripeConnectedAccountEnvCheck
    );
}

const stripe = require('stripe')(stripeSecretKey);
const MAX_TICKETS_PER_DAY = 20;
const MAX_SELECTED_DAYS = 50;
const HOLD_MINUTES = 30;

const normalizeSelections = (rawSelections) => {
  if (!Array.isArray(rawSelections)) {
    return [];
  }

  const combined = new Map();

  for (const selection of rawSelections) {
    const occurrenceDate = String(
      selection?.occurrenceDate || ''
    ).trim();

    const quantity = Number(selection?.quantity);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)) {
      throw new Error(`Invalid occurrence date: ${occurrenceDate || 'empty'}.`);
    }

    if (
      !Number.isInteger(quantity) ||
      quantity < 0 ||
      quantity > MAX_TICKETS_PER_DAY
    ) {
      throw new Error(
        `Each quantity must be an integer between 0 and ${MAX_TICKETS_PER_DAY}.`
      );
    }

    combined.set(
      occurrenceDate,
      (combined.get(occurrenceDate) || 0) + quantity
    );
  }

  const normalized = [...combined.entries()]
    .filter(([, quantity]) => quantity > 0)
    .map(([occurrenceDate, quantity]) => ({
      occurrenceDate,
      quantity,
    }));

  if (normalized.length === 0) {
    throw new Error('Select at least one ticket.');
  }

  if (normalized.length > MAX_SELECTED_DAYS) {
    throw new Error(
      `No more than ${MAX_SELECTED_DAYS} event dates may be purchased at once.`
    );
  }

  for (const selection of normalized) {
    if (selection.quantity > MAX_TICKETS_PER_DAY) {
      throw new Error(
        `No more than ${MAX_TICKETS_PER_DAY} tickets may be purchased for one day.`
      );
    }
  }

  return normalized.sort((a, b) =>
    a.occurrenceDate.localeCompare(b.occurrenceDate)
  );
};

const buildEventImageUrl = (eventRecord) => {
  const storedImage =
    eventRecord.thumbnail ||
    eventRecord.image ||
    eventRecord.imageUrl;

  if (!storedImage) {
    return null;
  }

  if (
    storedImage.startsWith('http://') ||
    storedImage.startsWith('https://')
  ) {
    return storedImage;
  }

  return process.env.BASE_URL
    ? `${process.env.BASE_URL}/uploads/${storedImage}`
    : null;
};

const createEventCheckoutSession = async (req, res) => {
  let holdToken = null;

  try {
    const { eventId, metadata } = req.body;
    const selections = normalizeSelections(req.body.selections);

    if (!eventId) {
      return res.status(400).json({ message: 'Event ID is required.' });
    }

    if (
      metadata?.hasAcceptedPrivacy !== true ||
      metadata?.hasAcceptedTermsOfService !== true
    ) {
      return res.status(400).json({
        message:
          'You must accept the Terms of Service and Privacy Policy to continue.',
        redirect: '/accept-privacy-terms',
      });
    }

    if (!process.env.REGISTER_FRONTEND) {
      throw new Error('Missing REGISTER_FRONTEND environment variable.');
    }

    const connectedAccountId = stripeConnectedAccountId;

    const holdExpiresAt = new Date(
      Date.now() + HOLD_MINUTES * 60 * 1000
    );

    const reservedCheckout = await sequelize.transaction(
      async (transaction) => {
        const eventRecord = await Event.findByPk(eventId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });

        if (!eventRecord) {
          const error = new Error('Event not found.');
          error.status = 404;
          throw error;
        }

        const eventName = eventRecord.name;
        const eventPrice = Number(eventRecord.price);
        const isPurchase =
          eventRecord.isPurchase ?? eventRecord.is_purchase;

        if (isPurchase !== true) {
          const error = new Error(
            'This event is not configured as a paid event.'
          );
          error.status = 400;
          throw error;
        }

        if (!eventName) {
          throw new Error(`Event ${eventRecord.id} does not have a name.`);
        }

        if (!Number.isFinite(eventPrice) || eventPrice <= 0) {
          const error = new Error(
            'This event does not have a valid ticket price.'
          );
          error.status = 400;
          throw error;
        }

        if (
          eventRecord.isActive !== undefined &&
          eventRecord.isActive !== null &&
          eventRecord.isActive !== true
        ) {
          const error = new Error('This event is not currently available.');
          error.status = 400;
          throw error;
        }

        const now = new Date();

        if (
          eventRecord.preorderStart &&
          now < new Date(eventRecord.preorderStart)
        ) {
          const error = new Error(
            'Ticket sales for this event have not started yet.'
          );
          error.status = 400;
          throw error;
        }

        if (
          eventRecord.preorderEnd &&
          now > new Date(eventRecord.preorderEnd)
        ) {
          const error = new Error(
            'Ticket sales for this event have ended.'
          );
          error.status = 400;
          throw error;
        }

        const requestedDates = selections.map(
          (selection) => selection.occurrenceDate
        );

        const occurrences = await EventOccurrence.findAll({
          where: {
            eventId: eventRecord.id,
            occurrenceDate: requestedDates,
            isActive: true,
          },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });

        if (occurrences.length !== requestedDates.length) {
          const foundDates = new Set(
            occurrences.map((occurrence) => occurrence.occurrenceDate)
          );

          const missingDate = requestedDates.find(
            (date) => !foundDates.has(date)
          );

          const error = new Error(
            `${missingDate} is not an available date for this event.`
          );
          error.status = 400;
          throw error;
        }

        const unitAmount = Math.round(eventPrice * 100);
        const holdSelections = [];

        for (const selection of selections) {
          const occurrence = occurrences.find(
            (row) => row.occurrenceDate === selection.occurrenceDate
          );

          const capacity = Number(occurrence.capacity);
          const reservedCount = Number(occurrence.reservedCount || 0);
          const soldCount = Number(occurrence.soldCount || 0);

          if (capacity > 0) {
            const remaining = capacity - reservedCount - soldCount;

            if (remaining <= 0) {
              const error = new Error(
                `${selection.occurrenceDate} is sold out.`
              );
              error.status = 400;
              throw error;
            }

            if (selection.quantity > remaining) {
              const error = new Error(
                `Only ${remaining} ticket${remaining === 1 ? '' : 's'} remain for ${selection.occurrenceDate}.`
              );
              error.status = 400;
              throw error;
            }
          }

          occurrence.reservedCount =
            reservedCount + selection.quantity;

          await occurrence.save({ transaction });

          holdSelections.push({
            occurrenceId: occurrence.id,
            occurrenceDate: occurrence.occurrenceDate,
            quantity: selection.quantity,
            unitAmount,
          });
        }

        const hold = await EventCheckoutHold.create(
          {
            eventId: eventRecord.id,
            userId: req.user?.id || null,
            connectedAccountId,
            status: 'reserving',
            selections: holdSelections,
            expiresAt: holdExpiresAt,
          },
          { transaction }
        );

        return {
          eventRecord,
          hold,
          holdSelections,
          connectedAccountId,
        };
      }
    );

    holdToken = reservedCheckout.hold.holdToken;

    const {
      eventRecord,
      holdSelections,
    } = reservedCheckout;

    const eventName = eventRecord.name;
    const eventDescription = eventRecord.description
      ? String(eventRecord.description).slice(0, 500)
      : `Tickets for ${eventName}`;
    const eventImageUrl = buildEventImageUrl(eventRecord);

    const stripeMetadata = {
      checkoutType: 'event_preorder',
      holdToken,
      eventId: String(eventRecord.id),
      connectedAccountId,
      userId: req.user?.id ? String(req.user.id) : '',
      hasAcceptedPrivacy: 'true',
      hasAcceptedTermsOfService: 'true',
    };

    const lineItems = holdSelections.map((selection) => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: `${eventName} — ${selection.occurrenceDate}`,
          description: eventDescription,
          ...(eventImageUrl ? { images: [eventImageUrl] } : {}),
          metadata: {
            eventId: String(eventRecord.id),
            occurrenceId: String(selection.occurrenceId),
            occurrenceDate: selection.occurrenceDate,
          },
        },
        unit_amount: selection.unitAmount,
      },
      quantity: selection.quantity,
    }));

    const checkoutSession = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: lineItems,
        metadata: stripeMetadata,
        payment_intent_data: {
          metadata: stripeMetadata,
        },
        expires_at: Math.floor(holdExpiresAt.getTime() / 1000),
        success_url:
            `${process.env.REGISTER_FRONTEND}/event-checkout-success` +
            '?session_id={CHECKOUT_SESSION_ID}',
        cancel_url:
          `${process.env.REGISTER_FRONTEND}/events/${eventRecord.id}` +
          '?checkout=cancelled&session_id={CHECKOUT_SESSION_ID}',
        billing_address_collection: 'required',
      },
      {
        stripeAccount: connectedAccountId,
        idempotencyKey: `event-hold-${holdToken}`,
      }
    );

    await EventCheckoutHold.update(
      {
        stripeSessionId: checkoutSession.id,
        status: 'open',
      },
      {
        where: { holdToken },
      }
    );

    console.log('Multi-date Event Checkout Session created:', {
      stripeSessionId: checkoutSession.id,
      eventId: eventRecord.id,
      holdToken,
      selections: holdSelections,
      connectedAccountId,
    });

    return res.status(200).json({
      url: checkoutSession.url,
      sessionId: checkoutSession.id,
      holdToken,
    });
  } catch (error) {
    if (holdToken) {
      try {
        await releaseEventCheckoutHold(holdToken, 'failed');
      } catch (releaseError) {
        console.error(
          'Failed to release event inventory after Checkout creation error:',
          releaseError
        );
      }
    }

    console.error('Error creating event Checkout Session:', {
      type: error.type,
      code: error.code,
      message: error.message,
      requestId: error.requestId,
    });

    return res.status(error.status || 500).json({
      message:
        error.status
          ? error.message
          : 'Failed to create event Checkout Session.',
      ...(process.env.NODE_ENV !== 'production'
        ? { error: error.message }
        : {}),
    });
  }
};
const getEventCheckoutSuccess =
  async (req, res) => {
    try {
      const sessionId =
        String(
          req.query.sessionId || ''
        ).trim();

      if (!sessionId) {
        return res.status(400).json({
          message:
            'Stripe Checkout Session ID is required.',
        });
      }

      if (
        !sessionId.startsWith(
          'cs_'
        )
      ) {
        return res.status(400).json({
          message:
            'The Checkout Session ID is invalid.',
        });
      }

      const connectedAccountId = stripeConnectedAccountId;

      /*
       * The Checkout Session was created directly on
       * the connected BakersBurns account, so it must
       * also be retrieved from that same account.
       */
      const checkoutSession =
        await stripe.checkout.sessions.retrieve(
          sessionId,
          {
            stripeAccount:
              connectedAccountId,
          }
        );

      const checkoutType =
        checkoutSession.metadata
          ?.checkoutType;

      if (
        checkoutType !==
        'event_preorder'
      ) {
        return res.status(400).json({
          message:
            'This Checkout Session does not belong to an event purchase.',
        });
      }

      /*
       * Only expose purchase details after Stripe
       * confirms that payment completed.
       */
      if (
        checkoutSession.payment_status !==
        'paid'
      ) {
        return res.status(409).json({
          message:
            'The event payment is still being confirmed.',
        });
      }

      const eventId =
        Number(
          checkoutSession.metadata
            ?.eventId
        );

      if (
        !Number.isInteger(
          eventId
        ) ||
        eventId <= 0
      ) {
        return res.status(400).json({
          message:
            'The event ID is missing from the Checkout Session.',
        });
      }

      /*
       * The webhook creates one EventReservation per
       * purchased occurrence. The Stripe Session ID is
       * the shared identifier for the purchase.
       */
      const reservations =
        await EventReservation.findAll({
          where: {
            stripeSessionId:
              checkoutSession.id,

            status:
              'paid',
          },
          order: [
            [
              'occurrenceId',
              'ASC',
            ],
          ],
        });

      /*
       * Stripe can redirect the customer at nearly the
       * same moment that the webhook is committing its
       * database transaction.
       *
       * Return 409 so the React page retries briefly.
       */
      if (
        reservations.length === 0
      ) {
        return res.status(409).json({
          message:
            'Your payment succeeded and your ticket details are still being finalized.',
        });
      }

      const eventRecord =
        await Event.findByPk(
          eventId
        );

      if (!eventRecord) {
        return res.status(404).json({
          message:
            'The purchased event could not be found.',
        });
      }

      const occurrenceIds = [
        ...new Set(
          reservations
            .map(
              (reservation) =>
                Number(
                  reservation
                    .occurrenceId
                )
            )
            .filter(
              (occurrenceId) =>
                Number.isInteger(
                  occurrenceId
                ) &&
                occurrenceId > 0
            )
        ),
      ];

      const occurrences =
        occurrenceIds.length > 0
          ? await EventOccurrence.findAll(
              {
                where: {
                  id:
                    occurrenceIds,
                },
              }
            )
          : [];

      const occurrenceById =
        new Map(
          occurrences.map(
            (occurrence) => [
              Number(
                occurrence.id
              ),
              occurrence,
            ]
          )
        );

      const normalizedReservations =
        reservations.map(
          (reservation) => {
            const occurrence =
              occurrenceById.get(
                Number(
                  reservation
                    .occurrenceId
                )
              );

            return {
              id:
                reservation.id,

              eventId:
                reservation.eventId,

              occurrenceId:
                reservation
                  .occurrenceId,

              occurrenceDate:
                occurrence
                  ?.occurrenceDate ||
                null,

              quantity:
                Number(
                  reservation.quantity ||
                    0
                ),

              unitAmount:
                Number(
                  reservation.unitAmount ||
                    0
                ),

              status:
                reservation.status,
            };
          }
        );

      const purchaserEmail =
        checkoutSession
          .customer_details
          ?.email ||
        checkoutSession
          .customer_email ||
        reservations[0]
          ?.purchaserEmail ||
        null;

      return res.status(200).json({
        success: true,

        sessionId:
          checkoutSession.id,

        paymentStatus:
          checkoutSession
            .payment_status,

        customerEmail:
          purchaserEmail,

        purchaserEmail,

        amountTotal:
          Number(
            checkoutSession
              .amount_total || 0
          ),

        currency:
          checkoutSession.currency ||
          'usd',

        event: {
          id:
            eventRecord.id,

          name:
            eventRecord.name,

          description:
            eventRecord.description ||
            '',

          startTime:
            eventRecord.startTime ||
            null,

          endTime:
            eventRecord.endTime ||
            null,

          /*
           * These properties are optional until they
           * are added to the Event model.
           */
          location:
            eventRecord.location ||
            '',

          timezone:
            eventRecord.timezone ||
            process.env
              .EVENT_TIMEZONE ||
            'America/Denver',
        },

        reservations:
          normalizedReservations,
      });
    } catch (error) {
      console.error(
        'Error loading event checkout success details:',
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

      /*
       * Stripe returns resource_missing when the
       * Session ID is invalid or belongs to a different
       * Stripe account.
       */
      if (
        error.code ===
        'resource_missing'
      ) {
        return res.status(404).json({
          message:
            'The Checkout Session could not be found.',
        });
      }

      return res.status(500).json({
        message:
          'Unable to load the event purchase details.',

        ...(process.env
          .NODE_ENV !==
        'production'
          ? {
              error:
                error.message,
            }
          : {}),
      });
    }
  };

module.exports = {
  createEventCheckoutSession,
  getEventCheckoutSuccess
};
