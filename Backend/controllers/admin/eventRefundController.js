
// controllers/admin/eventRefundController.js
'use strict';

const { Op } = require('sequelize');

const Event = require('../../models/events');
const EventReservation = require('../../models/eventReservation');

/*
 * Select the correct Stripe secret key based on STRIPE_MODE.
 *
 * Expected environment variables:
 *
 * STRIPE_MODE=test
 * STRIPE_TEST_SECRET_KEY=sk_test_...
 * STRIPE_SECRET_KEY=sk_live_...
 */
const stripeModeIsTest = process.env.STRIPE_MODE === 'test';

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

const stripe = require('stripe')(stripeSecretKey);

/*
 * Reservation statuses that indicate the reservation may still need
 * to be refunded.
 *
 * Add or remove values here if your application uses different statuses.
 */
const REFUNDABLE_RESERVATION_STATUSES = [
  'paid',
  'completed',
  'confirmed',
];

/*
 * Reservation statuses that should not be refunded again.
 */
const ALREADY_REFUNDED_STATUSES = [
  'refunded',
  'refund_pending',
  'partially_refunded',
];

/**
 * Convert a Sequelize model instance to a plain object.
 *
 * @param {object} record
 * @returns {object|null}
 */
const toPlainObject = (record) => {
  if (!record) {
    return null;
  }

  if (typeof record.get === 'function') {
    return record.get({ plain: true });
  }

  return record;
};

/**
 * Read a field while supporting both snake_case and camelCase model names.
 *
 * This lets the controller work whether Sequelize exposes:
 *
 * event_id or eventId
 * stripe_payment_intent_id or stripePaymentIntentId
 * purchaser_email or purchaserEmail
 *
 * @param {object} record
 * @param {string[]} fieldNames
 * @returns {*}
 */
const getField = (record, fieldNames) => {
  const plainRecord = toPlainObject(record);

  for (const fieldName of fieldNames) {
    if (
      plainRecord &&
      plainRecord[fieldName] !== undefined &&
      plainRecord[fieldName] !== null
    ) {
      return plainRecord[fieldName];
    }
  }

  return null;
};

/**
 * Determine whether the reservation has already been refunded.
 *
 * @param {object} reservation
 * @returns {boolean}
 */
const reservationIsAlreadyRefunded = (reservation) => {
  const status = String(
    getField(reservation, ['status']) || ''
  ).toLowerCase();

  const stripeRefundId = getField(reservation, [
    'stripe_refund_id',
    'stripeRefundId',
  ]);

  const refundedAt = getField(reservation, [
    'refunded_at',
    'refundedAt',
  ]);

  return (
    ALREADY_REFUNDED_STATUSES.includes(status) ||
    Boolean(stripeRefundId) ||
    Boolean(refundedAt)
  );
};

/**
 * Build an object containing only fields that appear to exist on the
 * EventReservation Sequelize model.
 *
 * This prevents Sequelize from receiving unknown attributes when your
 * model has not yet been updated with every recommended refund field.
 *
 * @param {object} values
 * @returns {object}
 */
const buildReservationUpdate = (values) => {
  const modelAttributes =
    EventReservation.rawAttributes ||
    EventReservation.getAttributes?.() ||
    {};

  return Object.entries(values).reduce((updates, [fieldName, value]) => {
    if (Object.prototype.hasOwnProperty.call(modelAttributes, fieldName)) {
      updates[fieldName] = value;
    }

    return updates;
  }, {});
};

/**
 * Update a reservation after a successful Stripe refund.
 *
 * This supports either camelCase or snake_case model attributes.
 *
 * Recommended fields for EventReservation:
 *
 * status
 * stripe_refund_id
 * refund_status
 * refund_reason
 * refund_failure_reason
 * refunded_at
 * refunded_by
 *
 * @param {object} reservation
 * @param {object} refund
 * @param {string|null} reason
 * @param {number|string|null} adminUserId
 */
