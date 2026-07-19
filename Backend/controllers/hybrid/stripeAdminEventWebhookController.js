// controllers/admin/adminEventWebhookController.js
'use strict';

const Event = require(
  '../../models/events'
);

const EventReservation = require(
  '../../models/eventReservation.js'
);

const EventOccurrence = require(
  '../../models/eventOccurrence.js'
);

const sequelize = require(
  '../../config/database'
);

const {
  sendEventRefundNotificationEmail,
} = require(
  '../../utils/eventRefundNotificationEmail.js'
);

/*
 * ============================================================
 * Stripe configuration
 * ============================================================
 *
 * Test mode:
 *   STRIPE_TEST_SECRET_KEY
 *   STRIPE_TEST_ADMIN_EVENT_WEBHOOK_SECRET
 *   BAKERS_BURNS_TEST_ACCOUNT_ID
 *
 * Live mode:
 *   STRIPE_SECRET_KEY
 *   STRIPE_ADMIN_EVENT_WEBHOOK_SECRET
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
        .STRIPE_TEST_ADMIN_EVENT_WEBHOOK_SECRET
    : process.env
        .STRIPE_LIVE_ADMIN_EVENT_WEBHOOK_SECRET;

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
    ? 'STRIPE_TEST_ADMIN_EVENT_WEBHOOK_SECRET'
    : 'STRIPE_ADMIN_EVENT_WEBHOOK_SECRET';

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

const EVENT_REFUND_SOURCE =
  'admin_event_bulk_refund';

const REFUND_EVENT_TYPES =
  new Set([
    'refund.created',
    'refund.updated',
    'refund.failed',
  ]);

console.log(
  'Admin event refund webhook configuration loaded:',
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
 * Model helpers
 * ============================================================
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
    ) ||
    null
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
      updateValues,
      options
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
 * ============================================================
 * Stripe refund helpers
 * ============================================================
 */

const isAdminEventBatchRefund = (
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
 * ============================================================
 * Webhook account validation
 * ============================================================
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
   * Stripe Connect events normally include the connected
   * account ID in stripeEvent.account.
   *
   * Platform-level webhook events may omit this property.
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
 * Reservation lookup
 * ============================================================
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

/*
 * ============================================================
 * Reservation refund status and event cleanup
 * ============================================================
 */

const getOccurrenceFieldNames = () => {
  return {
    eventId:
      getExistingModelField(
        EventOccurrence,
        [
          'event_id',
          'eventId',
        ]
      ),

    soldCount:
      getExistingModelField(
        EventOccurrence,
        [
          'sold_count',
          'soldCount',
        ]
      ),

    reservedCount:
      getExistingModelField(
        EventOccurrence,
        [
          'reserved_count',
          'reservedCount',
        ]
      ),
  };
};

const releaseReservationInventory =
  async ({
    reservation,
    transaction,
  }) => {
    const occurrenceId =
      getField(
        reservation,
        [
          'occurrenceId',
          'occurrence_id',
        ]
      );

    if (!occurrenceId) {
      console.warn(
        'Refunded reservation has no occurrence ID:',
        {
          reservationId:
            getField(
              reservation,
              ['id']
            ),
        }
      );

      return false;
    }

    const occurrence =
      await EventOccurrence.findByPk(
        occurrenceId,
        {
          transaction,
          lock:
            transaction.LOCK.UPDATE,
        }
      );

    if (!occurrence) {
      console.warn(
        'Event occurrence was not found while releasing refunded inventory:',
        {
          reservationId:
            getField(
              reservation,
              ['id']
            ),

          occurrenceId,
        }
      );

      return false;
    }

    const {
      soldCount,
    } = getOccurrenceFieldNames();

    if (!soldCount) {
      throw new Error(
        'EventOccurrence does not define sold_count or soldCount.'
      );
    }

    const quantity =
      normalizeQuantity(
        getField(
          reservation,
          ['quantity']
        )
      );

    const currentSoldCount =
      Math.max(
        0,
        Number(
          getField(
            occurrence,
            [
              'soldCount',
              'sold_count',
            ]
          ) || 0
        )
      );

    const nextSoldCount =
      Math.max(
        0,
        currentSoldCount -
          quantity
      );

    await occurrence.update(
      {
        [soldCount]:
          nextSoldCount,
      },
      {
        transaction,
      }
    );

    console.log(
      'Released refunded event inventory:',
      {
        reservationId:
          getField(
            reservation,
            ['id']
          ),

        occurrenceId,

        quantity,

        previousSoldCount:
          currentSoldCount,

        nextSoldCount,
      }
    );

    return true;
  };

const updateReservationsForRefundStatus =
  async (
    reservations,
    refund
  ) => {
    const refundStatus =
      String(
        refund?.status || ''
      )
        .trim()
        .toLowerCase();

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
        'failed'
    ) {
      reservationStatus =
        'refund_failed';
    }

    const failureReason =
      refund?.failure_reason ||
      refund?.failureReason ||
      null;

    const reservationIds =
      reservations
        .map(
          (reservation) =>
            getField(
              reservation,
              ['id']
            )
        )
        .filter(Boolean);

    if (
      reservationIds.length === 0
    ) {
      return {
        updatedCount: 0,
        releasedInventoryCount: 0,
      };
    }

    return sequelize.transaction(
      async (transaction) => {
        const lockedReservations =
          await EventReservation
            .findAll({
              where: {
                id:
                  reservationIds,
              },

              transaction,

              lock:
                transaction.LOCK.UPDATE,

              order: [
                [
                  'createdAt',
                  'ASC',
                ],
              ],
            });

        let updatedCount = 0;
        let releasedInventoryCount =
          0;

        for (
          const reservation of
          lockedReservations
        ) {
          const previousStatus =
            String(
              getField(
                reservation,
                ['status']
              ) || ''
            )
              .trim()
              .toLowerCase();

          const alreadyRefunded =
            previousStatus ===
            'refunded';

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

            updateValues.refunded_at =
              refundedAt;

            updateValues.refundedAt =
              refundedAt;
          }

          await updateReservationSafely(
            reservation,
            updateValues,
            {
              transaction,
            }
          );

          updatedCount += 1;

          /*
           * Only release inventory during the first successful
           * transition to "refunded". Stripe can deliver both
           * refund.created and refund.updated for the same refund.
           */
          if (
            refundStatus ===
              'succeeded' &&
            !alreadyRefunded
          ) {
            const inventoryReleased =
              await releaseReservationInventory({
                reservation,
                transaction,
              });

            if (inventoryReleased) {
              releasedInventoryCount +=
                1;
            }
          }
        }

        return {
          updatedCount,
          releasedInventoryCount,
        };
      }
    );
  };

