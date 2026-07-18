// controllers/register/eventCheckout.js
'use strict';

const sequelize = require('../../config/database');

const Event = require('../../models/events');
const EventOccurrence = require(
  '../../models/eventOccurrence'
);
const EventCheckoutHold = require(
  '../../models/eventCheckoutHold'
);
const EventReservation = require(
  '../../models/eventReservation'
);

const {
  releaseEventCheckoutHold,
} = require(
  '../../services/eventCheckoutInventoryService.js'
);

/*
 * Stripe configuration
 *
 * Test mode:
 *   STRIPE_TEST_SECRET_KEY
 *   BAKERS_BURNS_TEST_ACCOUNT_ID
 *
 * Live mode:
 *   STRIPE_SECRET_KEY
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

const stripeSecretKey = stripeModeTest
  ? process.env.STRIPE_TEST_SECRET_KEY
  : process.env.STRIPE_SECRET_KEY;

const stripeConnectedAccountId =
  stripeModeTest
    ? process.env.BAKERS_BURNS_TEST_ACCOUNT_ID
    : process.env.BAKERS_BURNS_LIVE_ACCOUNT_ID;

const stripeSecretKeyEnvName =
  stripeModeTest
    ? 'STRIPE_TEST_SECRET_KEY'
    : 'STRIPE_SECRET_KEY';

const stripeConnectedAccountEnvName =
  stripeModeTest
    ? 'BAKERS_BURNS_TEST_ACCOUNT_ID'
    : 'BAKERS_BURNS_LIVE_ACCOUNT_ID';

if (!stripeSecretKey) {
  throw new Error(
    `Missing ${stripeSecretKeyEnvName} environment variable.`
  );
}

if (
  !stripeConnectedAccountId ||
  !stripeConnectedAccountId.startsWith('acct_')
) {
  throw new Error(
    `${stripeConnectedAccountEnvName} is missing or invalid.`
  );
}

const stripe = require('stripe')(
  stripeSecretKey
);

const MAX_TICKETS_PER_DAY = 20;
const MAX_SELECTED_DAYS = 50;
const HOLD_MINUTES = 30;

/*
 * Do not log the Stripe secret key.
 */
console.log(
  'Event Checkout Stripe configuration loaded:',
  {
    stripeMode,
    stripeModeTest,
    connectedAccountId:
      stripeConnectedAccountId,
    secretKeyConfigured:
      Boolean(stripeSecretKey),
  }
);

/**
 * Create an Error with an HTTP response status.
 *
 * @param {string} message
 * @param {number} status
 * @returns {Error}
 */
const createHttpError = (
  message,
  status = 500
) => {
  const error = new Error(message);
  error.status = status;

  return error;
};

/**
 * Normalize and combine selected occurrence dates.
 *
 * Expected format:
 *
 * [
 *   {
 *     occurrenceDate: '2026-08-15',
 *     quantity: 2
 *   }
 * ]
 *
 * Duplicate occurrence dates are combined.
 *
 * @param {unknown} rawSelections
 * @returns {Array<{
 *   occurrenceDate: string,
 *   quantity: number
 * }>}
 */
const normalizeSelections = (
  rawSelections
) => {
  if (!Array.isArray(rawSelections)) {
    throw createHttpError(
      'Event selections are required.',
      400
    );
  }

  const combinedSelections = new Map();

  for (const selection of rawSelections) {
    const occurrenceDate = String(
      selection?.occurrenceDate || ''
    ).trim();

    const quantity = Number(
      selection?.quantity
    );

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        occurrenceDate
      )
    ) {
      throw createHttpError(
        `Invalid occurrence date: ${
          occurrenceDate || 'empty'
        }.`,
        400
      );
    }

    if (
      !Number.isInteger(quantity) ||
      quantity < 0 ||
      quantity > MAX_TICKETS_PER_DAY
    ) {
      throw createHttpError(
        `Each quantity must be an integer between 0 and ${MAX_TICKETS_PER_DAY}.`,
        400
      );
    }

    const existingQuantity =
      combinedSelections.get(
        occurrenceDate
      ) || 0;

    combinedSelections.set(
      occurrenceDate,
      existingQuantity + quantity
    );
  }

  const normalizedSelections = [
    ...combinedSelections.entries(),
  ]
    .filter(
      ([, quantity]) => quantity > 0
    )
    .map(
      ([
        occurrenceDate,
        quantity,
      ]) => ({
        occurrenceDate,
        quantity,
      })
    );

  if (
    normalizedSelections.length === 0
  ) {
    throw createHttpError(
      'Select at least one ticket.',
      400
    );
  }

  if (
    normalizedSelections.length >
    MAX_SELECTED_DAYS
  ) {
    throw createHttpError(
      `No more than ${MAX_SELECTED_DAYS} event dates may be purchased at once.`,
      400
    );
  }

  for (
    const selection of
    normalizedSelections
  ) {
    if (
      selection.quantity >
      MAX_TICKETS_PER_DAY
    ) {
      throw createHttpError(
        `No more than ${MAX_TICKETS_PER_DAY} tickets may be purchased for one day.`,
        400
      );
    }
  }

  return normalizedSelections.sort(
    (selectionA, selectionB) =>
      selectionA.occurrenceDate.localeCompare(
        selectionB.occurrenceDate
      )
  );
};

