// controllers/admin/eventRefundController.js
'use strict';

const Event = require('../../models/events');
const EventReservation = require(
  '../../models/eventReservation'
);

/*
 * Select the correct Stripe configuration based on
 * STRIPE_MODE.
 *
 * Test:
 * STRIPE_MODE=test
 * STRIPE_TEST_SECRET_KEY=sk_test_...
 * BAKERS_BURNS_ACCOUNT_ID=acct_...
 *
 * Live:
 * STRIPE_MODE=live
 * STRIPE_SECRET_KEY=sk_live_...
 * BAKERS_BURNS_LIVE_ACCOUNT_ID=acct_...
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

const stripeModeIsTest =
  stripeMode === 'test';

const stripeSecretKey =
  stripeModeIsTest
    ? process.env.STRIPE_TEST_SECRET_KEY
    : process.env.STRIPE_SECRET_KEY;

const stripeConnectedAccountId =
  stripeModeIsTest
    ? process.env.BAKERS_BURNS_TEST_ACCOUNT_ID
    : process.env.BAKERS_BURNS_LIVE_ACCOUNT_ID;

if (!stripeSecretKey) {
  throw new Error(
    stripeModeIsTest
      ? 'Missing STRIPE_TEST_SECRET_KEY environment variable.'
      : 'Missing STRIPE_SECRET_KEY environment variable.'
  );
}

if (
  !stripeConnectedAccountId ||
  !String(
    stripeConnectedAccountId
  ).startsWith('acct_')
) {
  throw new Error(
    stripeModeIsTest
      ? 'Missing or invalid BAKERS_BURNS_TEST_ACCOUNT_ID environment variable.'
      : 'Missing or invalid BAKERS_BURNS_LIVE_ACCOUNT_ID environment variable.'
  );
}

const stripe = require('stripe')(
  stripeSecretKey
);

console.log(
  'Admin event refund controller configuration loaded:',
  {
    stripeMode,

    connectedAccountId:
      stripeConnectedAccountId,

    secretKeyConfigured:
      Boolean(stripeSecretKey),
  }
);

/*
 * Reservation statuses that may still require a refund.
 */
const REFUNDABLE_RESERVATION_STATUSES = new Set([
  'paid',
  'completed',
  'confirmed',
]);

/*
 * Reservation statuses that should not have another
 * refund created.
 */
const NON_REFUNDABLE_RESERVATION_STATUSES =
  new Set([
    'refunded',
    'refund_pending',
    'partially_refunded',
  ]);

/*
 * Metadata value used by the event Stripe webhook to
 * identify refunds created by this controller.
 */
const EVENT_REFUND_SOURCE =
  'admin_event_bulk_refund';

/**
 * Convert a Sequelize instance into a plain object.
 *
 * @param {object|null} record
 * @returns {object|null}
 */
const toPlainObject = (record) => {
  if (!record) {
    return null;
  }

  if (
    typeof record.get === 'function'
  ) {
    return record.get({
      plain: true,
    });
  }

  return record;
};

/**
 * Read the first available field from a Sequelize
 * instance or plain object.
 *
 * This supports both snake_case and camelCase names.
 *
 * @param {object|null} record
 * @param {string[]} fieldNames
 * @returns {*}
 */
const getField = (
  record,
  fieldNames
) => {
  const plainRecord =
    toPlainObject(record);

  for (
    const fieldName
    of fieldNames
  ) {
    if (
      plainRecord &&
      plainRecord[fieldName] !==
        undefined &&
      plainRecord[fieldName] !==
        null
    ) {
      return plainRecord[fieldName];
    }
  }

  return null;
};

/**
 * Return the EventReservation model attributes.
 *
 * @returns {object}
 */
const getReservationAttributes = () => {
  return (
    EventReservation.rawAttributes ||
    EventReservation.getAttributes?.() ||
    {}
  );
};

/**
 * Build an update object containing only fields that
 * actually exist on the EventReservation model.
 *
 * @param {object} values
 * @returns {object}
 */
const buildReservationUpdate = (
  values
) => {
  const attributes =
    getReservationAttributes();

  return Object.entries(values).reduce(
    (
      updateValues,
      [fieldName, value]
    ) => {
      if (
        Object.prototype.hasOwnProperty.call(
          attributes,
          fieldName
        )
      ) {
        updateValues[fieldName] =
          value;
      }

      return updateValues;
    },
    {}
  );
};

