
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
    ? process.env.STRIPE_TEST_EVENT_WEBHOOK_SECRET
    : process.env.STRIPE_EVENT_WEBHOOK_SECRET;

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

const stripe = require('stripe')(
  stripeSecretKey
);

const Event = require(
  '../../models/events'
);

const EventReservation = require(
  '../../models/eventReservation.js'
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

const {
  sendEventRefundNotificationEmail,
} = require(
  '../../utils/eventRefundNotificationEmail.js'
);

const EVENT_CHECKOUT_TYPE =
  'event_preorder';

const EVENT_REFUND_SOURCE =
  'admin_event_bulk_refund';

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

const REFUND_EVENT_TYPES =
  new Set([
    'refund.created',
    'refund.updated',
    'refund.failed',
  ]);

/**
 * Return the Sequelize attributes declared on a model.
 *
 * @param {object} model
 * @returns {object}
 */
const getModelAttributes = (model) => {
  return (
    model?.rawAttributes ||
    model?.getAttributes?.() ||
    {}
  );
};

/**
 * Determine which one of several possible field names
 * exists on a Sequelize model.
 *
 * @param {object} model
 * @param {string[]} candidateNames
 * @returns {string|null}
 */
const getExistingModelField = (
  model,
  candidateNames
) => {
  const attributes =
    getModelAttributes(model);

  return (
    candidateNames.find(
      (fieldName) =>
        Object.prototype.hasOwnProperty.call(
          attributes,
          fieldName
        )
    ) || null
  );
};

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
 * Read a value while supporting both camelCase and
 * snake_case Sequelize attributes.
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
      return plainRecord[
        fieldName
      ];
    }
  }

  return null;
};

/**
 * Build an update object containing only fields declared
 * on the EventReservation model.
 *
 * The object may include both camelCase and snake_case
 * candidates. Only the version that actually exists on
 * the model is retained.
 *
 * @param {object} values
 * @returns {object}
 */
