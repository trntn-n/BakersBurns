// controllers/register/eventNotificationSubscriptionController.js
'use strict';

const { Op } = require('sequelize');

const EventNotificationSubscription = require(
  '../../models/eventNotification'
);

const Event = require(
  '../../models/events'
);

const EventOccurrence = require(
  '../../models/eventOccurrence'
);

const {
  sendEventReminderSubscriptionConfirmation,
} = require(
  '../../utils/eventNotificationEmail'
);

const EMAIL_PATTERN =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/*
 * Converts common frontend values into real booleans.
 *
 * Supported true values:
 * true, 1, "1", "true", "yes", "on"
 *
 * Supported false values:
 * false, 0, "0", "false", "no", "off", ""
 */
const parseBoolean = (
  value,
  fallback = false
) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  if (typeof value === 'string') {
    const normalizedValue = value
      .trim()
      .toLowerCase();

    if (
      [
        'true',
        '1',
        'yes',
        'on',
      ].includes(normalizedValue)
    ) {
      return true;
    }

    if (
      [
        'false',
        '0',
        'no',
        'off',
        '',
      ].includes(normalizedValue)
    ) {
      return false;
    }
  }

  return fallback;
};

const normalizeEmail = (value) => {
  return String(value || '')
    .trim()
    .toLowerCase();
};

const parsePositiveInteger = (value) => {
  const parsedValue = Number.parseInt(
    value,
    10
  );

  if (
    !Number.isInteger(parsedValue) ||
    parsedValue <= 0
  ) {
    return null;
  }

  return parsedValue;
};

const parseNullablePositiveInteger = (
  value
) => {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  return parsePositiveInteger(value);
};

/*
 * Extracts the occurrence date while supporting common
 * camelCase and snake_case field names.
 */
const getOccurrenceDate = (
  occurrence
) => {
  return (
    occurrence?.occurrenceDate ??
    occurrence?.occurrence_date ??
    occurrence?.date ??
    null
  );
};

/*
 * Creates the labels displayed in the single confirmation
 * email sent immediately after subscription.
 */
const buildReminderFrequencyLabels = ({
  acceptedOneMonthBefore,
  acceptedOneWeekBefore,
  acceptedOneDayBefore,
}) => {
  const labels = [];

  if (acceptedOneMonthBefore) {
    labels.push(
      'One month before each event date'
    );
  }

  if (acceptedOneWeekBefore) {
    labels.push(
      'One week before each event date'
    );
  }

  if (acceptedOneDayBefore) {
    labels.push(
      'One day before each event date'
    );
  }

  return labels;
};

/*
 * Loads the event and occurrence information needed for
 * the confirmation email.
 *
 * This runs after the subscription transaction commits.
 */
const loadConfirmationEmailDetails =
  async ({
    eventId,
    occurrenceIds,
  }) => {
    const event = eventId
      ? await Event.findByPk(eventId)
      : null;

    const occurrences =
      await EventOccurrence.findAll({
        where: {
          id: {
            [Op.in]: occurrenceIds,
          },
        },
      });

    /*
     * Sort in JavaScript so this does not depend on the
     * exact database name of the occurrence date column.
     */
    const eventDates = occurrences
      .map(getOccurrenceDate)
      .filter(Boolean)
      .sort((firstDate, secondDate) => {
        return String(firstDate).localeCompare(
          String(secondDate)
        );
      });

    return {
      eventName:
        event?.name ||
        event?.eventName ||
        'BakersBurns Event',

      eventDates,
    };
  };

/*
 * Sends the one confirmation email summarizing all saved
 * event dates and selected reminder frequencies.
 *
 * This does not send month, week, or day reminders.
 */
const sendSubscriptionConfirmationEmail =
  async ({
    email,
    eventId,
    occurrenceIds,
    acceptedOneMonthBefore,
    acceptedOneWeekBefore,
    acceptedOneDayBefore,
  }) => {
    const {
      eventName,
      eventDates,
    } =
      await loadConfirmationEmailDetails({
        eventId,
        occurrenceIds,
      });

    const reminderFrequencies =
      buildReminderFrequencyLabels({
        acceptedOneMonthBefore,
        acceptedOneWeekBefore,
        acceptedOneDayBefore,
      });

    return sendEventReminderSubscriptionConfirmation({
      email,
      eventName,
      eventDates,
      reminderFrequencies,
    });
  };