/**
 * Update a reservation using only declared model fields.
 *
 * @param {object} reservation
 * @param {object} values
 * @returns {Promise<boolean>}
 */
const updateReservationSafely =
  async (
    reservation,
    values,
    options = {}
  ) => {
    if (
      !reservation ||
      typeof reservation.update !==
        'function'
    ) {
      return false;
    }

    const updateValues =
      buildReservationUpdate(values);

    if (
      Object.keys(
        updateValues
      ).length === 0
    ) {
      return false;
    }

    await reservation.update(
      updateValues,
      options
    );

    return true;
  };

/**
 * Determine whether a reservation should be excluded
 * from a new refund attempt.
 *
 * A pending refund should not be created again even
 * though it has not completed yet.
 *
 * @param {object} reservation
 * @returns {boolean}
 */
const reservationIsAlreadyRefunded = (
  reservation
) => {
  const status = String(
    getField(
      reservation,
      ['status']
    ) || ''
  )
    .trim()
    .toLowerCase();

  const stripeRefundId =
    getField(
      reservation,
      [
        'stripe_refund_id',
        'stripeRefundId',
      ]
    );

  const refundedAt =
    getField(
      reservation,
      [
        'refunded_at',
        'refundedAt',
      ]
    );

  return (
    NON_REFUNDABLE_RESERVATION_STATUSES
      .has(status) ||
    Boolean(stripeRefundId) ||
    Boolean(refundedAt)
  );
};

/**
 * Determine whether a reservation is eligible for
 * a new refund attempt.
 *
 * @param {object} reservation
 * @returns {boolean}
 */
const reservationIsRefundable = (
  reservation
) => {
  const status = String(
    getField(
      reservation,
      ['status']
    ) || ''
  )
    .trim()
    .toLowerCase();

  return (
    REFUNDABLE_RESERVATION_STATUSES
      .has(status) &&
    !reservationIsAlreadyRefunded(
      reservation
    )
  );
};

/**
 * Record that Stripe accepted a refund request.
 *
 * IMPORTANT:
 * This controller initiates refunds, but it does not finalize
 * reservation status, release sold inventory, or delete events.
 *
 * The signed admin refund webhook is the source of truth for
 * those actions. This prevents the HTTP request and Stripe
 * webhook from racing and decrementing inventory twice.
 *
 * This function is monotonic: it will never downgrade a
 * reservation that the webhook has already marked refunded.
 *
 * @param {object} options
 * @param {object} options.reservation
 * @param {object} options.refund
 * @param {string|null} options.reason
 * @param {number|string|null} options.adminUserId
 * @returns {Promise<boolean>}
 */
const markReservationRefundAccepted =
  async ({
    reservation,
    refund,
    reason,
    adminUserId,
  }) => {
    if (
      !reservation ||
      typeof reservation.reload !==
        'function'
    ) {
      return false;
    }

    /*
     * The webhook can arrive before Stripe's API response is
     * returned to this controller. Reload first so we do not
     * overwrite a completed webhook transition with
     * refund_pending.
     */
    await reservation.reload();

    const currentStatus =
      String(
        getField(
          reservation,
          ['status']
        ) || ''
      )
        .trim()
        .toLowerCase();

    if (
      currentStatus === 'refunded'
    ) {
      return true;
    }

    const stripeRefundStatus =
      String(
        refund?.status || 'pending'
      )
        .trim()
        .toLowerCase();

    const requestedAt =
      new Date();

    return updateReservationSafely(
      reservation,
      {
        status:
          'refund_pending',

        stripe_refund_id:
          refund?.id || null,

        stripeRefundId:
          refund?.id || null,

        refund_status:
          stripeRefundStatus,

        refundStatus:
          stripeRefundStatus,

        refund_reason:
          reason || null,

        refundReason:
          reason || null,

        refund_failure_reason:
          null,

        refundFailureReason:
          null,

        refund_requested_at:
          requestedAt,

        refundRequestedAt:
          requestedAt,

        refunded_by:
          adminUserId || null,

        refundedBy:
          adminUserId || null,
      }
    );
  };