/**
 * Build an absolute image URL that Stripe can access.
 *
 * @param {object} eventRecord
 * @returns {string|null}
 */
const buildEventImageUrl = (
  eventRecord
) => {
  const storedImage =
    eventRecord.thumbnail ||
    eventRecord.image ||
    eventRecord.imageUrl;

  if (!storedImage) {
    return null;
  }

  const normalizedImage =
    String(storedImage).trim();

  if (!normalizedImage) {
    return null;
  }

  if (
    normalizedImage.startsWith(
      'http://'
    ) ||
    normalizedImage.startsWith(
      'https://'
    )
  ) {
    return normalizedImage;
  }

  const baseUrl = String(
    process.env.BASE_URL || ''
  )
    .trim()
    .replace(/\/+$/, '');

  if (!baseUrl) {
    return null;
  }

  const normalizedPath =
    normalizedImage.replace(/^\/+/, '');

  if (
    normalizedPath.startsWith(
      'uploads/'
    )
  ) {
    return `${baseUrl}/${normalizedPath}`;
  }

  return `${baseUrl}/uploads/${normalizedPath}`;
};

/**
 * Create a Stripe Checkout Session for one or more event dates.
 *
 * Expected request body:
 *
 * {
 *   eventId: 12,
 *   selections: [
 *     {
 *       occurrenceDate: '2026-08-15',
 *       quantity: 2
 *     }
 *   ],
 *   metadata: {
 *     hasAcceptedPrivacy: true,
 *     hasAcceptedTermsOfService: true
 *   }
 * }
 */