const eventIsReadyForDeletion =
  async (
    eventId,
    transaction
  ) => {
    const reservationEventIdField =
      getExistingModelField(
        EventReservation,
        [
          'event_id',
          'eventId',
        ]
      );

    if (!reservationEventIdField) {
      throw new Error(
        'EventReservation does not define event_id or eventId.'
      );
    }

    const reservations =
      await EventReservation
        .findAll({
          where: {
            [reservationEventIdField]:
              eventId,
          },

          transaction,

          lock:
            transaction.LOCK.UPDATE,
        });

    const blockingReservations =
      reservations.filter(
        (reservation) => {
          const status =
            String(
              getField(
                reservation,
                ['status']
              ) || ''
            )
              .trim()
              .toLowerCase();

          return ![
            'refunded',
            'cancelled',
            'canceled',
            'expired',
          ].includes(status);
        }
      );

    const {
      eventId:
        occurrenceEventIdField,
      soldCount,
      reservedCount,
    } = getOccurrenceFieldNames();

    if (
      !occurrenceEventIdField
    ) {
      throw new Error(
        'EventOccurrence does not define event_id or eventId.'
      );
    }

    const occurrences =
      await EventOccurrence
        .findAll({
          where: {
            [occurrenceEventIdField]:
              eventId,
          },

          transaction,

          lock:
            transaction.LOCK.UPDATE,
        });

    const blockingOccurrences =
      occurrences.filter(
        (occurrence) => {
          const sold =
            soldCount
              ? Number(
                  getField(
                    occurrence,
                    [
                      'soldCount',
                      'sold_count',
                    ]
                  ) || 0
                )
              : 0;

          const reserved =
            reservedCount
              ? Number(
                  getField(
                    occurrence,
                    [
                      'reservedCount',
                      'reserved_count',
                    ]
                  ) || 0
                )
              : 0;

          return (
            sold > 0 ||
            reserved > 0
          );
        }
      );

    return {
      ready:
        blockingReservations
          .length === 0 &&
        blockingOccurrences
          .length === 0,

      reservations,

      occurrences,

      blockingReservationCount:
        blockingReservations.length,

      blockingOccurrenceCount:
        blockingOccurrences.length,
    };
  };