const markReservationRefunded = async ({
  reservation,
  refund,
  reason,
  adminUserId,
}) => {
  const attributes =
    EventReservation.rawAttributes ||
    EventReservation.getAttributes?.() ||
    {};

  const possibleValues = {
    status: 'refunded',

    stripe_refund_id: refund.id,
    stripeRefundId: refund.id,

    refund_status: refund.status || 'succeeded',
    refundStatus: refund.status || 'succeeded',

    refund_reason: reason || null,
    refundReason: reason || null,

    refund_failure_reason: null,
    refundFailureReason: null,

    refunded_at: new Date(),
    refundedAt: new Date(),

    refunded_by: adminUserId || null,
    refundedBy: adminUserId || null,
  };

  const updateValues = {};

  for (const [fieldName, value] of Object.entries(possibleValues)) {
    if (Object.prototype.hasOwnProperty.call(attributes, fieldName)) {
      updateValues[fieldName] = value;
    }
  }

  /*
   * At minimum, update status if it exists.
   */
  if (
    Object.prototype.hasOwnProperty.call(attributes, 'status') &&
    updateValues.status === undefined
  ) {
    updateValues.status = 'refunded';
  }

  if (Object.keys(updateValues).length > 0) {
    await reservation.update(updateValues);
  }
};

/**
 * Save a refund failure on a reservation when supported by the model.
 *
 * The reservation remains refundable so that an administrator can retry.
 *
 * @param {object} reservation
 * @param {Error} error
 */
const markReservationRefundFailed = async ({
  reservation,
  error,
}) => {
  const attributes =
    EventReservation.rawAttributes ||
    EventReservation.getAttributes?.() ||
    {};

  const failureMessage =
    error?.raw?.message ||
    error?.message ||
    'Unknown Stripe refund error';

  const possibleValues = {
    refund_status: 'failed',
    refundStatus: 'failed',

    refund_failure_reason: failureMessage,
    refundFailureReason: failureMessage,
  };

  const updateValues = {};

  for (const [fieldName, value] of Object.entries(possibleValues)) {
    if (Object.prototype.hasOwnProperty.call(attributes, fieldName)) {
      updateValues[fieldName] = value;
    }
  }

  if (Object.keys(updateValues).length > 0) {
    await reservation.update(updateValues);
  }
};

/**
 * Retrieve an event and its refundable reservation records.
 *
 * @param {number|string} eventId
 * @returns {Promise<{
 *   event: object|null,
 *   reservations: object[]
 * }>}
 */
const getEventAndReservations = async (eventId) => {
  const event = await Event.findByPk(eventId);

  if (!event) {
    return {
      event: null,
      reservations: [],
    };
  }

  /*
   * Use the field that exists in the EventReservation model.
   */
  const attributes =
    EventReservation.rawAttributes ||
    EventReservation.getAttributes?.() ||
    {};

  const eventIdField = Object.prototype.hasOwnProperty.call(
    attributes,
    'event_id'
  )
    ? 'event_id'
    : 'eventId';

  const reservations = await EventReservation.findAll({
    where: {
      [eventIdField]: eventId,
    },
    order: [['createdAt', 'ASC']],
  });

  return {
    event,
    reservations,
  };
};

/**
 * Group reservations by Stripe PaymentIntent.
 *
 * There should normally be one reservation row per Checkout Session.
 * Grouping protects against accidentally refunding the same PaymentIntent
 * more than once if duplicate reservation rows exist.
 *
 * @param {object[]} reservations
 * @returns {Map<string, object[]>}
 */
const groupReservationsByPaymentIntent = (reservations) => {
  const groupedReservations = new Map();

  for (const reservation of reservations) {
    const paymentIntentId = getField(reservation, [
      'stripe_payment_intent_id',
      'stripePaymentIntentId',
    ]);

    if (!paymentIntentId) {
      continue;
    }

    if (!groupedReservations.has(paymentIntentId)) {
      groupedReservations.set(paymentIntentId, []);
    }

    groupedReservations.get(paymentIntentId).push(reservation);
  }

  return groupedReservations;
};

/**
 * GET /admin/events/:eventId/refund-preview
 *
 * Return a preview of the refund operation without creating refunds.
 *
 * This should be called before showing the final confirmation button
 * in the admin frontend.
 */