/*
 * POST
 * /register-events/event-notification-subscriptions
 *
 * Payload sent by EventCheckoutSuccess.jsx:
 *
 * {
 *   email: string,
 *   eventId: number | null,
 *   sessionId: string | null,
 *   occurrenceIds: number[],
 *   oneMonthBeforeRequested: boolean,
 *   oneWeekBeforeRequested: boolean,
 *   oneDayBeforeRequested: boolean
 * }
 *
 * One database row is created or updated for each event
 * occurrence ID.
 *
 * After all rows commit successfully, one confirmation
 * email summarizes the complete reminder request.
 */
const createEventNotificationSubscriptions =
  async (req, res) => {
    let transaction;

    try {
      const email = normalizeEmail(
        req.body?.email
      );

      const eventId =
        parseNullablePositiveInteger(
          req.body?.eventId
        );

      const stripeSessionId =
        req.body?.sessionId
          ? String(
              req.body.sessionId
            ).trim()
          : null;

      const rawOccurrenceIds =
        Array.isArray(
          req.body?.occurrenceIds
        )
          ? req.body.occurrenceIds
          : [];

      /*
       * Parse IDs and remove duplicates.
       */
      const occurrenceIds = [
        ...new Set(
          rawOccurrenceIds
            .map(
              parsePositiveInteger
            )
            .filter(Boolean)
        ),
      ];

      const acceptedOneMonthBefore =
        parseBoolean(
          req.body
            ?.oneMonthBeforeRequested
        );

      const acceptedOneWeekBefore =
        parseBoolean(
          req.body
            ?.oneWeekBeforeRequested
        );

      const acceptedOneDayBefore =
        parseBoolean(
          req.body
            ?.oneDayBeforeRequested
        );

      /*
       * Validate before opening a database transaction.
       */
      if (
        !email ||
        !EMAIL_PATTERN.test(email)
      ) {
        return res.status(400).json({
          message:
            'A valid email address is required.',
        });
      }

      if (
        occurrenceIds.length === 0
      ) {
        return res.status(400).json({
          message:
            'At least one valid event occurrence ID is required.',
        });
      }

      if (
        !acceptedOneMonthBefore &&
        !acceptedOneWeekBefore &&
        !acceptedOneDayBefore
      ) {
        return res.status(400).json({
          message:
            'At least one reminder timing must be selected.',
        });
      }

      transaction =
        await EventNotificationSubscription
          .sequelize
          .transaction();

      const subscriptions = [];

      for (
        const eventOccurrenceId
        of occurrenceIds
      ) {
        const existingSubscription =
          await EventNotificationSubscription.findOne(
            {
              where: {
                email,
                eventOccurrenceId,
              },

              transaction,
            }
          );

        if (!existingSubscription) {
          const newSubscription =
            await EventNotificationSubscription.create(
              {
                email,
                eventId,
                eventOccurrenceId,
                stripeSessionId,

                acceptedOneMonthBefore,
                sentOneMonthBefore:
                  false,

                acceptedOneWeekBefore,
                sentOneWeekBefore:
                  false,

                acceptedOneDayBefore,
                sentOneDayBefore:
                  false,
              },
              {
                transaction,
              }
            );

          subscriptions.push(
            newSubscription
          );

          continue;
        }

        /*
         * Preserve sent=true when an already-enabled
         * reminder remains enabled.
         *
         * Reset sent=false only when a customer enables
         * a reminder that was previously disabled.
         */
        const updates = {
          eventId,
          stripeSessionId,

          acceptedOneMonthBefore,
          acceptedOneWeekBefore,
          acceptedOneDayBefore,
        };

        if (
          acceptedOneMonthBefore &&
          !existingSubscription
            .acceptedOneMonthBefore
        ) {
          updates.sentOneMonthBefore =
            false;
        }

        if (
          acceptedOneWeekBefore &&
          !existingSubscription
            .acceptedOneWeekBefore
        ) {
          updates.sentOneWeekBefore =
            false;
        }

        if (
          acceptedOneDayBefore &&
          !existingSubscription
            .acceptedOneDayBefore
        ) {
          updates.sentOneDayBefore =
            false;
        }

        await existingSubscription.update(
          updates,
          {
            transaction,
          }
        );

        subscriptions.push(
          existingSubscription
        );
      }

      /*
       * Save all subscriptions before sending any email.
       */
      await transaction.commit();

      /*
       * Prevent the catch block from trying to roll back
       * an already-committed transaction.
       */
      transaction = null;

      /*
       * This is the only email sent by this controller.
       *
       * The cron job will handle the scheduled one-month,
       * one-week, and one-day reminder emails.
       */
      let confirmationEmailSent = false;
      let confirmationEmailError = null;

      try {
        await sendSubscriptionConfirmationEmail({
          email,
          eventId,
          occurrenceIds,
          acceptedOneMonthBefore,
          acceptedOneWeekBefore,
          acceptedOneDayBefore,
        });

        confirmationEmailSent = true;
      } catch (emailError) {
        confirmationEmailError =
          emailError.message ||
          'Unknown email delivery error.';

        console.error(
          'Reminder preferences were saved, but the confirmation email failed:',
          emailError
        );
      }

      return res.status(200).json({
        message:
          confirmationEmailSent
            ? 'Event reminder preferences saved and confirmation email sent successfully.'
            : 'Event reminder preferences were saved, but the confirmation email could not be sent.',

        subscriptionCount:
          subscriptions.length,

        confirmationEmailSent,
        confirmationEmailError,

        subscriptions,
      });
    } catch (error) {
      if (
        transaction &&
        !transaction.finished
      ) {
        await transaction.rollback();
      }

      console.error(
        'Error creating event notification subscriptions:',
        error
      );

      if (
        error.name ===
        'SequelizeUniqueConstraintError'
      ) {
        return res.status(409).json({
          message:
            'A reminder subscription already exists for this email and event occurrence.',
        });
      }

      if (
        error.name ===
        'SequelizeValidationError'
      ) {
        return res.status(400).json({
          message:
            error.errors?.[0]
              ?.message ||
            'The notification subscription data is invalid.',
        });
      }

      return res.status(500).json({
        message:
          'Unable to save event reminder preferences.',
      });
    }
  };

