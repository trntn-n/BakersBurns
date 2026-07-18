'use strict';

const sequelize = require(
  '../../config/database'
);

const Event = require(
  '../../models/events'
);

const EventReservation = require(
  '../../models/eventReservation'
);

const EventRefundRequest = require(
  '../../models/eventRefundRequest'
);

/*
 * Stripe configuration
 *
 * This must match the configuration used by
 * eventCheckout.js because event purchases are
 * direct charges on the connected Stripe account.
 */
const stripeMode =
  String(process.env.STRIPE_MODE || 'live')
    .trim()
    .toLowerCase();

const stripeSecretKey =
  stripeMode === 'test'
    ? process.env.STRIPE_TEST_SECRET_KEY
    : process.env.STRIPE_SECRET_KEY;

const stripeConnectedAccountId =
  stripeMode === 'test'
    ? process.env.BAKERS_BURNS_TEST_ACCOUNT_ID
    : process.env.BAKERS_BURNS_LIVE_ACCOUNT_ID;

if (!stripeSecretKey) {
  throw new Error(
    `Missing Stripe secret key for ${stripeMode} mode.`
  );
}

if (
  !stripeConnectedAccountId ||
  !stripeConnectedAccountId.startsWith('acct_')
) {
  throw new Error(
    `Missing or invalid BakersBurns connected account ID for ${stripeMode} mode.`
  );
}

const stripe = require('stripe')(
  stripeSecretKey
);

const EMAIL_PATTERN =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_REASON_LENGTH = 255;
const MAX_DETAILS_LENGTH = 1000;

const ACTIVE_REFUND_STATUSES = [
  'requested',
  'approved',
  'processing',
];

/**
 * Normalize an email address for comparison.
 *
 * @param {unknown} value
 * @returns {string}
 */
const normalizeEmail = (
  value
) => {
  return String(value || '')
    .trim()
    .toLowerCase();
};

/**
 * Return the PaymentIntent ID from a Stripe
 * Checkout Session.
 *
 * @param {object} checkoutSession
 * @returns {string|null}
 */
const getPaymentIntentId = (
  checkoutSession
) => {
  const paymentIntent =
    checkoutSession
      ?.payment_intent;

  if (
    typeof paymentIntent ===
    'string'
  ) {
    return paymentIntent;
  }

  if (
    paymentIntent &&
    typeof paymentIntent ===
      'object'
  ) {
    return paymentIntent.id ||
      null;
  }

  return null;
};

/**
 * Submit an event refund request.
 *
 * This endpoint records a request for later
 * administrator review. It does not issue the
 * Stripe refund immediately.
 *
 * Expected body:
 *
 * {
 *   sessionId: string,
 *   email: string,
 *   reason: string,
 *   details?: string
 * }
 */
