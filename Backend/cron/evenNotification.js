// cron/eventNotificationCron.js
'use strict';

const cron = require('node-cron');
const { Op } = require('sequelize');

const EventNotificationSubscription = require(
  '../models/eventNotification'
);

const EventOccurrence = require(
  '../models/eventOccurrence'
);

const Event = require(
  '../models/events'
);

const {
  sendScheduledEventReminder,
} = require(
  '../email/event-templates/eventNotificationEmail'
);

const CRON_SCHEDULE =
  process.env
    .EVENT_NOTIFICATION_CRON_SCHEDULE ||
  '5 * * * *';

const CRON_TIMEZONE =
  process.env.EVENT_TIMEZONE ||
  'America/Denver';

const STARTUP_DELAY_MS = Math.max(
  0,
  Number.parseInt(
    process.env
      .EVENT_NOTIFICATION_STARTUP_DELAY_MS ||
      '15000',
    10
  ) || 15000
);

let cronIsRunning = false;

const getPlainRecord = (record) => {
  if (
    record &&
    typeof record.get === 'function'
  ) {
    return record.get({
      plain: true,
    });
  }

  return record || {};
};

const firstDefined = (
  record,
  fieldNames
) => {
  const plainRecord =
    getPlainRecord(record);

  for (const fieldName of fieldNames) {
    const value =
      plainRecord[fieldName];

    if (
      value !== undefined &&
      value !== null
    ) {
      return value;
    }
  }

  return null;
};

const getOccurrenceDate = (
  occurrence
) => {
  return firstDefined(
    occurrence,
    [
      'occurrenceDate',
      'occurrence_date',
      'date',
    ]
  );
};

const dateOnlyToUtcDate = (value) => {
  const dateValue = String(value || '')
    .trim()
    .slice(0, 10);

  const match = dateValue.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;

  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day)
    )
  );
};

const utcDateToDateOnly = (date) => {
  return date
    .toISOString()
    .slice(0, 10);
};

/*
 * Returns today's calendar date in the timezone used by the
 * event system. This avoids comparing server-local timestamps
 * against DATEONLY values.
 */
const getTodayDateOnly = (
  timeZone = CRON_TIMEZONE
) => {
  const parts =
    new Intl.DateTimeFormat(
      'en-US',
      {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone,
      }
    ).formatToParts(new Date());

  const values = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] =
        part.value;
    }
  }

  return (
    `${values.year}-` +
    `${values.month}-` +
    `${values.day}`
  );
};

const subtractUtcDays = (
  date,
  numberOfDays
) => {
  const result = new Date(
    date.getTime()
  );

  result.setUTCDate(
    result.getUTCDate() -
      numberOfDays
  );

  return result;
};

/*
 * Subtracts one calendar month while handling dates such as
 * March 31 correctly.
 *
 * For example:
 * March 31 -> February 28 or 29
 */
const subtractOneUtcMonth = (
  date
) => {
  const originalDay =
    date.getUTCDate();

  const result = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      1
    )
  );

  result.setUTCMonth(
    result.getUTCMonth() - 1
  );

  const finalDayOfTargetMonth =
    new Date(
      Date.UTC(
        result.getUTCFullYear(),
        result.getUTCMonth() + 1,
        0
      )
    ).getUTCDate();

  result.setUTCDate(
    Math.min(
      originalDay,
      finalDayOfTargetMonth
    )
  );

  return result;
};

const getReminderDefinitions = (
  occurrenceDate
) => {
  const eventDate =
    dateOnlyToUtcDate(
      occurrenceDate
    );

  if (!eventDate) {
    return [];
  }

  return [
    {
      type: 'one-month',

      acceptedField:
        'acceptedOneMonthBefore',

      sentField:
        'sentOneMonthBefore',

      dueDate:
        utcDateToDateOnly(
          subtractOneUtcMonth(
            eventDate
          )
        ),
    },

    {
      type: 'one-week',

      acceptedField:
        'acceptedOneWeekBefore',

      sentField:
        'sentOneWeekBefore',

      dueDate:
        utcDateToDateOnly(
          subtractUtcDays(
            eventDate,
            7
          )
        ),
    },

    {
      type: 'one-day',

      acceptedField:
        'acceptedOneDayBefore',

      sentField:
        'sentOneDayBefore',

      dueDate:
        utcDateToDateOnly(
          subtractUtcDays(
            eventDate,
            1
          )
        ),
    },
  ];
};