/*
 * GET
 * /register-events/event-notification-subscriptions
 *
 * Optional query parameters:
 *
 * ?email=user@example.com
 * ?eventId=4
 * ?eventOccurrenceId=2
 * ?pending=true
 *
 * pending=true returns subscriptions with at least one
 * accepted reminder that has not yet been sent.
 */
const getAllEventNotificationSubscriptions =
  async (req, res) => {
    try {
      const where = {};

      if (req.query?.email) {
        const email = normalizeEmail(
          req.query.email
        );

        if (
          !EMAIL_PATTERN.test(email)
        ) {
          return res.status(400).json({
            message:
              'A valid email address is required.',
          });
        }

        where.email = email;
      }

      if (
        req.query?.eventId !==
        undefined
      ) {
        const eventId =
          parsePositiveInteger(
            req.query.eventId
          );

        if (!eventId) {
          return res.status(400).json({
            message:
              'eventId must be a positive integer.',
          });
        }

        where.eventId = eventId;
      }

      if (
        req.query
          ?.eventOccurrenceId !==
        undefined
      ) {
        const eventOccurrenceId =
          parsePositiveInteger(
            req.query
              .eventOccurrenceId
          );

        if (!eventOccurrenceId) {
          return res.status(400).json({
            message:
              'eventOccurrenceId must be a positive integer.',
          });
        }

        where.eventOccurrenceId =
          eventOccurrenceId;
      }

      if (
        parseBoolean(
          req.query?.pending
        )
      ) {
        where[Op.or] = [
          {
            acceptedOneMonthBefore:
              true,

            sentOneMonthBefore:
              false,
          },

          {
            acceptedOneWeekBefore:
              true,

            sentOneWeekBefore:
              false,
          },

          {
            acceptedOneDayBefore:
              true,

            sentOneDayBefore:
              false,
          },
        ];
      }

      const subscriptions =
        await EventNotificationSubscription.findAll(
          {
            where,

            order: [
              [
                'createdAt',
                'DESC',
              ],
            ],
          }
        );

      return res
        .status(200)
        .json(subscriptions);
    } catch (error) {
      console.error(
        'Error fetching event notification subscriptions:',
        error
      );

      return res.status(500).json({
        message:
          'Unable to fetch event notification subscriptions.',
      });
    }
  };