/**
 * Save information about a failed refund attempt.
 *
 * A failed Stripe API request remains retryable. Do not set
 * refunded_at and do not mark the reservation refunded.
 *
 * @param {object} options
 * @param {object} options.reservation
 * @param {Error} options.error
 * @returns {Promise<boolean>}
 */
const markReservationRefundFailed =
  async ({
    reservation,
    error,
  }) => {
    if (
      reservation &&
      typeof reservation.reload ===
        'function'
    ) {
      await reservation.reload();
    }

    const currentStatus =
      String(
        getField(
          reservation,
          ['status']
        ) || ''
      )
        .trim()
        .toLowerCase();

    /*
     * Never overwrite a successful webhook result.
     */
    if (
      currentStatus === 'refunded'
    ) {
      return true;
    }

    const failureMessage =
      error?.raw?.message ||
      error?.message ||
      'Unknown Stripe refund error';

    return updateReservationSafely(
      reservation,
      {
        /*
         * Restore a retryable paid state if this controller had
         * previously placed the reservation into refund_pending.
         */
        status:
          currentStatus ===
          'refund_pending'
            ? 'paid'
            : currentStatus ||
              'paid',

        refund_status:
          'failed',

        refundStatus:
          'failed',

        refund_failure_reason:
          failureMessage,

        refundFailureReason:
          failureMessage,
      }
    );
  };

/**
 * Record that Stripe accepted a refund for all reservation rows
 * associated with one PaymentIntent.
 *
 * Even when Stripe immediately returns status "succeeded", this
 * controller records refund_pending locally. The signed webhook
 * performs the authoritative transition to refunded, releases
 * EventOccurrence.soldCount, and deletes the event when every
 * refund has completed.
 *
 * @param {object} options
 * @param {object[]} options.reservations
 * @param {object} options.refund
 * @param {string|null} options.reason
 * @param {number|string|null} options.adminUserId
 * @returns {Promise<void>}
 */
const updateReservationsForRefund =
  async ({
    reservations,
    refund,
    reason,
    adminUserId,
  }) => {
    for (
      const reservation
      of reservations
    ) {
      await markReservationRefundAccepted({
        reservation,
        refund,
        reason,
        adminUserId,
      });
    }
  };

/**
 * Retrieve one event and all associated reservations.
 *
 * @param {number|string} eventId
 * @returns {Promise<{
 *   event: object|null,
 *   reservations: object[]
 * }>}
 */
const getEventAndReservations =
  async (
    eventId
  ) => {
    const event =
      await Event.findByPk(
        eventId
      );

    if (!event) {
      return {
        event: null,
        reservations: [],
      };
    }

    const attributes =
      getReservationAttributes();

    const eventIdField =
      Object.prototype
        .hasOwnProperty.call(
          attributes,
          'event_id'
        )
        ? 'event_id'
        : 'eventId';

    const reservations =
      await EventReservation.findAll({
        where: {
          [eventIdField]:
            eventId,
        },

        order: [
          ['createdAt', 'ASC'],
        ],
      });

    return {
      event,
      reservations,
    };
  };

/**
 * Group reservations by Stripe PaymentIntent.
 *
 * This prevents duplicate database rows from causing
 * duplicate Stripe refunds.
 *
 * @param {object[]} reservations
 * @returns {Map<string, object[]>}
 */
const groupReservationsByPaymentIntent =
  (
    reservations
  ) => {
    const groupedReservations =
      new Map();

    for (
      const reservation
      of reservations
    ) {
      const paymentIntentId =
        getField(
          reservation,
          [
            'stripe_payment_intent_id',
            'stripePaymentIntentId',
          ]
        );

      if (!paymentIntentId) {
        continue;
      }

      const normalizedId =
        String(
          paymentIntentId
        ).trim();

      if (!normalizedId) {
        continue;
      }

      if (
        !groupedReservations.has(
          normalizedId
        )
      ) {
        groupedReservations.set(
          normalizedId,
          []
        );
      }

      groupedReservations
        .get(normalizedId)
        .push(reservation);
    }

    return groupedReservations;
  };

/**
 * Return the total amount represented by succeeded
 * and pending Stripe refunds.
 *
 * Pending refunds count toward this amount so the
 * application does not create a duplicate refund.
 *
 * @param {object[]} refunds
 * @returns {number}
 */