const createEventCheckoutSession =
  async (req, res) => {
    let holdToken = null;

    try {
      const {
        eventId,
        metadata,
      } = req.body || {};

      const normalizedEventId =
        Number(eventId);

      if (
        !Number.isInteger(
          normalizedEventId
        ) ||
        normalizedEventId <= 0
      ) {
        return res.status(400).json({
          message:
            'A valid Event ID is required.',
        });
      }

      const selections =
        normalizeSelections(
          req.body?.selections
        );

      if (
        metadata?.hasAcceptedPrivacy !==
          true ||
        metadata
          ?.hasAcceptedTermsOfService !==
          true
      ) {
        return res.status(400).json({
          message:
            'You must accept the Terms of Service and Privacy Policy to continue.',
          redirect:
            '/accept-privacy-terms',
        });
      }

      const registerFrontend = String(
        process.env.REGISTER_FRONTEND ||
          ''
      )
        .trim()
        .replace(/\/+$/, '');

      if (!registerFrontend) {
        throw new Error(
          'Missing REGISTER_FRONTEND environment variable.'
        );
      }

      const connectedAccountId =
        stripeConnectedAccountId;

      const holdExpiresAt = new Date(
        Date.now() +
          HOLD_MINUTES * 60 * 1000
      );

      /*
       * Reserve inventory inside one locked
       * database transaction.
       */
      const reservedCheckout =
        await sequelize.transaction(
          async (transaction) => {
            const eventRecord =
              await Event.findByPk(
                normalizedEventId,
                {
                  transaction,
                  lock:
                    transaction.LOCK
                      .UPDATE,
                }
              );

            if (!eventRecord) {
              throw createHttpError(
                'Event not found.',
                404
              );
            }

            const eventName = String(
              eventRecord.name || ''
            ).trim();

            const eventPrice = Number(
              eventRecord.price
            );

            const isPurchase =
              eventRecord.isPurchase ??
              eventRecord.is_purchase;

            if (isPurchase !== true) {
              throw createHttpError(
                'This event is not configured as a paid event.',
                400
              );
            }

            if (!eventName) {
              throw new Error(
                `Event ${eventRecord.id} does not have a name.`
              );
            }

            if (
              !Number.isFinite(
                eventPrice
              ) ||
              eventPrice <= 0
            ) {
              throw createHttpError(
                'This event does not have a valid ticket price.',
                400
              );
            }

            if (
              eventRecord.isActive !==
                undefined &&
              eventRecord.isActive !==
                null &&
              eventRecord.isActive !==
                true
            ) {
              throw createHttpError(
                'This event is not currently available.',
                400
              );
            }

            const now = new Date();

            if (
              eventRecord.preorderStart
            ) {
              const preorderStart =
                new Date(
                  eventRecord.preorderStart
                );

              if (
                !Number.isNaN(
                  preorderStart.getTime()
                ) &&
                now < preorderStart
              ) {
                throw createHttpError(
                  'Ticket sales for this event have not started yet.',
                  400
                );
              }
            }

            if (
              eventRecord.preorderEnd
            ) {
              const preorderEnd =
                new Date(
                  eventRecord.preorderEnd
                );

              if (
                !Number.isNaN(
                  preorderEnd.getTime()
                ) &&
                now > preorderEnd
              ) {
                throw createHttpError(
                  'Ticket sales for this event have ended.',
                  400
                );
              }
            }

            const requestedDates =
              selections.map(
                (selection) =>
                  selection.occurrenceDate
              );

            const occurrences =
              await EventOccurrence.findAll(
                {
                  where: {
                    eventId:
                      eventRecord.id,
                    occurrenceDate:
                      requestedDates,
                    isActive: true,
                  },
                  transaction,
                  lock:
                    transaction.LOCK
                      .UPDATE,
                }
              );

            if (
              occurrences.length !==
              requestedDates.length
            ) {
              const foundDates =
                new Set(
                  occurrences.map(
                    (occurrence) =>
                      String(
                        occurrence
                          .occurrenceDate
                      )
                  )
                );

              const missingDate =
                requestedDates.find(
                  (date) =>
                    !foundDates.has(
                      String(date)
                    )
                );

              throw createHttpError(
                `${
                  missingDate ||
                  'The selected date'
                } is not an available date for this event.`,
                400
              );
            }

            const unitAmount =
              Math.round(
                eventPrice * 100
              );

            if (
              !Number.isInteger(
                unitAmount
              ) ||
              unitAmount <= 0
            ) {
              throw createHttpError(
                'This event does not have a valid Stripe ticket price.',
                400
              );
            }

            const occurrenceByDate =
              new Map(
                occurrences.map(
                  (occurrence) => [
                    String(
                      occurrence
                        .occurrenceDate
                    ),
                    occurrence,
                  ]
                )
              );

            const holdSelections = [];

            for (
              const selection of
              selections
            ) {
              const occurrence =
                occurrenceByDate.get(
                  selection.occurrenceDate
                );

              if (!occurrence) {
                throw createHttpError(
                  `${selection.occurrenceDate} is not an available date for this event.`,
                  400
                );
              }

              const capacity =
                Number(
                  occurrence.capacity ||
                    0
                );

              const reservedCount =
                Number(
                  occurrence.reservedCount ||
                    0
                );

              const soldCount =
                Number(
                  occurrence.soldCount ||
                    0
                );

              if (
                !Number.isFinite(
                  reservedCount
                ) ||
                reservedCount < 0 ||
                !Number.isFinite(
                  soldCount
                ) ||
                soldCount < 0
              ) {
                throw new Error(
                  `Occurrence ${occurrence.id} contains invalid inventory counts.`
                );
              }

              /*
               * A capacity of zero or less is
               * treated as unlimited capacity.
               */
              if (
                Number.isFinite(
                  capacity
                ) &&
                capacity > 0
              ) {
                const remaining =
                  capacity -
                  reservedCount -
                  soldCount;

                if (remaining <= 0) {
                  throw createHttpError(
                    `${selection.occurrenceDate} is sold out.`,
                    400
                  );
                }

                if (
                  selection.quantity >
                  remaining
                ) {
                  throw createHttpError(
                    `Only ${remaining} ticket${
                      remaining === 1
                        ? ''
                        : 's'
                    } remain for ${selection.occurrenceDate}.`,
                    400
                  );
                }
              }

              occurrence.reservedCount =
                reservedCount +
                selection.quantity;

              await occurrence.save({
                transaction,
              });

              holdSelections.push({
                occurrenceId:
                  occurrence.id,
                occurrenceDate:
                  String(
                    occurrence
                      .occurrenceDate
                  ),
                quantity:
                  selection.quantity,
                unitAmount,
              });
            }

            const hold =
              await EventCheckoutHold.create(
                {
                  eventId:
                    eventRecord.id,
                  userId:
                    req.user?.id ||
                    null,
                  connectedAccountId,
                  status:
                    'reserving',
                  selections:
                    holdSelections,
                  expiresAt:
                    holdExpiresAt,
                },
                {
                  transaction,
                }
              );

            return {
              eventRecord,
              hold,
              holdSelections,
            };
          }
        );

      holdToken =
        reservedCheckout.hold
          .holdToken;

      if (!holdToken) {
        throw new Error(
          'The event inventory hold was created without a hold token.'
        );
      }

      const {
        eventRecord,
        holdSelections,
      } = reservedCheckout;

      const eventName = String(
        eventRecord.name
      ).trim();

      const eventDescription =
        eventRecord.description
          ? String(
              eventRecord.description
            ).slice(0, 500)
          : `Tickets for ${eventName}`;

      const eventImageUrl =
        buildEventImageUrl(
          eventRecord
        );

      const stripeMetadata = {
        checkoutType:
          'event_preorder',
        holdToken,
        eventId: String(
          eventRecord.id
        ),
        connectedAccountId,
        userId: req.user?.id
          ? String(req.user.id)
          : '',
        hasAcceptedPrivacy:
          'true',
        hasAcceptedTermsOfService:
          'true',
      };

      const lineItems =
        holdSelections.map(
          (selection) => ({
            price_data: {
              currency: 'usd',
              product_data: {
                name:
                  `${eventName} — ` +
                  selection.occurrenceDate,
                description:
                  eventDescription,
                ...(eventImageUrl
                  ? {
                      images: [
                        eventImageUrl,
                      ],
                    }
                  : {}),
                metadata: {
                  eventId: String(
                    eventRecord.id
                  ),
                  occurrenceId:
                    String(
                      selection
                        .occurrenceId
                    ),
                  occurrenceDate:
                    selection
                      .occurrenceDate,
                },
              },
              unit_amount:
                selection.unitAmount,
            },
            quantity:
              selection.quantity,
          })
        );

      /*
       * This creates a direct charge on
       * the selected connected account.
       */
      const checkoutSession =
        await stripe.checkout.sessions.create(
          {
            mode: 'payment',
            payment_method_types: [
              'card',
            ],
            line_items: lineItems,
            metadata:
              stripeMetadata,
            payment_intent_data: {
              metadata:
                stripeMetadata,
            },
            expires_at: Math.floor(
              holdExpiresAt.getTime() /
                1000
            ),
            success_url:
              `${registerFrontend}/event-checkout-success` +
              '?session_id={CHECKOUT_SESSION_ID}',
            cancel_url:
              `${registerFrontend}/events/${eventRecord.id}` +
              '?checkout=cancelled&session_id={CHECKOUT_SESSION_ID}',
            billing_address_collection:
              'required',
          },
          {
            stripeAccount:
              connectedAccountId,
            idempotencyKey:
              `event-hold-${holdToken}`,
          }
        );

      if (
        !checkoutSession?.id ||
        !checkoutSession?.url
      ) {
        throw new Error(
          'Stripe created an invalid Checkout Session response.'
        );
      }

      await EventCheckoutHold.update(
        {
          stripeSessionId:
            checkoutSession.id,
          status: 'open',
        },
        {
          where: {
            holdToken,
          },
        }
      );

      console.log(
        'Multi-date Event Checkout Session created:',
        {
          stripeMode,
          stripeSessionId:
            checkoutSession.id,
          eventId:
            eventRecord.id,
          holdToken,
          selections:
            holdSelections,
          connectedAccountId,
        }
      );

      return res.status(200).json({
        url: checkoutSession.url,
        sessionId:
          checkoutSession.id,
        holdToken,
      });
    } catch (error) {
      if (holdToken) {
        try {
          await releaseEventCheckoutHold(
            holdToken,
            'failed'
          );
        } catch (releaseError) {
          console.error(
            'Failed to release event inventory after Checkout creation error:',
            {
              holdToken,
              message:
                releaseError.message,
              stack:
                process.env
                  .NODE_ENV !==
                'production'
                  ? releaseError.stack
                  : undefined,
            }
          );
        }
      }

      console.error(
        'Error creating event Checkout Session:',
        {
          stripeMode,
          connectedAccountId:
            stripeConnectedAccountId,
          type: error.type,
          code: error.code,
          message:
            error.message,
          requestId:
            error.requestId,
          status:
            error.status,
          stack:
            process.env.NODE_ENV !==
            'production'
              ? error.stack
              : undefined,
        }
      );

      return res
        .status(error.status || 500)
        .json({
          message:
            error.status
              ? error.message
              : 'Failed to create event Checkout Session.',
          ...(process.env.NODE_ENV !==
          'production'
            ? {
                error:
                  error.message,
              }
            : {}),
        });
    }
  };