/*
 * GET
 * /register-events/event-notification-subscriptions/:id
 */
const getEventNotificationSubscriptionById =
  async (req, res) => {
    try {
      const subscriptionId =
        parsePositiveInteger(
          req.params?.id
        );

      if (!subscriptionId) {
        return res.status(400).json({
          message:
            'A valid subscription ID is required.',
        });
      }

      const subscription =
        await EventNotificationSubscription.findByPk(
          subscriptionId
        );

      if (!subscription) {
        return res.status(404).json({
          message:
            'Event notification subscription not found.',
        });
      }

      return res
        .status(200)
        .json(subscription);
    } catch (error) {
      console.error(
        'Error fetching event notification subscription:',
        error
      );

      return res.status(500).json({
        message:
          'Unable to fetch the event notification subscription.',
      });
    }
  };

/*
 * PATCH
 * /register-events/event-notification-subscriptions/:id
 *
 * Used by an admin or reminder-preferences page to update
 * accepted and sent flags.
 *
 * Updating a subscription here does not send an email.
 */
const updateEventNotificationSubscription =
  async (req, res) => {
    try {
      const subscriptionId =
        parsePositiveInteger(
          req.params?.id
        );

      if (!subscriptionId) {
        return res.status(400).json({
          message:
            'A valid subscription ID is required.',
        });
      }

      const subscription =
        await EventNotificationSubscription.findByPk(
          subscriptionId
        );

      if (!subscription) {
        return res.status(404).json({
          message:
            'Event notification subscription not found.',
        });
      }

      const updates = {};

      if (
        req.body?.email !==
        undefined
      ) {
        const email = normalizeEmail(
          req.body.email
        );

        if (
          !EMAIL_PATTERN.test(email)
        ) {
          return res.status(400).json({
            message:
              'A valid email address is required.',
          });
        }

        updates.email = email;
      }

      if (
        req.body?.eventId !==
        undefined
      ) {
        const eventId =
          parseNullablePositiveInteger(
            req.body.eventId
          );

        if (
          req.body.eventId !==
            null &&
          req.body.eventId !==
            '' &&
          !eventId
        ) {
          return res.status(400).json({
            message:
              'eventId must be a positive integer or null.',
          });
        }

        updates.eventId = eventId;
      }

      if (
        req.body
          ?.eventOccurrenceId !==
        undefined
      ) {
        const eventOccurrenceId =
          parsePositiveInteger(
            req.body
              .eventOccurrenceId
          );

        if (!eventOccurrenceId) {
          return res.status(400).json({
            message:
              'eventOccurrenceId must be a positive integer.',
          });
        }

        updates.eventOccurrenceId =
          eventOccurrenceId;
      }

      if (
        req.body
          ?.stripeSessionId !==
        undefined ||
        req.body?.sessionId !==
          undefined
      ) {
        const sessionId =
          req.body
            .stripeSessionId ??
          req.body.sessionId;

        updates.stripeSessionId =
          sessionId
            ? String(
                sessionId
              ).trim()
            : null;
      }

      /*
       * Accept both database-style property names and the
       * property names sent by the checkout-success page.
       */
      const acceptedFields = [
        {
          modelField:
            'acceptedOneMonthBefore',

          frontendField:
            'oneMonthBeforeRequested',

          sentField:
            'sentOneMonthBefore',
        },

        {
          modelField:
            'acceptedOneWeekBefore',

          frontendField:
            'oneWeekBeforeRequested',

          sentField:
            'sentOneWeekBefore',
        },

        {
          modelField:
            'acceptedOneDayBefore',

          frontendField:
            'oneDayBeforeRequested',

          sentField:
            'sentOneDayBefore',
        },
      ];

      for (
        const field
        of acceptedFields
      ) {
        const modelValueProvided =
          req.body?.[
            field.modelField
          ] !== undefined;

        const frontendValueProvided =
          req.body?.[
            field.frontendField
          ] !== undefined;

        if (
          !modelValueProvided &&
          !frontendValueProvided
        ) {
          continue;
        }

        const providedValue =
          modelValueProvided
            ? req.body[
                field.modelField
              ]
            : req.body[
                field.frontendField
              ];

        const accepted =
          parseBoolean(
            providedValue
          );

        /*
         * Newly enabling an option makes it eligible for
         * the cron job to send.
         */
        if (
          accepted &&
          !subscription[
            field.modelField
          ]
        ) {
          updates[
            field.sentField
          ] = false;
        }

        updates[
          field.modelField
        ] = accepted;
      }

      const sentFields = [
        'sentOneMonthBefore',
        'sentOneWeekBefore',
        'sentOneDayBefore',
      ];

      for (
        const sentField
        of sentFields
      ) {
        if (
          req.body?.[
            sentField
          ] !== undefined
        ) {
          updates[sentField] =
            parseBoolean(
              req.body[
                sentField
              ]
            );
        }
      }

      await subscription.update(
        updates
      );

      return res
        .status(200)
        .json({
          message:
            'Event notification subscription updated successfully.',

          subscription,
        });
    } catch (error) {
      console.error(
        'Error updating event notification subscription:',
        error
      );

      if (
        error.name ===
        'SequelizeUniqueConstraintError'
      ) {
        return res.status(409).json({
          message:
            'A subscription already exists for that email and event occurrence.',
        });
      }

      if (
        error.name ===
        'SequelizeValidationError'
      ) {
        return res.status(400).json({
          message:
            error.errors?.[0]
              ?.message ||
            'The notification subscription data is invalid.',
        });
      }

      return res.status(500).json({
        message:
          'Unable to update the event notification subscription.',
      });
    }
  };