const calculateReservedRefundAmount =
  (
    refunds
  ) => {
    return refunds.reduce(
      (
        total,
        refund
      ) => {
        const status =
          String(
            refund?.status || ''
          ).toLowerCase();

        if (
          status !== 'succeeded' &&
          status !== 'pending'
        ) {
          return total;
        }

        return (
          total +
          Number(
            refund?.amount || 0
          )
        );
      },
      0
    );
  };

/**
 * Select the most useful existing refund.
 *
 * A succeeded refund is preferred over a pending one.
 *
 * @param {object[]} refunds
 * @returns {object|null}
 */
const selectExistingRefund = (
  refunds
) => {
  return (
    refunds.find(
      (refund) =>
        refund?.status ===
        'succeeded'
    ) ||
    refunds.find(
      (refund) =>
        refund?.status ===
        'pending'
    ) ||
    null
  );
};

/**
 * Build Stripe request options for the connected account.
 *
 * @param {string|null} idempotencyKey
 * @returns {object}
 */
const getStripeRequestOptions = (
  idempotencyKey = null
) => {
  const options = {
    stripeAccount:
      stripeConnectedAccountId,
  };

  if (idempotencyKey) {
    options.idempotencyKey =
      idempotencyKey;
  }

  return options;
};

/**
 * GET /admin/events/:eventId/refund-preview
 *
 * Return a preview of the refund operation without
 * creating any Stripe refunds.
 */
const getEventRefundPreview =
  async (
    req,
    res
  ) => {
    const { eventId } =
      req.params;

    try {
      if (!eventId) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              'An event ID is required.',
          });
      }

      const {
        event,
        reservations,
      } =
        await getEventAndReservations(
          eventId
        );

      if (!event) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              'Event not found.',
          });
      }

      const refundableReservations =
        reservations.filter(
          reservationIsRefundable
        );

      const alreadyRefundedReservations =
        reservations.filter(
          reservationIsAlreadyRefunded
        );

      const missingPaymentIntentReservations =
        refundableReservations.filter(
          (reservation) => {
            return !getField(
              reservation,
              [
                'stripe_payment_intent_id',
                'stripePaymentIntentId',
              ]
            );
          }
        );

      const reservationsWithPaymentIntent =
        refundableReservations.filter(
          (reservation) => {
            return Boolean(
              getField(
                reservation,
                [
                  'stripe_payment_intent_id',
                  'stripePaymentIntentId',
                ]
              )
            );
          }
        );

      const groupedPayments =
        groupReservationsByPaymentIntent(
          reservationsWithPaymentIntent
        );

      const totalTickets =
        refundableReservations.reduce(
          (
            total,
            reservation
          ) => {
            const quantity =
              Number(
                getField(
                  reservation,
                  ['quantity']
                ) || 1
              );

            return (
              total +
              (
                Number.isFinite(
                  quantity
                )
                  ? quantity
                  : 1
              )
            );
          },
          0
        );

      return res
        .status(200)
        .json({
          success: true,

          message:
            'Event refund preview generated.',

          event: {
            id:
              getField(
                event,
                ['id']
              ),

            name:
              getField(
                event,
                ['name', 'title']
              ),

            startDate:
              getField(
                event,
                [
                  'startDate',
                  'start_date',
                ]
              ),

            endDate:
              getField(
                event,
                [
                  'endDate',
                  'end_date',
                ]
              ),
          },

          summary: {
            totalReservations:
              reservations.length,

            refundableReservations:
              refundableReservations.length,

            uniquePaymentsToRefund:
              groupedPayments.size,

            totalTickets,

            alreadyRefundedReservations:
              alreadyRefundedReservations
                .length,

            missingPaymentIntentReservations:
              missingPaymentIntentReservations
                .length,
          },

          reservations:
            refundableReservations.map(
              (reservation) => ({
                id:
                  getField(
                    reservation,
                    ['id']
                  ),

                purchaserEmail:
                  getField(
                    reservation,
                    [
                      'purchaser_email',
                      'purchaserEmail',
                    ]
                  ),

                quantity:
                  Number(
                    getField(
                      reservation,
                      ['quantity']
                    ) || 1
                  ),

                status:
                  getField(
                    reservation,
                    ['status']
                  ),

                stripePaymentIntentId:
                  getField(
                    reservation,
                    [
                      'stripe_payment_intent_id',
                      'stripePaymentIntentId',
                    ]
                  ),

                stripeSessionId:
                  getField(
                    reservation,
                    [
                      'stripe_session_id',
                      'stripeSessionId',
                    ]
                  ),
              })
            ),
        });
    } catch (error) {
      console.error(
        'Error generating event refund preview:',
        {
          eventId,

          message:
            error?.message,

          stack:
            error?.stack,
        }
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            'Unable to generate the event refund preview.',

          error:
            process.env.NODE_ENV ===
            'development'
              ? error.message
              : undefined,
        });
    }
  };