/**
 * Return event purchase details after Stripe redirects
 * the purchaser to the success page.
 */
const getEventCheckoutSuccess =
  async (req, res) => {
    try {
      const sessionId = String(
        req.query.sessionId ||
          req.query.session_id ||
          ''
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

      const connectedAccountId =
        stripeConnectedAccountId;

      /*
       * The Session was created on the connected
       * account, so it must be retrieved from that
       * same connected account.
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

      if (
        checkoutSession.payment_status !==
        'paid'
      ) {
        return res.status(409).json({
          message:
            'The event payment is still being confirmed.',
        });
      }

      const eventId = Number(
        checkoutSession.metadata
          ?.eventId
      );

      if (
        !Number.isInteger(eventId) ||
        eventId <= 0
      ) {
        return res.status(400).json({
          message:
            'The event ID is missing from the Checkout Session.',
        });
      }

      /*
       * The event webhook creates one reservation
       * per purchased occurrence.
       */
      const reservations =
        await EventReservation.findAll(
          {
            where: {
              stripeSessionId:
                checkoutSession.id,
              status: 'paid',
            },
            order: [
              [
                'occurrenceId',
                'ASC',
              ],
            ],
          }
        );

      /*
       * Stripe can redirect before the webhook's
       * database transaction has completed.
       *
       * A 409 allows the frontend to retry.
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
            .map((reservation) =>
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
              Number(occurrence.id),
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
              id: reservation.id,
              eventId:
                reservation.eventId,
              occurrenceId:
                reservation
                  .occurrenceId,
              occurrenceDate:
                occurrence
                  ?.occurrenceDate ||
                null,
              quantity: Number(
                reservation.quantity ||
                  0
              ),
              unitAmount: Number(
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
          .customer_details?.email ||
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
        amountTotal: Number(
          checkoutSession
            .amount_total || 0
        ),
        currency:
          checkoutSession.currency ||
          'usd',
        event: {
          id: eventRecord.id,
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
        'Error loading event Checkout success details:',
        {
          stripeMode,
          connectedAccountId:
            stripeConnectedAccountId,
          type: error.type,
          code: error.code,
          message:
            error.message,
          requestId:
            error.requestId,
          stack:
            process.env.NODE_ENV !==
            'production'
              ? error.stack
              : undefined,
        }
      );

      /*
       * Stripe returns resource_missing when a Session
       * is invalid or belongs to another account.
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

      if (
        error.code ===
        'account_invalid'
      ) {
        return res.status(500).json({
          message:
            'The configured Stripe account could not be accessed.',
          ...(process.env.NODE_ENV !==
          'production'
            ? {
                error:
                  error.message,
              }
            : {}),
        });
      }

      return res.status(500).json({
        message:
          'Unable to load the event purchase details.',
        ...(process.env.NODE_ENV !==
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
  getEventCheckoutSuccess,
};