/*
 * PATCH
 * /register-events/event-notification-subscriptions/:id/mark-sent
 *
 * Expected body:
 *
 * {
 *   frequency: "month"
 * }
 *
 * Valid values:
 * month, week, day
 *
 * The cron process can use this after its corresponding
 * reminder email has been sent successfully.
 */
const markEventNotificationSent =
  async (req, res) => {
    try {
      const subscriptionId =
        parsePositiveInteger(
          req.params?.id
        );

      if (!subscriptionId) {
        return res.status(400).json({
          message:
            'A valid subscription ID is required.',
        });
      }

      const frequency = String(
        req.body?.frequency || ''
      )
        .trim()
        .toLowerCase();

      const sentFieldByFrequency = {
        month:
          'sentOneMonthBefore',

        week:
          'sentOneWeekBefore',

        day:
          'sentOneDayBefore',
      };

      const sentField =
        sentFieldByFrequency[
          frequency
        ];

      if (!sentField) {
        return res.status(400).json({
          message:
            'Frequency must be month, week, or day.',
        });
      }

      const subscription =
        await EventNotificationSubscription.findByPk(
          subscriptionId
        );

      if (!subscription) {
        return res.status(404).json({
          message:
            'Event notification subscription not found.',
        });
      }

      await subscription.update({
        [sentField]: true,
      });

      return res
        .status(200)
        .json({
          message:
            `${frequency} reminder marked as sent.`,

          subscription,
        });
    } catch (error) {
      console.error(
        'Error marking event notification as sent:',
        error
      );

      return res.status(500).json({
        message:
          'Unable to mark the event notification as sent.',
      });
    }
  };

/*
 * DELETE
 * /register-events/event-notification-subscriptions/:id
 */
const deleteEventNotificationSubscription =
  async (req, res) => {
    try {
      const subscriptionId =
        parsePositiveInteger(
          req.params?.id
        );

      if (!subscriptionId) {
        return res.status(400).json({
          message:
            'A valid subscription ID is required.',
        });
      }

      const subscription =
        await EventNotificationSubscription.findByPk(
          subscriptionId
        );

      if (!subscription) {
        return res.status(404).json({
          message:
            'Event notification subscription not found.',
        });
      }

      await subscription.destroy();

      return res
        .status(200)
        .json({
          message:
            'Event notification subscription deleted successfully.',
        });
    } catch (error) {
      console.error(
        'Error deleting event notification subscription:',
        error
      );

      return res.status(500).json({
        message:
          'Unable to delete the event notification subscription.',
      });
    }
  };

module.exports = {
  createEventNotificationSubscriptions,
  getAllEventNotificationSubscriptions,
  getEventNotificationSubscriptionById,
  updateEventNotificationSubscription,
  markEventNotificationSent,
  deleteEventNotificationSubscription,
};