/**
 * POST /admin/events/:eventId/refund-all
 *
 * Refund every successfully paid reservation for
 * an event.
 *
 * Expected body:
 *
 * {
 *   "confirmRefund": true,
 *   "reason": "Event cancelled due to severe weather"
 * }
 *
 * This route must be protected by admin
 * authentication middleware.
 */
const refundAllEventReservations =
  async (
    req,
    res
  ) => {
    const { eventId } =
      req.params;

    const {
      confirmRefund,
      reason,
    } = req.body || {};

    try {
      if (!eventId) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              'An event ID is required.',
          });
      }

      /*
       * Require an actual boolean because this action
       * creates real financial refunds.
       */
      if (
        confirmRefund !== true
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              'You must explicitly confirm the bulk refund by sending confirmRefund: true.',
          });
      }

      const normalizedReason =
        typeof reason === 'string' &&
        reason.trim()
          ? reason
              .trim()
              .slice(0, 500)
          : 'Event cancelled by administrator';

      const {
        event,
        reservations,
      } =
        await getEventAndReservations(
          eventId
        );

      if (!event) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              'Event not found.',
          });
      }

      if (
        reservations.length === 0
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              'This event does not have any reservations.',
          });
      }

      const refundableReservations =
        reservations.filter(
          reservationIsRefundable
        );

      if (
        refundableReservations.length ===
        0
      ) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              'This event does not have any paid reservations that still require a refund.',
          });
      }

      const reservationsWithoutPaymentIntent =
        refundableReservations.filter(
          (reservation) => {
            return !getField(
              reservation,
              [
                'stripe_payment_intent_id',
                'stripePaymentIntentId',
              ]
            );
          }
        );

      const reservationsWithPaymentIntent =
        refundableReservations.filter(
          (reservation) => {
            return Boolean(
              getField(
                reservation,
                [
                  'stripe_payment_intent_id',
                  'stripePaymentIntentId',
                ]
              )
            );
          }
        );

      const groupedPayments =
        groupReservationsByPaymentIntent(
          reservationsWithPaymentIntent
        );

      const eventName =
        getField(
          event,
          ['name', 'title']
        ) ||
        `Event ${eventId}`;

      const adminUserId =
        req.user?.id ||
        req.admin?.id ||
        null;

      const successfulRefunds =
        [];

      const pendingRefunds =
        [];

      const failedRefunds =
        [];

      /*
       * Process each unique PaymentIntent
       * sequentially.
       */
      for (
        const [
          paymentIntentId,
          paymentReservations,
        ]
        of groupedPayments.entries()
      ) {
        const primaryReservation =
          paymentReservations[0];

        const reservationId =
          getField(
            primaryReservation,
            ['id']
          );

        const purchaserEmail =
          getField(
            primaryReservation,
            [
              'purchaser_email',
              'purchaserEmail',
            ]
          );

        try {
          const stripeRequestOptions =
            getStripeRequestOptions();

          /*
           * Retrieve the PaymentIntent using the
           * connected-account context.
           */
          const paymentIntent =
            await stripe.paymentIntents
              .retrieve(
                paymentIntentId,
                stripeRequestOptions
              );

          const amountReceived =
            Number(
              paymentIntent
                .amount_received ||
              paymentIntent.amount ||
              0
            );

          /*
           * Retrieve existing refunds from the same
           * connected account.
           */
          const existingRefundsResponse =
            await stripe.refunds.list(
              {
                payment_intent:
                  paymentIntentId,

                limit: 100,
              },
              stripeRequestOptions
            );

          const existingRefunds =
            Array.isArray(
              existingRefundsResponse
                ?.data
            )
              ? existingRefundsResponse.data
              : [];

          const alreadyRefundedAmount =
            calculateReservedRefundAmount(
              existingRefunds
            );

          /*
           * When the full amount is already covered by
           * pending or succeeded refunds, repair the
           * local records instead of creating another.
           */
          if (
            amountReceived > 0 &&
            alreadyRefundedAmount >=
              amountReceived
          ) {
            const existingRefund =
              selectExistingRefund(
                existingRefunds
              ) || {
                id: null,
                status: 'succeeded',
                amount:
                  alreadyRefundedAmount,
                currency:
                  paymentIntent.currency,
              };

            await updateReservationsForRefund({
              reservations:
                paymentReservations,

              refund:
                existingRefund,

              reason:
                normalizedReason,

              adminUserId,
            });

            const result = {
              reservationIds:
                paymentReservations.map(
                  (reservation) =>
                    getField(
                      reservation,
                      ['id']
                    )
                ),

              purchaserEmail,
              paymentIntentId,

              refundId:
                existingRefund.id ||
                null,

              status:
                existingRefund.status,

              amount:
                alreadyRefundedAmount,

              currency:
                existingRefund.currency ||
                paymentIntent.currency,

              alreadyRefundedAtStripe:
                true,
            };

            if (
              existingRefund.status ===
              'succeeded'
            ) {
              successfulRefunds.push(
                result
              );
            } else {
              pendingRefunds.push(
                result
              );
            }

            continue;
          }

          /*
           * Do not attempt to refund an unpaid
           * PaymentIntent.
           */
          if (
            paymentIntent.status !==
              'succeeded' &&
            amountReceived <= 0
          ) {
            throw new Error(
              `PaymentIntent ${paymentIntentId} has not completed successfully.`
            );
          }

          /*
           * Omitting amount causes Stripe to refund
           * the remaining refundable amount.
           */
          const refund =
            await stripe.refunds.create(
              {
                payment_intent:
                  paymentIntentId,

                metadata: {
                  eventId:
                    String(eventId),

                  eventName:
                    String(
                      eventName
                    ).slice(
                      0,
                      500
                    ),

                  reservationId:
                    String(
                      reservationId ||
                      ''
                    ),

                  cancellationReason:
                    normalizedReason,

                  initiatedByAdminId:
                    String(
                      adminUserId ||
                      ''
                    ),

                  source:
                    EVENT_REFUND_SOURCE,
                },
              },
              getStripeRequestOptions(
                `event-${eventId}-payment-${paymentIntentId}-full-refund`
              )
            );

          /*
           * Record that Stripe accepted the request.
           *
           * The signed admin refund webhook performs final
           * reservation updates, inventory release, email
           * notification, and event deletion.
           */
          await updateReservationsForRefund({
            reservations:
              paymentReservations,

            refund,

            reason:
              normalizedReason,

            adminUserId,
          });

          const result = {
            reservationIds:
              paymentReservations.map(
                (reservation) =>
                  getField(
                    reservation,
                    ['id']
                  )
              ),

            purchaserEmail,
            paymentIntentId,

            refundId:
              refund.id,

            status:
              refund.status,

            amount:
              refund.amount,

            currency:
              refund.currency,

            alreadyRefundedAtStripe:
              false,
          };

          if (
            refund.status ===
            'succeeded'
          ) {
            successfulRefunds.push(
              result
            );
          } else {
            pendingRefunds.push(
              result
            );
          }
        } catch (error) {
          console.error(
            'Event reservation refund failed:',
            {
              eventId,
              reservationId,
              paymentIntentId,
              purchaserEmail,

              connectedAccountId:
                stripeConnectedAccountId,

              stripeMode:
                stripeModeIsTest
                  ? 'test'
                  : 'live',

              stripeErrorType:
                error?.type ||
                null,

              stripeErrorCode:
                error?.code ||
                null,

              message:
                error?.raw?.message ||
                error?.message ||
                'Unknown Stripe refund error',
            }
          );

          for (
            const reservation
            of paymentReservations
          ) {
            try {
              await markReservationRefundFailed({
                reservation,
                error,
              });
            } catch (
              databaseError
            ) {
              console.error(
                'Unable to save reservation refund failure:',
                {
                  reservationId:
                    getField(
                      reservation,
                      ['id']
                    ),

                  message:
                    databaseError
                      .message,
                }
              );
            }
          }

          failedRefunds.push({
            reservationIds:
              paymentReservations.map(
                (reservation) =>
                  getField(
                    reservation,
                    ['id']
                  )
              ),

            purchaserEmail,
            paymentIntentId,

            errorType:
              error?.type ||
              'refund_error',

            errorCode:
              error?.code ||
              null,

            message:
              error?.raw?.message ||
              error?.message ||
              'Unable to refund this payment.',
          });
        }
      }

      /*
       * Include reservations that cannot be refunded
       * because they lack a PaymentIntent ID.
       */
      for (
        const reservation
        of reservationsWithoutPaymentIntent
      ) {
        failedRefunds.push({
          reservationIds: [
            getField(
              reservation,
              ['id']
            ),
          ],

          purchaserEmail:
            getField(
              reservation,
              [
                'purchaser_email',
                'purchaserEmail',
              ]
            ),

          paymentIntentId:
            null,

          errorType:
            'missing_payment_intent',

          errorCode:
            null,

          message:
            'The reservation does not contain a Stripe PaymentIntent ID.',
        });
      }

      const allRefundsAccepted =
        failedRefunds.length === 0;

      const allRefundsCompleted =
        allRefundsAccepted &&
        pendingRefunds.length === 0;

      const someRefundsAccepted =
        successfulRefunds.length > 0 ||
        pendingRefunds.length > 0;

      let responseStatus;
      let responseMessage;

      if (allRefundsCompleted) {
        responseStatus = 200;
        responseMessage =
          'All event payments were refunded successfully.';
      } else if (
        allRefundsAccepted
      ) {
        responseStatus = 202;
        responseMessage =
          'All event refunds were accepted, but one or more refunds are still pending.';
      } else if (
        someRefundsAccepted
      ) {
        responseStatus = 207;
        responseMessage =
          'Some event refunds were accepted, but one or more refunds failed.';
      } else {
        responseStatus = 502;
        responseMessage =
          'No event payments could be refunded.';
      }

      /*
       * Event deletion is asynchronous.
       *
       * After Stripe confirms each successful refund, the signed
       * admin refund webhook releases occurrence inventory and
       * deletes the event after the final refund completes.
       */
      return res
        .status(responseStatus)
        .json({
          success:
            allRefundsCompleted,

          accepted:
            allRefundsAccepted,

          pending:
            pendingRefunds.length > 0,

          awaitingWebhookFinalization:
            someRefundsAccepted,

          eventDeletionPending:
            someRefundsAccepted,

          partiallySuccessful:
            someRefundsAccepted &&
            failedRefunds.length > 0,

          message:
            responseMessage,

          event: {
            id:
              getField(
                event,
                ['id']
              ),

            name:
              eventName,
          },

          reason:
            normalizedReason,

          stripeMode:
            stripeModeIsTest
              ? 'test'
              : 'live',

          summary: {
            reservationRecordsReviewed:
              reservations.length,

            uniquePaymentsAttempted:
              groupedPayments.size,

            successfulPayments:
              successfulRefunds.length,

            pendingPayments:
              pendingRefunds.length,

            failedPayments:
              failedRefunds.length,

            skippedAlreadyRefunded:
              reservations.filter(
                reservationIsAlreadyRefunded
              ).length,

            missingPaymentIntents:
              reservationsWithoutPaymentIntent
                .length,
          },

          successfulRefunds,
          pendingRefunds,
          failedRefunds,
        });
    } catch (error) {
      console.error(
        'Error refunding all event reservations:',
        {
          eventId,

          connectedAccountId:
            stripeConnectedAccountId,

          stripeMode:
            stripeModeIsTest
              ? 'test'
              : 'live',

          message:
            error?.message,

          stack:
            error?.stack,
        }
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            'Unable to process the event refunds.',

          error:
            process.env.NODE_ENV ===
            'development'
              ? error.message
              : undefined,
        });
    }
  };

module.exports = {
  getEventRefundPreview,
  refundAllEventReservations,
};