const getPendingSubscriptions =
  async () => {
    return EventNotificationSubscription
      .findAll({
        where: {
          [Op.or]: [
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
          ],
        },

        order: [
          ['id', 'ASC'],
        ],
      });
  };

const loadReminderDetails =
  async (subscription) => {
    const occurrence =
      await EventOccurrence.findByPk(
        subscription
          .eventOccurrenceId
      );

    if (!occurrence) {
      return {
        occurrence: null,
        event: null,
      };
    }

    const occurrenceEventId =
      firstDefined(
        occurrence,
        [
          'eventId',
          'event_id',
        ]
      );

    const eventId =
      subscription.eventId ||
      occurrenceEventId;

    const event = eventId
      ? await Event.findByPk(eventId)
      : null;

    return {
      occurrence,
      event,
    };
  };

const markReminderAsSent =
  async ({
    subscription,
    sentField,
  }) => {
    await subscription.update({
      [sentField]: true,
    });
  };

const processSubscription =
  async ({
    subscription,
    todayDateOnly,
  }) => {
    const {
      occurrence,
      event,
    } =
      await loadReminderDetails(
        subscription
      );

    if (!occurrence) {
      console.warn(
        'Skipping event reminder because the occurrence was not found:',
        {
          subscriptionId:
            subscription.id,

          eventOccurrenceId:
            subscription
              .eventOccurrenceId,
        }
      );

      return {
        sent: 0,
        failed: 0,
        skipped: 1,
      };
    }

    const occurrenceDate =
      getOccurrenceDate(
        occurrence
      );

    const eventDate =
      dateOnlyToUtcDate(
        occurrenceDate
      );

    if (!eventDate) {
      console.warn(
        'Skipping event reminder because the occurrence date is invalid:',
        {
          subscriptionId:
            subscription.id,

          occurrenceDate,
        }
      );

      return {
        sent: 0,
        failed: 0,
        skipped: 1,
      };
    }

    /*
     * Never send a reminder for an event date that has already
     * passed. A reminder due today remains eligible.
     */
    if (
      occurrenceDate <
      todayDateOnly
    ) {
      console.log(
        'Skipping reminders for a past event occurrence:',
        {
          subscriptionId:
            subscription.id,

          occurrenceDate,
        }
      );

      return {
        sent: 0,
        failed: 0,
        skipped: 1,
      };
    }

    const eventName =
      firstDefined(
        event,
        [
          'name',
          'eventName',
          'event_name',
        ]
      ) ||
      'BakersBurns Event';

    const description =
      firstDefined(
        event,
        [
          'description',
          'eventDescription',
          'event_description',
        ]
      );

    const startTime =
      firstDefined(
        occurrence,
        [
          'startTime',
          'start_time',
        ]
      ) ||
      firstDefined(
        event,
        [
          'startTime',
          'start_time',
        ]
      );

    const endTime =
      firstDefined(
        occurrence,
        [
          'endTime',
          'end_time',
        ]
      ) ||
      firstDefined(
        event,
        [
          'endTime',
          'end_time',
        ]
      );

    const definitions =
      getReminderDefinitions(
        occurrenceDate
      );

    const result = {
      sent: 0,
      failed: 0,
      skipped: 0,
    };

    for (
      const definition
      of definitions
    ) {
      const accepted =
        subscription[
          definition.acceptedField
        ] === true;

      const alreadySent =
        subscription[
          definition.sentField
        ] === true;

      /*
       * <= intentionally catches reminders that became due while
       * the server was offline.
       */
      const isDue =
        definition.dueDate <=
        todayDateOnly;

      if (
        !accepted ||
        alreadySent ||
        !isDue
      ) {
        continue;
      }

      try {
        await sendScheduledEventReminder({
          email:
            subscription.email,

          reminderType:
            definition.type,

          eventName,
          occurrenceDate,
          startTime,
          endTime,
          description,
        });

        /*
         * Update the sent flag only after Resend accepts the
         * email for delivery.
         */
        await markReminderAsSent({
          subscription,
          sentField:
            definition.sentField,
        });

        result.sent += 1;

        console.log(
          'Scheduled event reminder sent:',
          {
            subscriptionId:
              subscription.id,

            reminderType:
              definition.type,

            email:
              subscription.email,

            occurrenceDate,
          }
        );
      } catch (error) {
        result.failed += 1;

        console.error(
          'Scheduled event reminder failed:',
          {
            subscriptionId:
              subscription.id,

            reminderType:
              definition.type,

            email:
              subscription.email,

            occurrenceDate,

            message:
              error.message,

            emailResult:
              error.emailResult ||
              null,
          }
        );
      }
    }

    return result;
  };