const deleteEventAfterSuccessfulRefunds =
  async (
    eventId
  ) => {
    return sequelize.transaction(
      async (transaction) => {
        const event =
          await Event.findByPk(
            eventId,
            {
              transaction,
              lock:
                transaction.LOCK.UPDATE,
            }
          );

        if (!event) {
          return {
            deleted: false,
            reason:
              'event_already_deleted',
          };
        }

        const deletionState =
          await eventIsReadyForDeletion(
            eventId,
            transaction
          );

        if (!deletionState.ready) {
          console.log(
            'Event is waiting for remaining refunds before deletion:',
            {
              eventId,

              blockingReservationCount:
                deletionState
                  .blockingReservationCount,

              blockingOccurrenceCount:
                deletionState
                  .blockingOccurrenceCount,
            }
          );

          return {
            deleted: false,
            reason:
              'refunds_or_inventory_remaining',
            ...deletionState,
          };
        }

        /*
         * Remove occurrence rows before deleting the event.
         * Refunded reservation rows are intentionally retained
         * as payment/refund audit records.
         *
         * Your EventReservation.event_id foreign key must therefore
         * use ON DELETE SET NULL or no restrictive foreign key.
         * If it uses RESTRICT, move this block into the same shared
         * deletion service used by adminEventController.
         */
        const {
          eventId:
            occurrenceEventIdField,
        } = getOccurrenceFieldNames();

        if (
          occurrenceEventIdField
        ) {
          await EventOccurrence.destroy({
            where: {
              [occurrenceEventIdField]:
                eventId,
            },

            transaction,
          });
        }

        const deletedCount =
          await Event.destroy({
            where: {
              id:
                eventId,
            },

            transaction,
          });

        if (
          deletedCount !== 1
        ) {
          throw new Error(
            `Expected to delete event ${eventId}, but deleted ${deletedCount} rows.`
          );
        }

        console.log(
          'Event deleted after all refunds completed:',
          {
            eventId,

            refundedReservationCount:
              deletionState
                .reservations
                .length,
          }
        );

        return {
          deleted: true,
          reason: null,
        };
      }
    );
  };

/*
 * ============================================================
 * Refund email idempotency helpers
 * ============================================================
 */

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
              updateError.message,
          }
        );
      }
    }
  };

/*
 * ============================================================
 * Event information helpers
 * ============================================================
 */

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
 * ============================================================
 * Refund processing
 * ============================================================
 */

const processAdminEventRefund =
  async (
    refund
  ) => {
    /*
     * Ignore all refunds that were not created by the admin
     * event batch-refund process.
     *
     * This prevents product refunds and unrelated event
     * refunds from being handled by this webhook.
     */
    if (
      !isAdminEventBatchRefund(
        refund
      )
    ) {
      return {
        handled: false,
        reason:
          'not_admin_event_batch_refund',
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
        'Admin event batch refund is missing identifiers:',
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
        'No event reservations found for admin batch refund:',
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

    /*
     * Update reservation state for pending, successful, and
     * failed refunds.
     */
    await updateReservationsForRefundStatus(
      reservations,
      refund
    );

    /*
     * Customer notification emails should only be sent once
     * Stripe confirms that the refund succeeded.
     */
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

    /*
     * A PaymentIntent may be associated with multiple
     * EventReservation records.
     *
     * Group reservations by purchaser email so each purchaser
     * receives only one refund email for the refund.
     */
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
        .get(
          purchaserEmail
        )
        .push(
          reservation
        );
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
        purchaserReservations.every(
          (reservation) =>
            reservationWasNotified(
              reservation,
              refund.id
            )
        );

      if (alreadyNotified) {
        console.log(
          'Admin event refund notification already sent:',
          {
            refundId:
              refund.id,

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

        console.log(
          'Admin event refund notification sent:',
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

    /*
     * Every successful refund webhook checks whether this was the
     * final refund for the event. The final successful delivery
     * releases the last sold inventory and deletes the event.
     */
    const deletionResult =
      await deleteEventAfterSuccessfulRefunds(
        eventId
      );

    return {
      handled: true,

      eventDeleted:
        deletionResult.deleted,

      deletionReason:
        deletionResult.reason ||
        null,
    };
  };

/*
 * ============================================================
 * Main admin refund webhook controller
 * ============================================================
 */

const handleAdminEventWebhook =
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
        'Admin event refund webhook request is missing the Stripe signature.'
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
       * req.body must be the unmodified raw request Buffer.
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
        'Admin event refund webhook verification failed:',
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
      'Admin event refund webhook received:',
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

        refundSource:
          stripeObject?.metadata
            ?.source ||
          null,
      }
    );

    try {
      let result;

      if (
        REFUND_EVENT_TYPES.has(
          stripeEvent.type
        )
      ) {
        result =
          await processAdminEventRefund(
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
        'Admin event refund webhook processed:',
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

          eventDeleted:
            result.eventDeleted ??
            null,

          deletionReason:
            result.deletionReason ||
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

          eventDeleted:
            result.eventDeleted ??
            null,

          deletionReason:
            result.deletionReason ||
            null,
        });
    } catch (error) {
      console.error(
        'Error processing admin event refund webhook:',
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
       * Returning HTTP 500 causes Stripe to retry this webhook
       * delivery.
       */
      return res
        .status(500)
        .json({
          message:
            'Admin event refund webhook processing failed.',
        });
    }
  };

module.exports = {
  handleAdminEventWebhook,
};