const createEventRefundRequest =
  async (req, res) => {
    try {
      const sessionId = String(
        req.body?.sessionId ||
          req.body?.session_id ||
          ''
      ).trim();

      const submittedEmail =
        normalizeEmail(
          req.body?.email
        );

      const reason = String(
        req.body?.reason || ''
      ).trim();

      const details = String(
        req.body?.details || ''
      ).trim();

      if (!sessionId) {
        return res
          .status(400)
          .json({
            message:
              'The Checkout Session ID is required.',
          });
      }

      if (
        !sessionId.startsWith(
          'cs_'
        )
      ) {
        return res
          .status(400)
          .json({
            message:
              'The Checkout Session ID is invalid.',
          });
      }

      if (
        !EMAIL_PATTERN.test(
          submittedEmail
        )
      ) {
        return res
          .status(400)
          .json({
            message:
              'A valid purchaser email address is required.',
          });
      }

      if (!reason) {
        return res
          .status(400)
          .json({
            message:
              'Select a reason for the refund request.',
          });
      }

      if (
        reason.length >
        MAX_REASON_LENGTH
      ) {
        return res
          .status(400)
          .json({
            message:
              `The refund reason cannot exceed ${MAX_REASON_LENGTH} characters.`,
          });
      }

      if (
        details.length >
        MAX_DETAILS_LENGTH
      ) {
        return res
          .status(400)
          .json({
            message:
              `Additional details cannot exceed ${MAX_DETAILS_LENGTH} characters.`,
          });
      }

      /*
       * The Checkout Session was created as a
       * direct charge on the connected account.
       */
      const checkoutSession =
        await stripe
          .checkout
          .sessions
          .retrieve(
            sessionId,
            {
              stripeAccount:
                stripeConnectedAccountId,
            }
          );

      if (
        checkoutSession
          ?.metadata
          ?.checkoutType !==
        'event_preorder'
      ) {
        return res
          .status(400)
          .json({
            message:
              'This Checkout Session does not belong to an event purchase.',
          });
      }

      if (
        checkoutSession
          .payment_status !==
        'paid'
      ) {
        return res
          .status(409)
          .json({
            message:
              'A refund cannot be requested because this payment has not been completed.',
          });
      }

      const eventId = Number(
        checkoutSession
          ?.metadata
          ?.eventId
      );

      if (
        !Number.isInteger(
          eventId
        ) ||
        eventId <= 0
      ) {
        return res
          .status(400)
          .json({
            message:
              'The event ID is missing from the Checkout Session.',
          });
      }

      const stripeEmail =
        normalizeEmail(
          checkoutSession
            ?.customer_details
            ?.email ||
          checkoutSession
            ?.customer_email
        );

      /*
       * Use the email stored by Stripe as the
       * authoritative purchaser email.
       */
      if (
        !stripeEmail ||
        stripeEmail !==
          submittedEmail
      ) {
        return res
          .status(403)
          .json({
            message:
              'The supplied email address does not match this event purchase.',
          });
      }

      const paymentIntentId =
        getPaymentIntentId(
          checkoutSession
        );

      const amountTotal = Number(
        checkoutSession
          ?.amount_total || 0
      );

      const currency = String(
        checkoutSession
          ?.currency || 'usd'
      )
        .trim()
        .toLowerCase();

      const result =
        await sequelize.transaction(
          async (
            transaction
          ) => {
            const reservations =
              await EventReservation
                .findAll({
                  where: {
                    stripeSessionId:
                      checkoutSession.id,
                    status: 'paid',
                  },
                  transaction,
                  lock:
                    transaction
                      .LOCK
                      .UPDATE,
                });

            if (
              reservations.length ===
              0
            ) {
              const error =
                new Error(
                  'The paid event reservations could not be found.'
                );

              error.status = 409;

              throw error;
            }

            const reservationEmail =
              normalizeEmail(
                reservations[0]
                  ?.purchaserEmail
              );

            if (
              reservationEmail &&
              reservationEmail !==
                stripeEmail
            ) {
              const error =
                new Error(
                  'The reservation purchaser information does not match the Stripe purchase.'
                );

              error.status = 409;

              throw error;
            }

            const existingRequest =
              await EventRefundRequest
                .findOne({
                  where: {
                    stripeSessionId:
                      checkoutSession.id,
                    status:
                      ACTIVE_REFUND_STATUSES,
                  },
                  transaction,
                  lock:
                    transaction
                      .LOCK
                      .UPDATE,
                });

            if (existingRequest) {
              return {
                refundRequest:
                  existingRequest,
                alreadyExists: true,
              };
            }

            const eventRecord =
              await Event.findByPk(
                eventId,
                {
                  transaction,
                }
              );

            if (!eventRecord) {
              const error =
                new Error(
                  'The purchased event could not be found.'
                );

              error.status = 404;

              throw error;
            }

            const refundRequest =
              await EventRefundRequest
                .create(
                  {
                    eventId,
                    stripeSessionId:
                      checkoutSession.id,
                    stripePaymentIntentId:
                      paymentIntentId,
                    connectedAccountId:
                      stripeConnectedAccountId,
                    purchaserEmail:
                      stripeEmail,
                    reason,
                    details:
                      details || null,
                    amountRequested:
                      Number.isFinite(
                        amountTotal
                      )
                        ? amountTotal
                        : 0,
                    currency,
                    status:
                      'requested',
                    requestedAt:
                      new Date(),
                  },
                  {
                    transaction,
                  }
                );

            return {
              refundRequest,
              alreadyExists: false,
            };
          }
        );

      if (result.alreadyExists) {
        return res
          .status(409)
          .json({
            message:
              'A refund request has already been submitted for this purchase.',
            refundRequest: {
              id:
                result
                  .refundRequest
                  .id,
              status:
                result
                  .refundRequest
                  .status,
              requestedAt:
                result
                  .refundRequest
                  .requestedAt,
            },
          });
      }

      console.log(
        'Event refund request submitted:',
        {
          refundRequestId:
            result
              .refundRequest
              .id,
          stripeSessionId:
            checkoutSession.id,
          paymentIntentId,
          eventId,
          connectedAccountId:
            stripeConnectedAccountId,
          purchaserEmail:
            stripeEmail,
          amountRequested:
            amountTotal,
          currency,
        }
      );

      return res
        .status(201)
        .json({
          success: true,
          message:
            'Your refund request has been received. We will email you after it has been reviewed.',
          refundRequest: {
            id:
              result
                .refundRequest
                .id,
            eventId:
              result
                .refundRequest
                .eventId,
            status:
              result
                .refundRequest
                .status,
            reason:
              result
                .refundRequest
                .reason,
            requestedAt:
              result
                .refundRequest
                .requestedAt,
          },
        });
    } catch (error) {
      console.error(
        'Error creating event refund request:',
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
            process.env
              .NODE_ENV !==
            'production'
              ? error.stack
              : undefined,
        }
      );

      if (
        error.code ===
        'resource_missing'
      ) {
        return res
          .status(404)
          .json({
            message:
              'The Checkout Session could not be found.',
          });
      }

      if (
        error.code ===
        'account_invalid'
      ) {
        return res
          .status(500)
          .json({
            message:
              'The configured Stripe account could not be accessed.',
          });
      }

      return res
        .status(
          error.status || 500
        )
        .json({
          message:
            error.status
              ? error.message
              : 'We could not submit your refund request.',
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
  createEventRefundRequest,
};