const getEventRefundPreview = async (req, res) => {
  const { eventId } = req.params;

  try {
    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: 'An event ID is required.',
      });
    }

    const {
      event,
      reservations,
    } = await getEventAndReservations(eventId);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found.',
      });
    }

    const refundableReservations = reservations.filter(
      (reservation) => {
        const status = String(
          getField(reservation, ['status']) || ''
        ).toLowerCase();

        return (
          REFUNDABLE_RESERVATION_STATUSES.includes(status) &&
          !reservationIsAlreadyRefunded(reservation)
        );
      }
    );

    const alreadyRefundedReservations = reservations.filter(
      reservationIsAlreadyRefunded
    );

    const missingPaymentIntentReservations =
      refundableReservations.filter((reservation) => {
        return !getField(reservation, [
          'stripe_payment_intent_id',
          'stripePaymentIntentId',
        ]);
      });

    const groupedPayments = groupReservationsByPaymentIntent(
      refundableReservations
    );

    const totalTickets = refundableReservations.reduce(
      (total, reservation) => {
        const quantity = Number(
          getField(reservation, ['quantity']) || 1
        );

        return total + (Number.isFinite(quantity) ? quantity : 1);
      },
      0
    );

    return res.status(200).json({
      success: true,
      message: 'Event refund preview generated.',
      event: {
        id: getField(event, ['id']),
        name: getField(event, ['name', 'title']),
        startDate: getField(event, ['startDate', 'start_date']),
        endDate: getField(event, ['endDate', 'end_date']),
      },
      summary: {
        totalReservations: reservations.length,
        refundableReservations: refundableReservations.length,
        uniquePaymentsToRefund: groupedPayments.size,
        totalTickets,
        alreadyRefundedReservations:
          alreadyRefundedReservations.length,
        missingPaymentIntentReservations:
          missingPaymentIntentReservations.length,
      },
      reservations: refundableReservations.map((reservation) => ({
        id: getField(reservation, ['id']),
        purchaserEmail: getField(reservation, [
          'purchaser_email',
          'purchaserEmail',
        ]),
        quantity: Number(
          getField(reservation, ['quantity']) || 1
        ),
        status: getField(reservation, ['status']),
        stripePaymentIntentId: getField(reservation, [
          'stripe_payment_intent_id',
          'stripePaymentIntentId',
        ]),
        stripeSessionId: getField(reservation, [
          'stripe_session_id',
          'stripeSessionId',
        ]),
      })),
    });
  } catch (error) {
    console.error('Error generating event refund preview:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to generate the event refund preview.',
      error:
        process.env.NODE_ENV === 'development'
          ? error.message
          : undefined,
    });
  }
};

/**
 * POST /admin/events/:eventId/refund-all
 *
 * Refund every successfully paid reservation for an event.
 *
 * Expected body:
 *
 * {
 *   "confirmRefund": true,
 *   "reason": "Event cancelled due to severe weather"
 * }
 *
 * Important:
 * This route must be protected by your admin authentication middleware.
 */
