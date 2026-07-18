// controllers/hybrid/stripeEventWebhookController.js
'use strict';

const Event = require('../../models/events');

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

/*
 * =============================
 * Stripe configuration
 * =============================
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
 * =============================
 * Constants
 * =============================
 */

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
 * =============================
 * General helpers
 * =============================
 */

const getModelAttributes = (
  model
) => {
  return (
    model?.rawAttributes ||
    model?.getAttributes?.() ||
    {}
  );
};

const getExistingModelField = (
  model,
  candidateNames
) => {
  const attributes =
    getModelAttributes(model);

  return (
    candidateNames.find(
      (fieldName) =>
        Object.prototype
          .hasOwnProperty.call(
            attributes,
            fieldName
          )
    ) || null
  );
};

const toPlainObject = (
  record
) => {
  if (!record) {
    return null;
  }

  if (
    typeof record.get ===
    'function'
  ) {
    return record.get({
      plain: true,
    });
  }

  return record;
};

const getField = (
  record,
  fieldNames
) => {
  const plainRecord =
    toPlainObject(record);

  for (
    const fieldName of
    fieldNames
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
        Object.prototype
          .hasOwnProperty.call(
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

const normalizeEmail = (
  value
) => {
  if (
    typeof value !==
    'string'
  ) {
    return null;
  }

  const normalizedEmail =
    value
      .trim()
      .toLowerCase();

  return normalizedEmail ||
    null;
};

const normalizeQuantity = (
  value
) => {
  const parsedValue =
    Number(value);

  if (
    Number.isInteger(
      parsedValue
    ) &&
    parsedValue > 0
  ) {
    return parsedValue;
  }

  return 1;
};

/*
 * =============================
 * Stripe object helpers
 * =============================
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

const isEventCancellationRefund = (
  refund
) => {
  return (
    refund?.object ===
      'refund' &&
    refund?.metadata
      ?.source ===
      EVENT_REFUND_SOURCE
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
    return session
      .payment_intent;
  }

  return (
    session
      ?.payment_intent?.id ||
    null
  );
};

const getRefundPaymentIntentId = (
  refund
) => {
  if (
    typeof refund
      ?.payment_intent ===
    'string'
  ) {
    return refund
      .payment_intent;
  }

  return (
    refund
      ?.payment_intent?.id ||
    null
  );
};

const getRefundEventId = (
  refund
) => {
  const eventId =
    refund?.metadata?.eventId;

  if (
    eventId === undefined ||
    eventId === null ||
    String(eventId).trim() ===
      ''
  ) {
    return null;
  }

  return String(
    eventId
  ).trim();
};

/*
 * =============================
 * Webhook validation
 * =============================
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
   * Connect webhook events include the connected account
   * in stripeEvent.account.
   *
   * Platform-level webhook events may not include account.
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
 * =============================
 * Checkout Session retrieval
 * =============================
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

    /*
     * The Session was created directly on the connected
     * account. It must be retrieved using that same account.
     */
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
 * =============================
 * Completed checkout handling
 * =============================
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
     * This service should:
     *
     * 1. Find the EventCheckoutHold.
     * 2. Convert reservedCount into soldCount.
     * 3. Create EventReservation records.
     * 4. Mark the hold completed.
     *
     * It must be idempotent because Stripe can retry.
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
     * The success page depends on EventReservation records.
     * Do not acknowledge the webhook if none were created.
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
     * Email errors are allowed to throw so Stripe retries
     * the webhook. The email utility should protect against
     * duplicate delivery if the webhook is retried.
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
 * =============================
 * Expired checkout handling
 * =============================
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
 * =============================
 * Refund helpers
 * =============================
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

    return EventReservation
      .findAll({
        where: {
          [eventIdField]:
            eventId,

          [paymentIntentField]:
            paymentIntentId,
        },

        order: [
          [
            'createdAt',
            'ASC',
          ],
        ],
      });
  };

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
    }

    const failureReason =
      refund?.failure_reason ||
      refund?.failureReason ||
      null;

    for (
      const reservation of
      reservations
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
        const refundedAt =
          getField(
            reservation,
            [
              'refundedAt',
              'refunded_at',
            ]
          ) ||
          new Date();

        updateValues
          .refunded_at =
          refundedAt;

        updateValues
          .refundedAt =
          refundedAt;
      }

      await updateReservationSafely(
        reservation,
        updateValues
      );
    }
  };