const runEventNotificationCron =
  async () => {
    if (cronIsRunning) {
      console.log(
        'Event notification cron skipped because the previous run is still active.'
      );

      return {
        skippedBecauseRunning:
          true,
      };
    }

    cronIsRunning = true;

    const summary = {
      subscriptionsChecked: 0,
      remindersSent: 0,
      remindersFailed: 0,
      subscriptionsSkipped: 0,
    };

    try {
      const todayDateOnly =
        getTodayDateOnly();

      const subscriptions =
        await getPendingSubscriptions();

      summary.subscriptionsChecked =
        subscriptions.length;

      for (
        const subscription
        of subscriptions
      ) {
        try {
          const result =
            await processSubscription({
              subscription,
              todayDateOnly,
            });

          summary.remindersSent +=
            result.sent;

          summary.remindersFailed +=
            result.failed;

          summary.subscriptionsSkipped +=
            result.skipped;
        } catch (error) {
          summary.remindersFailed += 1;

          console.error(
            'Unable to process event notification subscription:',
            {
              subscriptionId:
                subscription.id,

              message:
                error.message,

              stack:
                error.stack,
            }
          );
        }
      }

      console.log(
        'Event notification cron completed:',
        {
          date:
            todayDateOnly,

          ...summary,
        }
      );

      return summary;
    } catch (error) {
      console.error(
        'Event notification cron failed:',
        error
      );

      throw error;
    } finally {
      cronIsRunning = false;
    }
  };

/*
 * PM2 cluster mode can start multiple copies of the application.
 * Only instance 0 should own this in-process cron.
 *
 * If NODE_APP_INSTANCE is missing, the application is treated
 * as a normal single-process deployment.
 */
const isPrimaryCronProcess = () => {
  const instance =
    process.env.NODE_APP_INSTANCE;

  return (
    instance === undefined ||
    instance === null ||
    instance === '' ||
    instance === '0'
  );
};

const startEventNotificationCron =
  () => {
    if (!isPrimaryCronProcess()) {
      console.log(
        'Event notification cron disabled for this PM2 instance:',
        {
          instance:
            process.env
              .NODE_APP_INSTANCE,
        }
      );

      return null;
    }

    if (
      !cron.validate(
        CRON_SCHEDULE
      )
    ) {
      throw new Error(
        `Invalid EVENT_NOTIFICATION_CRON_SCHEDULE: ${CRON_SCHEDULE}`
      );
    }

    const task = cron.schedule(
      CRON_SCHEDULE,

      () => {
        runEventNotificationCron()
          .catch((error) => {
            console.error(
              'Unhandled scheduled event notification error:',
              error
            );
          });
      },

      {
        timezone: CRON_TIMEZONE,
      }
    );

    /*
     * Run shortly after startup to catch reminders that became
     * due while the application was offline.
     */
    setTimeout(() => {
      runEventNotificationCron()
        .catch((error) => {
          console.error(
            'Startup event notification check failed:',
            error
          );
        });
    }, STARTUP_DELAY_MS);

    console.log(
      'Event notification cron started:',
      {
        schedule:
          CRON_SCHEDULE,

        timezone:
          CRON_TIMEZONE,

        startupDelayMs:
          STARTUP_DELAY_MS,
      }
    );

    return task;
  };

module.exports = {
  getTodayDateOnly,
  getReminderDefinitions,
  runEventNotificationCron,
  startEventNotificationCron,
};