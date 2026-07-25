'use strict';

const {
  EMAIL_SEND_TYPES,
  sendEmailRequest,
} = require(
  '../../email/emailResendController'
);

const {FROM_ADDRESSES} = require('../email-constants');

const escapeHtml = (value) => {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
};

const parseDateOnly = (value) => {
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

const formatEventDate = (value) => {
  const date = parseDateOnly(value);

  if (!date) {
    return String(value || '');
  }

  return new Intl.DateTimeFormat(
    'en-US',
    {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }
  ).format(date);
};

const formatEventTime = (value) => {
  if (!value) {
    return '';
  }

  const normalizedTime = String(value)
    .trim()
    .slice(0, 8);

  const match = normalizedTime.match(
    /^(\d{2}):(\d{2})(?::\d{2})?$/
  );

  if (!match) {
    return String(value);
  }

  const [, hours, minutes] = match;

  const date = new Date(
    Date.UTC(
      2000,
      0,
      1,
      Number(hours),
      Number(minutes)
    )
  );

  return new Intl.DateTimeFormat(
    'en-US',
    {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    }
  ).format(date);
};

const buildReminderHeading = (
  reminderType
) => {
  switch (reminderType) {
    case 'one-month':
      return 'Your event is coming up next month';

    case 'one-week':
      return 'Your event is one week away';

    case 'one-day':
      return 'Your event is tomorrow';

    default:
      return 'Your event is coming up';
  }
};

const buildReminderSubject = ({
  reminderType,
  eventName,
}) => {
  switch (reminderType) {
    case 'one-month':
      return `One-month reminder: ${eventName}`;

    case 'one-week':
      return `One-week reminder: ${eventName}`;

    case 'one-day':
      return `Tomorrow: ${eventName}`;

    default:
      return `Event reminder: ${eventName}`;
  }
};

const buildScheduledReminderHtml = ({
  reminderType,
  eventName,
  occurrenceDate,
  startTime,
  endTime,
  description,
}) => {
  const heading =
    buildReminderHeading(reminderType);

  const formattedDate =
    formatEventDate(occurrenceDate);

  const formattedStartTime =
    formatEventTime(startTime);

  const formattedEndTime =
    formatEventTime(endTime);

  let formattedTime = '';

  if (
    formattedStartTime &&
    formattedEndTime
  ) {
    formattedTime =
      `${formattedStartTime} – ${formattedEndTime}`;
  } else {
    formattedTime =
      formattedStartTime ||
      formattedEndTime;
  }

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />
        <title>${escapeHtml(heading)}</title>
      </head>

      <body
        style="
          margin: 0;
          padding: 0;
          background-color: #f7f2ea;
          font-family: Arial, Helvetica, sans-serif;
          color: #342b27;
        "
      >
        <table
          role="presentation"
          width="100%"
          cellspacing="0"
          cellpadding="0"
          border="0"
          style="
            width: 100%;
            background-color: #f7f2ea;
          "
        >
          <tr>
            <td
              align="center"
              style="padding: 32px 16px;"
            >
              <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                border="0"
                style="
                  width: 100%;
                  max-width: 620px;
                  overflow: hidden;
                  background-color: #ffffff;
                  border: 1px solid #e5d8ca;
                  border-radius: 18px;
                  box-shadow: 0 12px 30px rgba(52, 43, 39, 0.08);
                "
              >
                <tr>
                  <td
                    style="
                      padding: 34px 30px;
                      text-align: center;
                      background-color: #694c3b;
                      color: #ffffff;
                    "
                  >
                    <p
                      style="
                        margin: 0 0 8px;
                        font-size: 13px;
                        font-weight: 700;
                        letter-spacing: 2px;
                        text-transform: uppercase;
                      "
                    >
                      BakersBurns Event Reminder
                    </p>

                    <h1
                      style="
                        margin: 0;
                        font-size: 28px;
                        line-height: 1.25;
                      "
                    >
                      ${escapeHtml(heading)}
                    </h1>
                  </td>
                </tr>

                <tr>
                  <td style="padding: 32px 30px;">
                    <p
                      style="
                        margin: 0 0 24px;
                        font-size: 16px;
                        line-height: 1.7;
                      "
                    >
                      This is the event update you requested
                      for the following BakersBurns event.
                    </p>

                    <table
                      role="presentation"
                      width="100%"
                      cellspacing="0"
                      cellpadding="0"
                      border="0"
                      style="
                        width: 100%;
                        background-color: #fbf7f2;
                        border: 1px solid #eadfd5;
                        border-radius: 14px;
                      "
                    >
                      <tr>
                        <td style="padding: 24px;">
                          <h2
                            style="
                              margin: 0 0 16px;
                              color: #694c3b;
                              font-size: 23px;
                              line-height: 1.3;
                            "
                          >
                            ${escapeHtml(eventName)}
                          </h2>

                          <p
                            style="
                              margin: 0 0 8px;
                              font-size: 16px;
                              line-height: 1.5;
                            "
                          >
                            <strong>Date:</strong>
                            ${escapeHtml(formattedDate)}
                          </p>

                          ${
                            formattedTime
                              ? `
                                <p
                                  style="
                                    margin: 0 0 8px;
                                    font-size: 16px;
                                    line-height: 1.5;
                                  "
                                >
                                  <strong>Time:</strong>
                                  ${escapeHtml(formattedTime)}
                                </p>
                              `
                              : ''
                          }

                          ${
                            description
                              ? `
                                <p
                                  style="
                                    margin: 18px 0 0;
                                    font-size: 15px;
                                    line-height: 1.65;
                                    color: #625650;
                                  "
                                >
                                  ${escapeHtml(description)}
                                </p>
                              `
                              : ''
                          }
                        </td>
                      </tr>
                    </table>

                    <p
                      style="
                        margin: 24px 0 0;
                        font-size: 14px;
                        line-height: 1.6;
                        color: #756962;
                      "
                    >
                      You received this email because you
                      requested updates for this event date.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td
                    style="
                      padding: 20px 30px;
                      text-align: center;
                      background-color: #f0e5da;
                      color: #6c5e57;
                      font-size: 13px;
                      line-height: 1.5;
                    "
                  >
                    BakersBurns
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
};

const sendScheduledEventReminder =
  async ({
    email,
    reminderType,
    eventName,
    occurrenceDate,
    startTime = null,
    endTime = null,
    description = null,
  }) => {
    const normalizedEmail = String(
      email || ''
    )
      .trim()
      .toLowerCase();

    const normalizedEventName =
      String(
        eventName ||
          'BakersBurns Event'
      ).trim();

    const result =
      await sendEmailRequest({
        type:
          EMAIL_SEND_TYPES.DIRECT_USER,

        recipient: normalizedEmail,

        from: FROM_ADDRESSES.EVENT_UPDATE,

        replyTo:
          process.env
            .EVENT_EMAIL_REPLY_TO ||
          process.env.ADMIN_EMAIL ||
          null,

        subject:
          buildReminderSubject({
            reminderType,
            eventName:
              normalizedEventName,
          }),

        html:
          buildScheduledReminderHtml({
            reminderType,
            eventName:
              normalizedEventName,
            occurrenceDate,
            startTime,
            endTime,
            description,
          }),
      });

    /*
     * sendEmailRequest does not necessarily throw when Resend
     * rejects a message. Its returned result must be checked.
     */
    if (
      !result.success ||
      result.successfulCount !== 1
    ) {
      const error = new Error(
        `Unable to send the ${reminderType} event reminder.`
      );

      error.emailResult = result;

      throw error;
    }

    return result;
  };

module.exports = {
  sendScheduledEventReminder,
};