const refundAllEventReservations = async (req, res) => {
  const { eventId } = req.params;

  const {
    confirmRefund,
    reason,
  } = req.body || {};

  try {
    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: 'An event ID is required.',
      });
    }

    /*
     * Require an explicit boolean confirmation.
     *
     * Do not accept strings such as "true" because this is a destructive
     * financial action.
     */
    if (confirmRefund !== true) {
      return res.status(400).json({
        success: false,
        message:
          'You must explicitly confirm the bulk refund by sending confirmRefund: true.',
      });
    }

    const normalizedReason =
      typeof reason === 'string' && reason.trim()
        ? reason.trim().slice(0, 500)
        : 'Event cancelled by administrator';

    const {
      event,
      reservations,
    } = await getEventAndReservations(eventId);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found.',
      });
    }

    if (reservations.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'This event does not have any reservations.',
      });
    }

    const refundableReservations = reservations.filter(
      (reservation) => {
        const status = String(
          getField(reservation, ['status']) || ''
        ).toLowerCase();

        return (
          REFUNDABLE_RESERVATION_STATUSES.includes(status) &&
          !reservationIsAlreadyRefunded(reservation)
        );
      }
    );

    if (refundableReservations.length === 0) {
      return res.status(409).json({
        success: false,
        message:
          'This event does not have any paid reservations that still require a refund.',
      });
    }

    const reservationsWithoutPaymentIntent =
      refundableReservations.filter((reservation) => {
        return !getField(reservation, [
          'stripe_payment_intent_id',
          'stripePaymentIntentId',
        ]);
      });

    const reservationsWithPaymentIntent =
      refundableReservations.filter((reservation) => {
        return Boolean(
          getField(reservation, [
            'stripe_payment_intent_id',
            'stripePaymentIntentId',
          ])
        );
      });

    const groupedPayments = groupReservationsByPaymentIntent(
      reservationsWithPaymentIntent
    );

    const eventName =
      getField(event, ['name', 'title']) || `Event ${eventId}`;

    const adminUserId =
      req.user?.id ||
      req.admin?.id ||
      null;

    const successfulRefunds = [];
    const failedRefunds = [];

    /*
     * Process refunds sequentially.
     *
     * Sequential processing is intentionally used here instead of
     * Promise.all() so a large event does not send a sudden burst of
     * refund requests to Stripe.
     */
    for (const [
      paymentIntentId,
      paymentReservations,
    ] of groupedPayments.entries()) {
      const primaryReservation = paymentReservations[0];

      const reservationId = getField(primaryReservation, ['id']);

      const purchaserEmail = getField(primaryReservation, [
        'purchaser_email',
        'purchaserEmail',
      ]);

      try {
        /*
         * Check Stripe before creating the refund.
         *
         * This protects against a situation where Stripe successfully
         * refunded the payment but the database update previously failed.
         */
        const paymentIntent = await stripe.paymentIntents.retrieve(
          paymentIntentId
        );

        const amountReceived = Number(
          paymentIntent.amount_received ||
          paymentIntent.amount ||
          0
        );

        const latestCharge =
          typeof paymentIntent.latest_charge === 'object'
            ? paymentIntent.latest_charge
            : null;

        /*
         * PaymentIntent.charges may not be expanded depending on the
         * Stripe API version, so retrieve refunds using the PaymentIntent.
         */
        const existingRefunds = await stripe.refunds.list({
          payment_intent: paymentIntentId,
          limit: 100,
        });

        const alreadyRefundedAmount = existingRefunds.data.reduce(
          (total, refund) => {
            if (
              refund.status === 'succeeded' ||
              refund.status === 'pending'
            ) {
              return total + Number(refund.amount || 0);
            }

            return total;
          },
          0
        );

        /*
         * If Stripe already shows the payment as fully refunded, repair
         * the local database instead of issuing another refund request.
         */
        if (
          amountReceived > 0 &&
          alreadyRefundedAmount >= amountReceived
        ) {
          const existingRefund =
            existingRefunds.data.find(
              (refund) =>
                refund.status === 'succeeded' ||
                refund.status === 'pending'
            ) || {
              id: null,
              status: 'succeeded',
              amount: alreadyRefundedAmount,
              currency: paymentIntent.currency,
            };

          for (const reservation of paymentReservations) {
            await markReservationRefunded({
              reservation,
              refund: existingRefund,
              reason: normalizedReason,
              adminUserId,
            });
          }

          successfulRefunds.push({
            reservationIds: paymentReservations.map(
              (reservation) => getField(reservation, ['id'])
            ),
            purchaserEmail,
            paymentIntentId,
            refundId: existingRefund.id,
            status: existingRefund.status,
            amount: alreadyRefundedAmount,
            currency: paymentIntent.currency,
            alreadyRefundedAtStripe: true,
          });

          continue;
        }

        /*
         * Do not attempt to refund an unpaid PaymentIntent.
         */
        if (
          paymentIntent.status !== 'succeeded' &&
          amountReceived <= 0
        ) {
          throw new Error(
            `PaymentIntent ${paymentIntentId} has not completed successfully.`
          );
        }

        /*
         * Do not provide an amount here.
         *
         * Omitting amount tells Stripe to refund the remaining refundable
         * amount for the PaymentIntent.
         */
        const refund = await stripe.refunds.create(
          {
            payment_intent: paymentIntentId,

            /*
             * Stripe only accepts certain standard values for its built-in
             * reason field. Administrative cancellation is stored in
             * metadata instead.
             */
            metadata: {
              eventId: String(eventId),
              eventName: String(eventName).slice(0, 500),
              reservationId: String(reservationId || ''),
              cancellationReason: normalizedReason,
              initiatedByAdminId: String(adminUserId || ''),
              source: 'admin_event_bulk_refund',
            },
          },
          {
            /*
             * This remains stable for this event and PaymentIntent.
             *
             * If the HTTP request is retried, Stripe returns the original
             * result instead of creating a second refund.
             */
            idempotencyKey:
              `event-${eventId}-payment-${paymentIntentId}-full-refund`,
          }
        );

        for (const reservation of paymentReservations) {
          await markReservationRefunded({
            reservation,
            refund,
            reason: normalizedReason,
            adminUserId,
          });
        }

        successfulRefunds.push({
          reservationIds: paymentReservations.map(
            (reservation) => getField(reservation, ['id'])
          ),
          purchaserEmail,
          paymentIntentId,
          refundId: refund.id,
          status: refund.status,
          amount: refund.amount,
          currency: refund.currency,
          alreadyRefundedAtStripe: false,
        });
      } catch (error) {
        console.error('Event reservation refund failed:', {
          eventId,
          reservationId,
          paymentIntentId,
          purchaserEmail,
          stripeErrorType: error?.type,
          stripeErrorCode: error?.code,
          message: error?.message,
        });

        for (const reservation of paymentReservations) {
          try {
            await markReservationRefundFailed({
              reservation,
              error,
            });
          } catch (databaseError) {
            console.error(
              'Unable to save reservation refund failure:',
              {
                reservationId: getField(reservation, ['id']),
                message: databaseError.message,
              }
            );
          }
        }

        failedRefunds.push({
          reservationIds: paymentReservations.map(
            (reservation) => getField(reservation, ['id'])
          ),
          purchaserEmail,
          paymentIntentId,
          errorType: error?.type || 'refund_error',
          errorCode: error?.code || null,
          message:
            error?.raw?.message ||
            error?.message ||
            'Unable to refund this payment.',
        });
      }
    }

    /*
     * Add reservations without PaymentIntent IDs to the failure report.
     */
    for (const reservation of reservationsWithoutPaymentIntent) {
      failedRefunds.push({
        reservationIds: [getField(reservation, ['id'])],
        purchaserEmail: getField(reservation, [
          'purchaser_email',
          'purchaserEmail',
        ]),
        paymentIntentId: null,
        errorType: 'missing_payment_intent',
        errorCode: null,
        message:
          'The reservation does not contain a Stripe PaymentIntent ID.',
      });
    }

    const allRefundsSucceeded = failedRefunds.length === 0;
    const someRefundsSucceeded = successfulRefunds.length > 0;

    /*
     * Do not delete the event here.
     *
     * The refund operation and event deletion should remain separate.
     * The frontend can offer a second "Delete Refunded Event" action after
     * every payment has been refunded successfully.
     */
    return res.status(
      allRefundsSucceeded
        ? 200
        : someRefundsSucceeded
          ? 207
          : 502
    ).json({
      success: allRefundsSucceeded,
      partiallySuccessful:
        someRefundsSucceeded && !allRefundsSucceeded,
      message: allRefundsSucceeded
        ? 'All event payments were refunded successfully.'
        : someRefundsSucceeded
          ? 'Some payments were refunded, but one or more refunds failed.'
          : 'No event payments could be refunded.',
      event: {
        id: getField(event, ['id']),
        name: eventName,
      },
      reason: normalizedReason,
      stripeMode: stripeModeIsTest ? 'test' : 'live',
      summary: {
        reservationRecordsReviewed: reservations.length,
        uniquePaymentsAttempted: groupedPayments.size,
        successfulPayments: successfulRefunds.length,
        failedPayments: failedRefunds.length,
        skippedAlreadyRefunded: reservations.filter(
          reservationIsAlreadyRefunded
        ).length,
      },
      successfulRefunds,
      failedRefunds,
    });
  } catch (error) {
    console.error('Error refunding all event reservations:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to process the event refunds.',
      error:
        process.env.NODE_ENV === 'development'
          ? error.message
          : undefined,
    });
  }
};

module.exports = {
  getEventRefundPreview,
  refundAllEventReservations,
};