const buildReservationUpdate = (
  values
) => {
  const attributes =
    getModelAttributes(
      EventReservation
    );

  return Object.entries(
    values
  ).reduce(
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
 * Safely update an EventReservation using only model
 * attributes that actually exist.
 *
 * @param {object} reservation
 * @param {object} values
 * @returns {Promise<boolean>}
 */
const updateReservationSafely =
  async (
    reservation,
    values
  ) => {
    if (
      !reservation ||
      typeof reservation.update !==
        'function'
    ) {
      return false;
    }

    const updateValues =
      buildReservationUpdate(
        values
      );

    if (
      Object.keys(
        updateValues
      ).length === 0
    ) {
      return false;
    }

    await reservation.update(
      updateValues
    );

    return true;
  };

/**
 * Determine whether this Checkout Session belongs to
 * the event checkout system.
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
 * Determine whether a Stripe Refund was created by the
 * event cancellation refund controller.
 *
 * @param {object} refund
 * @returns {boolean}
 */
const isEventCancellationRefund = (
  refund
) => {
  return (
    refund?.object ===
      'refund' &&
    refund?.metadata?.source ===
      EVENT_REFUND_SOURCE
  );
};

/**
 * Extract the purchaser email from a Checkout Session.
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
 * Extract a PaymentIntent ID from either an expanded
 * object or a string identifier.
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
    session?.payment_intent?.id ||
    null
  );
};

/**
 * Extract the PaymentIntent ID from a Stripe Refund.
 *
 * @param {object} refund
 * @returns {string|null}
 */
const getRefundPaymentIntentId = (
  refund
) => {
  if (
    typeof refund
      ?.payment_intent ===
    'string'
  ) {
    return refund.payment_intent;
  }

  return (
    refund?.payment_intent?.id ||
    null
  );
};

/**
 * Return the event ID stored in refund metadata.
 *
 * @param {object} refund
 * @returns {string|null}
 */
const getRefundEventId = (
  refund
) => {
  const eventId =
    refund?.metadata?.eventId;

  if (
    eventId === undefined ||
    eventId === null ||
    String(eventId).trim() === ''
  ) {
    return null;
  }

  return String(eventId).trim();
};

/**
 * Normalize an email address for grouping and duplicate
 * notification checks.
 *
 * @param {*} value
 * @returns {string|null}
 */
const normalizeEmail = (
  value
) => {
  if (
    typeof value !== 'string'
  ) {
    return null;
  }

  const normalizedEmail =
    value.trim().toLowerCase();

  return normalizedEmail ||
    null;
};

/**
 * Normalize a positive ticket quantity.
 *
 * @param {*} value
 * @returns {number}
 */
const normalizeQuantity = (
  value
) => {
  const parsedValue =
    Number(value);

  return (
    Number.isInteger(
      parsedValue
    ) &&
    parsedValue > 0
  )
    ? parsedValue
    : 1;
};

/**
 * Return the first available event date.
 *
 * @param {object|null} event
 * @param {object[]} reservations
 * @returns {*}
 */
const getEventDateForEmail = (
  event,
  reservations
) => {
  const reservation =
    reservations[0] ||
    null;

  return (
    getField(reservation, [
      'occurrenceDate',
      'occurrence_date',
      'eventDate',
      'event_date',
    ]) ||
    getField(event, [
      'startDate',
      'start_date',
      'date',
    ]) ||
    null
  );
};

/**
 * Return the event start time for the notification.
 *
 * @param {object|null} event
 * @returns {*}
 */
const getEventStartTimeForEmail = (
  event
) => {
  return getField(event, [
    'startTime',
    'start_time',
  ]);
};

/**
 * Return the event name from the database or Stripe
 * refund metadata.
 *
 * @param {object|null} event
 * @param {object} refund
 * @returns {string}
 */
const getEventNameForEmail = (
  event,
  refund
) => {
  return (
    getField(event, [
      'name',
      'title',
      'eventName',
      'event_name',
    ]) ||
    refund?.metadata?.eventName ||
    'Your event'
  );
};

/**
 * Determine whether a reservation was already sent a
 * notification for this refund.
 *
 * The timestamp is the primary guard. The refund ID is
 * also checked when that field exists.
 *
 * @param {object} reservation
 * @param {string} refundId
 * @returns {boolean}
 */
const reservationWasNotified = (
  reservation,
  refundId
) => {
  const notificationSentAt =
    getField(reservation, [
      'refundNotificationSentAt',
      'refund_notification_sent_at',
    ]);

  const notifiedRefundId =
    getField(reservation, [
      'refundNotificationRefundId',
      'refund_notification_refund_id',
    ]);

  if (!notificationSentAt) {
    return false;
  }

  /*
   * Older rows may have a notification timestamp but no
   * dedicated notification refund ID.
   */
  if (!notifiedRefundId) {
    return true;
  }

  return (
    String(notifiedRefundId) ===
    String(refundId)
  );
};

/**
 * Find all reservations associated with one event refund.
 *
 * @param {string} eventId
 * @param {string} paymentIntentId
 * @returns {Promise<object[]>}
 */
const findRefundReservations =
  async (
    eventId,
    paymentIntentId
  ) => {
    const eventIdField =
      getExistingModelField(
        EventReservation,
        [
          'event_id',
          'eventId',
        ]
      );

    const paymentIntentField =
      getExistingModelField(
        EventReservation,
        [
          'stripe_payment_intent_id',
          'stripePaymentIntentId',
        ]
      );

    if (!eventIdField) {
      throw new Error(
        'EventReservation does not define event_id or eventId.'
      );
    }

    if (!paymentIntentField) {
      throw new Error(
        'EventReservation does not define stripe_payment_intent_id or stripePaymentIntentId.'
      );
    }

    return EventReservation.findAll({
      where: {
        [eventIdField]:
          eventId,

        [paymentIntentField]:
          paymentIntentId,
      },

      order: [
        ['createdAt', 'ASC'],
      ],
    });
  };

/**
 * Mark reservations with the current Stripe refund
 * status.
 *
 * This does not overwrite a successfully refunded
 * reservation with a pending status.
 *
 * @param {object[]} reservations
 * @param {object} refund
 * @returns {Promise<void>}
 */
const updateReservationsForRefundStatus =
  async (
    reservations,
    refund
  ) => {
    const refundStatus =
      String(
        refund?.status || ''
      ).toLowerCase();

    let reservationStatus =
      null;

    if (
      refundStatus ===
      'succeeded'
    ) {
      reservationStatus =
        'refunded';
    } else if (
      refundStatus ===
        'pending' ||
      refundStatus ===
        'requires_action'
    ) {
      reservationStatus =
        'refund_pending';
    } else if (
      refundStatus ===
        'failed' ||
      refundStatus ===
        'canceled'
    ) {
      /*
       * Keep the reservation eligible for another refund
       * attempt instead of marking it fully refunded.
       */
      reservationStatus =
        null;
    }

    const failureReason =
      refund?.failure_reason ||
      refund?.failureReason ||
      null;

    for (
      const reservation
      of reservations
    ) {
      const updateValues = {
        stripe_refund_id:
          refund.id ||
          null,

        stripeRefundId:
          refund.id ||
          null,

        refund_status:
          refundStatus ||
          null,

        refundStatus:
          refundStatus ||
          null,

        refund_failure_reason:
          failureReason,

        refundFailureReason:
          failureReason,
      };

      if (reservationStatus) {
        updateValues.status =
          reservationStatus;
      }

      if (
        refundStatus ===
        'succeeded'
      ) {
        const existingRefundedAt =
          getField(reservation, [
            'refundedAt',
            'refunded_at',
          ]);

        updateValues.refunded_at =
          existingRefundedAt ||
          new Date();

        updateValues.refundedAt =
          existingRefundedAt ||
          new Date();
      }

      await updateReservationSafely(
        reservation,
        updateValues
      );
    }
  };

/**
 * Save a successful notification marker on every
 * reservation represented by the email.
 *
 * @param {object[]} reservations
 * @param {object} refund
 * @param {object} emailResult
 * @returns {Promise<void>}
 */
const markRefundNotificationSent =
  async ({
    reservations,
    refund,
    emailResult,
  }) => {
    const sentAt =
      new Date();

    for (
      const reservation
      of reservations
    ) {
      await updateReservationSafely(
        reservation,
        {
          refund_notification_sent_at:
            sentAt,

          refundNotificationSentAt:
            sentAt,

          refund_notification_email_id:
            emailResult?.emailId ||
            emailResult?.id ||
            null,

          refundNotificationEmailId:
            emailResult?.emailId ||
            emailResult?.id ||
            null,

          refund_notification_refund_id:
            refund.id,

          refundNotificationRefundId:
            refund.id,

          refund_notification_error:
            null,

          refundNotificationError:
            null,
        }
      );
    }
  };

/**
 * Save a refund notification failure without changing
 * the successful Stripe refund status.
 *
 * @param {object[]} reservations
 * @param {object} refund
 * @param {Error} error
 * @returns {Promise<void>}
 */
const markRefundNotificationFailed =
  async ({
    reservations,
    refund,
    error,
  }) => {
    const errorMessage =
      error?.message ||
      'Unable to send the refund notification email.';

    for (
      const reservation
      of reservations
    ) {
      try {
        await updateReservationSafely(
          reservation,
          {
            refund_notification_refund_id:
              refund.id,

            refundNotificationRefundId:
              refund.id,

            refund_notification_error:
              errorMessage,

            refundNotificationError:
              errorMessage,
          }
        );
      } catch (
        updateError
      ) {
        console.error(
          'Unable to record event refund notification failure:',
          {
            refundId:
              refund.id,

            reservationId:
              getField(
                reservation,
                ['id']
              ),

            notificationError:
              errorMessage,

            databaseError:
              updateError.message,
          }
        );
      }
    }
  };

/**
 * Complete inventory and reservation records for a
 * successfully paid event Checkout Session.
 *
 * @param {object} session
 * @returns {Promise<object>}
 */
const processCompletedEventCheckout =
  async (
    session
  ) => {
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
     * checkout.session.completed can arrive before an
     * asynchronous payment has succeeded.
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
     * This inventory service must remain idempotent
     * because Stripe may deliver the same webhook more
     * than once.
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
            completionResult
              ?.event
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
     * The reservation has already been committed. A
     * confirmation email failure must not undo the
     * successful ticket purchase.
     */
    let emailResults =
      null;

    let emailError =
      null;

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
      emailError =
        error;

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

/**
 * Release inventory reserved by an expired or failed
 * event Checkout Session.
 *
 * @param {object} session
 * @returns {Promise<object>}
 */
const processReleasedEventCheckout =
  async (
    session
  ) => {
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

/**
 * Handle a succeeded event cancellation refund and send
 * one email per unique purchaser.
 *
 * Multiple reservation rows sharing a PaymentIntent are
 * grouped by email so the purchaser receives only one
 * notification for the refund.
 *
 * @param {object} refund
 * @returns {Promise<object>}
 */
const processSucceededEventRefund =
  async (
    refund
  ) => {
    if (
      !isEventCancellationRefund(
        refund
      )
    ) {
      return {
        handled: false,
        reason:
          'not_event_cancellation_refund',
      };
    }

    if (
      refund.status !==
      'succeeded'
    ) {
      return {
        handled: false,
        reason:
          `refund_${refund.status || 'unknown'}`,
      };
    }

    const eventId =
      getRefundEventId(
        refund
      );

    const paymentIntentId =
      getRefundPaymentIntentId(
        refund
      );

    if (!eventId) {
      throw new Error(
        `Event refund ${refund.id} is missing eventId metadata.`
      );
    }

    if (!paymentIntentId) {
      throw new Error(
        `Event refund ${refund.id} is missing its PaymentIntent ID.`
      );
    }

    const reservations =
      await findRefundReservations(
        eventId,
        paymentIntentId
      );

    if (
      reservations.length ===
      0
    ) {
      throw new Error(
        `No EventReservation records were found for refund ${refund.id}, event ${eventId}, and PaymentIntent ${paymentIntentId}.`
      );
    }

    /*
     * Repair the local reservation refund status first.
     * This makes the webhook useful even when the refund
     * controller succeeded at Stripe but failed before
     * updating the database.
     */
    await updateReservationsForRefundStatus(
      reservations,
      refund
    );

    const event =
      await Event.findByPk(
        eventId
      );

    const eventName =
      getEventNameForEmail(
        event,
        refund
      );

    const eventDate =
      getEventDateForEmail(
        event,
        reservations
      );

    const eventStartTime =
      getEventStartTimeForEmail(
        event
      );

    /*
     * Group reservation rows by purchaser email.
     */
    const reservationsByEmail =
      new Map();

    for (
      const reservation
      of reservations
    ) {
      const purchaserEmail =
        normalizeEmail(
          getField(
            reservation,
            [
              'purchaserEmail',
              'purchaser_email',
              'email',
            ]
          )
        );

      if (!purchaserEmail) {
        console.warn(
          'Event refund reservation is missing a purchaser email:',
          {
            refundId:
              refund.id,

            eventId,

            paymentIntentId,

            reservationId:
              getField(
                reservation,
                ['id']
              ),
          }
        );

        continue;
      }

      if (
        !reservationsByEmail.has(
          purchaserEmail
        )
      ) {
        reservationsByEmail.set(
          purchaserEmail,
          []
        );
      }

      reservationsByEmail
        .get(purchaserEmail)
        .push(reservation);
    }

    if (
      reservationsByEmail.size ===
      0
    ) {
      throw new Error(
        `No purchaser email was available for event refund ${refund.id}.`
      );
    }

    const sentNotifications =
      [];

    const skippedNotifications =
      [];

    const failedNotifications =
      [];

    for (
      const [
        purchaserEmail,
        purchaserReservations,
      ]
      of reservationsByEmail
        .entries()
    ) {
      /*
       * Skip the email when every matching reservation
       * already records a notification for this refund.
       */
      const alreadyNotified =
        purchaserReservations.every(
          (reservation) =>
            reservationWasNotified(
              reservation,
              refund.id
            )
        );

      if (alreadyNotified) {
        skippedNotifications.push({
          purchaserEmail,
          reason:
            'already_notified',
        });

        console.log(
          'Event refund notification already sent:',
          {
            refundId:
              refund.id,

            eventId,

            paymentIntentId,

            purchaserEmail,
          }
        );

        continue;
      }

      const purchaserName =
        getField(
          purchaserReservations[0],
          [
            'purchaserName',
            'purchaser_name',
            'customerName',
            'customer_name',
          ]
        );

      const totalQuantity =
        purchaserReservations.reduce(
          (
            total,
            reservation
          ) => {
            return (
              total +
              normalizeQuantity(
                getField(
                  reservation,
                  ['quantity']
                )
              )
            );
          },
          0
        );

      try {
        const emailResult =
          await sendEventRefundNotificationEmail({
            to:
              purchaserEmail,

            customerName:
              purchaserName,

            eventName,

            eventDate,

            eventStartTime,

            refundAmount:
              refund.amount,

            currency:
              refund.currency,

            refundId:
              refund.id,

            quantity:
              totalQuantity,

            cancellationReason:
              refund.metadata
                ?.cancellationReason ||
              null,
          });

        await markRefundNotificationSent({
          reservations:
            purchaserReservations,

          refund,

          emailResult,
        });

        sentNotifications.push({
          purchaserEmail,

          emailId:
            emailResult?.emailId ||
            emailResult?.id ||
            null,

          reservationIds:
            purchaserReservations.map(
              (reservation) =>
                getField(
                  reservation,
                  ['id']
                )
            ),
        });

        console.log(
          'Event cancellation refund notification sent:',
          {
            refundId:
              refund.id,

            eventId,

            paymentIntentId,

            purchaserEmail,

            emailId:
              emailResult?.emailId ||
              emailResult?.id ||
              null,
          }
        );
      } catch (error) {
        await markRefundNotificationFailed({
          reservations:
            purchaserReservations,

          refund,

          error,
        });

        failedNotifications.push({
          purchaserEmail,

          reservationIds:
            purchaserReservations.map(
              (reservation) =>
                getField(
                  reservation,
                  ['id']
                )
            ),

          message:
            error.message,
        });

        console.error(
          'Event refund succeeded, but the cancellation notification failed:',
          {
            refundId:
              refund.id,

            eventId,

            paymentIntentId,

            purchaserEmail,

            message:
              error.message,

            stack:
              error.stack,
          }
        );
      }
    }

    /*
     * Throw when any email failed so Stripe retries the
     * webhook. Successfully sent recipients are protected
     * by refundNotificationSentAt and will be skipped on
     * the next delivery.
     */
    if (
      failedNotifications.length >
      0
    ) {
      const notificationError =
        new Error(
          `${failedNotifications.length} event refund notification email(s) failed.`
        );

      notificationError
        .failedNotifications =
        failedNotifications;

      throw notificationError;
    }

    return {
      handled: true,
      eventId,
      paymentIntentId,
      sentNotifications,
      skippedNotifications,
    };
  };

/**
 * Handle pending, failed, canceled, or action-required
 * event refund states.
 *
 * No customer completion email is sent from this path.
 *
 * @param {object} refund
 * @returns {Promise<object>}
 */
const processNonSucceededEventRefund =
  async (
    refund
  ) => {
    if (
      !isEventCancellationRefund(
        refund
      )
    ) {
      return {
        handled: false,
        reason:
          'not_event_cancellation_refund',
      };
    }

    const eventId =
      getRefundEventId(
        refund
      );

    const paymentIntentId =
      getRefundPaymentIntentId(
        refund
      );

    if (
      !eventId ||
      !paymentIntentId
    ) {
      console.warn(
        'Event refund status could not be linked to reservations:',
        {
          refundId:
            refund?.id ||
            null,

          status:
            refund?.status ||
            null,

          eventId,

          paymentIntentId,
        }
      );

      return {
        handled: false,
        reason:
          'missing_refund_identifiers',
      };
    }

    const reservations =
      await findRefundReservations(
        eventId,
        paymentIntentId
      );

    if (
      reservations.length ===
      0
    ) {
      console.warn(
        'No EventReservation records were found for event refund status update:',
        {
          refundId:
            refund.id,

          status:
            refund.status,

          eventId,

          paymentIntentId,
        }
      );

      return {
        handled: false,
        reason:
          'reservations_not_found',
      };
    }

    await updateReservationsForRefundStatus(
      reservations,
      refund
    );

    console.log(
      'Event refund status recorded without sending a customer email:',
      {
        refundId:
          refund.id,

        eventId,

        paymentIntentId,

        status:
          refund.status,

        reservationCount:
          reservations.length,
      }
    );

    return {
      handled: true,
      reason:
        `refund_${refund.status || 'unknown'}`,
    };
  };

/**
 * Route a Stripe Refund event to the appropriate event
 * cancellation handler.
 *
 * @param {object} refund
 * @returns {Promise<object>}
 */
const processEventRefund =
  async (
    refund
  ) => {
    if (
      !isEventCancellationRefund(
        refund
      )
    ) {
      console.log(
        'Event webhook ignored unrelated Stripe refund:',
        {
          refundId:
            refund?.id ||
            null,

          source:
            refund?.metadata
              ?.source ||
            null,

          status:
            refund?.status ||
            null,
        }
      );

      return {
        handled: false,
        reason:
          'not_event_cancellation_refund',
      };
    }

    if (
      refund.status ===
      'succeeded'
    ) {
      return processSucceededEventRefund(
        refund
      );
    }

    return processNonSucceededEventRefund(
      refund
    );
  };

/**
 * Verify and process the event Stripe webhook.
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
       * req.body must be the unmodified raw body for
       * Stripe signature verification.
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

        livemode:
          stripeEvent.livemode,
      }
    );

    try {
      if (
        COMPLETED_EVENT_TYPES.has(
          stripeEvent.type
        )
      ) {
        const result =
          await processCompletedEventCheckout(
            stripeObject
          );

        if (result.handled) {
          console.log(
            'Event checkout webhook completed successfully:',
            {
              stripeEventId:
                stripeEvent.id,

              stripeSessionId:
                stripeObject.id,

              holdToken:
                stripeObject
                  .metadata
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
                stripeObject?.id ||
                null,

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
            stripeObject
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

      if (
        REFUND_EVENT_TYPES.has(
          stripeEvent.type
        )
      ) {
        const result =
          await processEventRefund(
            stripeObject
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

          stripeObjectId:
            stripeObject?.id ||
            null,

          message:
            error.message,

          failedNotifications:
            error
              .failedNotifications ||
            null,

          stack:
            error.stack,
        }
      );

      /*
       * Returning 500 tells Stripe to retry.
       *
       * Refund notification sends are idempotent because
       * successfully notified reservations are marked and
       * skipped during later deliveries.
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