const reservationWasNotified = (
  reservation,
  refundId
) => {
  const sentAt =
    getField(
      reservation,
      [
        'refundNotificationSentAt',
        'refund_notification_sent_at',
      ]
    );

  const notifiedRefundId =
    getField(
      reservation,
      [
        'refundNotificationRefundId',
        'refund_notification_refund_id',
      ]
    );

  if (!sentAt) {
    return false;
  }

  if (!notifiedRefundId) {
    return true;
  }

  return (
    String(
      notifiedRefundId
    ) ===
    String(refundId)
  );
};

const markRefundNotificationSent =
  async ({
    reservations,
    refund,
    emailResult,
  }) => {
    const sentAt =
      new Date();

    for (
      const reservation of
      reservations
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
      const reservation of
      reservations
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
          'Unable to record refund notification failure:',
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
              updateError
                .message,
          }
        );
      }
    }
  };

const getEventDateForEmail = (
  event,
  reservations
) => {
  const reservation =
    reservations[0] ||
    null;

  return (
    getField(
      reservation,
      [
        'occurrenceDate',
        'occurrence_date',
        'eventDate',
        'event_date',
      ]
    ) ||
    getField(
      event,
      [
        'startDate',
        'start_date',
        'date',
      ]
    ) ||
    null
  );
};

/*
 * =============================
 * Refund handling
 * =============================
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
        'Event refund is missing identifiers:',
        {
          refundId:
            refund?.id ||
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
      reservations.length === 0
    ) {
      console.warn(
        'No reservations found for event refund:',
        {
          refundId:
            refund.id,
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

    if (
      refund.status !==
      'succeeded'
    ) {
      return {
        handled: true,
        reason:
          `refund_${
            refund.status ||
            'unknown'
          }`,
      };
    }

    const event =
      await Event.findByPk(
        eventId
      );

    const eventName =
      getField(
        event,
        [
          'name',
          'title',
          'eventName',
          'event_name',
        ]
      ) ||
      refund?.metadata
        ?.eventName ||
      'Your event';

    const eventDate =
      getEventDateForEmail(
        event,
        reservations
      );

    const eventStartTime =
      getField(
        event,
        [
          'startTime',
          'start_time',
        ]
      );

    const reservationsByEmail =
      new Map();

    for (
      const reservation of
      reservations
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
          'Refund reservation is missing purchaser email:',
          {
            refundId:
              refund.id,

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
        !reservationsByEmail
          .has(
            purchaserEmail
          )
      ) {
        reservationsByEmail
          .set(
            purchaserEmail,
            []
          );
      }

      reservationsByEmail
        .get(purchaserEmail)
        .push(reservation);
    }

    const failedNotifications =
      [];

    for (
      const [
        purchaserEmail,
        purchaserReservations,
      ] of reservationsByEmail
    ) {
      const alreadyNotified =
        purchaserReservations
          .every(
            (reservation) =>
              reservationWasNotified(
                reservation,
                refund.id
              )
          );

      if (alreadyNotified) {
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
        purchaserReservations
          .reduce(
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

        console.log(
          'Event refund notification sent:',
          {
            refundId:
              refund.id,
            purchaserEmail,
            emailId:
              emailResult
                ?.emailId ||
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
          message:
            error.message,
        });
      }
    }

    if (
      failedNotifications.length >
      0
    ) {
      const error = new Error(
        `${failedNotifications.length} event refund notification email(s) failed.`
      );

      error.failedNotifications =
        failedNotifications;

      throw error;
    }

    return {
      handled: true,
    };
  };

/*
 * =============================
 * Main webhook controller
 * =============================
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
       * req.body must be the unmodified raw Buffer.
       *
       * The route must use:
       *
       * express.raw({
       *   type: 'application/json'
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
      } else if (
        REFUND_EVENT_TYPES
          .has(
            stripeEvent.type
          )
      ) {
        result =
          await processEventRefund(
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

          failedNotifications:
            error
              .failedNotifications ||
            null,

          stack:
            error.stack,
        }
      );

      /*
       * Returning 500 tells Stripe to retry this delivery.
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