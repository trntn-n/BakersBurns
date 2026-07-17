// utils/eventNotificationEmails.js
'use strict';

const { Resend } = require('resend');

if (!process.env.RESEND_API_KEY) {
  throw new Error(
    'Missing RESEND_API_KEY environment variable.'
  );
}

const resend = new Resend(
  process.env.RESEND_API_KEY
);

const EVENT_EMAIL_FROM =
  process.env.EVENT_EMAIL_FROM ||
  process.env.EMAIL_FROM ||
  'BakersBurns <notifications@bakersburns.com>';

const FRONTEND_URL =
  process.env.REGISTER_FRONTEND_URL ||
  process.env.FRONTEND_URL ||
  'https://bakersburns.com';

const escapeHtml = (value) => {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
};

const normalizeDateOnly = (value) => {
  if (!value) {
    return '';
  }

  const match = String(value)
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})/);

  return match ? match[1] : '';
};

const normalizeTimeOnly = (value) => {
  if (!value) {
    return '';
  }

  const match = String(value)
    .trim()
    .match(/^(\d{2}:\d{2})/);

  return match ? match[1] : '';
};

const formatDate = (value) => {
  const dateOnly = normalizeDateOnly(value);

  if (!dateOnly) {
    return '';
  }

  const [
    year,
    month,
    day,
  ] = dateOnly
    .split('-')
    .map(Number);

  const date = new Date(
    year,
    month - 1,
    day
  );

  return new Intl.DateTimeFormat(
    'en-US',
    {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }
  ).format(date);
};

const formatTime = (value) => {
  const timeOnly = normalizeTimeOnly(value);

  if (!timeOnly) {
    return '';
  }

  const [hour, minute] = timeOnly
    .split(':')
    .map(Number);

  const date = new Date();

  date.setHours(
    hour,
    minute,
    0,
    0
  );

  return new Intl.DateTimeFormat(
    'en-US',
    {
      hour: 'numeric',
      minute: '2-digit',
    }
  ).format(date);
};

const buildEventDetailsHtml = ({
  eventName,
  eventDate,
  startTime,
  endTime,
  location,
}) => {
  const formattedDate =
    formatDate(eventDate);

  const formattedStartTime =
    formatTime(startTime);

  const formattedEndTime =
    formatTime(endTime);

  const formattedTime =
    formattedStartTime
      ? formattedEndTime
        ? `${formattedStartTime} – ${formattedEndTime}`
        : formattedStartTime
      : '';

  return `
    <div
      style="
        margin: 24px 0;
        padding: 20px;
        border-radius: 12px;
        background: #f6f2eb;
        border: 1px solid #ded5c8;
      "
    >
      <h2
        style="
          margin: 0 0 12px;
          color: #2f2118;
          font-size: 22px;
        "
      >
        ${escapeHtml(eventName)}
      </h2>

      ${
        formattedDate
          ? `
            <p style="margin: 8px 0;">
              <strong>Date:</strong>
              ${escapeHtml(formattedDate)}
            </p>
          `
          : ''
      }

      ${
        formattedTime
          ? `
            <p style="margin: 8px 0;">
              <strong>Time:</strong>
              ${escapeHtml(formattedTime)}
            </p>
          `
          : ''
      }

      ${
        location
          ? `
            <p style="margin: 8px 0;">
              <strong>Location:</strong>
              ${escapeHtml(location)}
            </p>
          `
          : ''
      }
    </div>
  `;
};

const buildReminderEmailHtml = ({
  heading,
  introduction,
  eventName,
  eventDate,
  startTime,
  endTime,
  location,
}) => {
  const eventDetailsHtml =
    buildEventDetailsHtml({
      eventName,
      eventDate,
      startTime,
      endTime,
      location,
    });

  return `
    <!doctype html>

    <html lang="en">
      <head>
        <meta charset="utf-8" />

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />

        <title>
          ${escapeHtml(heading)}
        </title>
      </head>

      <body
        style="
          margin: 0;
          padding: 0;
          background: #eee8de;
          font-family: Arial, Helvetica, sans-serif;
          color: #2f2118;
        "
      >
        <div
          style="
            width: 100%;
            padding: 32px 16px;
            box-sizing: border-box;
          "
        >
          <div
            style="
              max-width: 620px;
              margin: 0 auto;
              padding: 32px;
              box-sizing: border-box;
              background: #ffffff;
              border-radius: 14px;
              border: 1px solid #ded5c8;
            "
          >
            <h1
              style="
                margin: 0 0 18px;
                font-size: 28px;
                line-height: 1.25;
                color: #2f2118;
              "
            >
              ${escapeHtml(heading)}
            </h1>

            <p
              style="
                margin: 0;
                font-size: 16px;
                line-height: 1.6;
              "
            >
              ${escapeHtml(introduction)}
            </p>

            ${eventDetailsHtml}

            <div
              style="
                margin-top: 28px;
                text-align: center;
              "
            >
              <a
                href="${escapeHtml(
                  `${FRONTEND_URL}/events`
                )}"
                style="
                  display: inline-block;
                  padding: 13px 22px;
                  border-radius: 8px;
                  background: #5f3d2e;
                  color: #ffffff;
                  text-decoration: none;
                  font-weight: bold;
                "
              >
                View event details
              </a>
            </div>

            <p
              style="
                margin: 28px 0 0;
                color: #6d6259;
                font-size: 13px;
                line-height: 1.5;
              "
            >
              You are receiving this message because you
              requested event reminders after completing
              your purchase.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
};

const sendReminderEmail = async ({
  to,
  subject,
  heading,
  introduction,
  eventName,
  eventDate,
  startTime,
  endTime,
  location,
}) => {
  if (!to) {
    throw new Error(
      'A recipient email address is required.'
    );
  }

  if (!eventName) {
    throw new Error(
      'An event name is required.'
    );
  }

  const html = buildReminderEmailHtml({
    heading,
    introduction,
    eventName,
    eventDate,
    startTime,
    endTime,
    location,
  });

  const response = await resend.emails.send({
    from: EVENT_EMAIL_FROM,
    to,
    subject,
    html,
  });

  if (response.error) {
    throw new Error(
      response.error.message ||
      'Resend failed to deliver the event reminder.'
    );
  }

  return response.data;
};

/*
 * One-month reminder email.
 */
const sendEventOneMonthReminder = async ({
  email,
  eventName,
  eventDate,
  startTime,
  endTime,
  location,
}) => {
  return sendReminderEmail({
    to: email,

    subject:
      `One month until ${eventName}`,

    heading:
      'Your event is one month away',

    introduction:
      `This is your requested reminder that ${eventName} is coming up in approximately one month.`,

    eventName,
    eventDate,
    startTime,
    endTime,
    location,
  });
};

/*
 * One-week reminder email.
 */
const sendEventOneWeekReminder = async ({
  email,
  eventName,
  eventDate,
  startTime,
  endTime,
  location,
}) => {
  return sendReminderEmail({
    to: email,

    subject:
      `One week until ${eventName}`,

    heading:
      'Your event is one week away',

    introduction:
      `This is your requested reminder that ${eventName} is coming up in approximately one week.`,

    eventName,
    eventDate,
    startTime,
    endTime,
    location,
  });
};

/*
 * One-day reminder email.
 */
const sendEventOneDayReminder = async ({
  email,
  eventName,
  eventDate,
  startTime,
  endTime,
  location,
}) => {
  return sendReminderEmail({
    to: email,

    subject:
      `${eventName} is tomorrow`,

    heading:
      'Your event is tomorrow',

    introduction:
      `This is your requested reminder that ${eventName} is scheduled for tomorrow.`,

    eventName,
    eventDate,
    startTime,
    endTime,
    location,
  });
};
/*
 * Confirmation email sent immediately after the customer
 * successfully subscribes to event reminders.
 *
 * This is not one of the scheduled reminder emails.
 */
const sendEventReminderSubscriptionConfirmation =
  async ({
    email,
    eventName,
    eventDates = [],
    reminderFrequencies = [],
  }) => {
    if (!email) {
      throw new Error(
        'A recipient email address is required.'
      );
    }

    if (!eventName) {
      throw new Error(
        'An event name is required.'
      );
    }

    const normalizedDates =
      Array.isArray(eventDates)
        ? eventDates
            .map((date) => formatDate(date))
            .filter(Boolean)
        : [];

    const normalizedFrequencies =
      Array.isArray(reminderFrequencies)
        ? reminderFrequencies.filter(Boolean)
        : [];

    const dateListHtml =
      normalizedDates.length > 0
        ? `
          <ul
            style="
              margin: 12px 0 0;
              padding-left: 22px;
              line-height: 1.7;
            "
          >
            ${normalizedDates
              .map(
                (date) => `
                  <li>
                    ${escapeHtml(date)}
                  </li>
                `
              )
              .join('')}
          </ul>
        `
        : `
          <p style="margin: 12px 0 0;">
            The event dates will be included in your
            future reminder emails.
          </p>
        `;

    const frequencyListHtml =
      normalizedFrequencies.length > 0
        ? `
          <ul
            style="
              margin: 12px 0 0;
              padding-left: 22px;
              line-height: 1.7;
            "
          >
            ${normalizedFrequencies
              .map(
                (frequency) => `
                  <li>
                    ${escapeHtml(frequency)}
                  </li>
                `
              )
              .join('')}
          </ul>
        `
        : `
          <p style="margin: 12px 0 0;">
            No reminder frequencies were selected.
          </p>
        `;

    const html = `
      <!doctype html>

      <html lang="en">
        <head>
          <meta charset="utf-8" />

          <meta
            name="viewport"
            content="width=device-width, initial-scale=1"
          />

          <title>
            Event reminder subscription confirmed
          </title>
        </head>

        <body
          style="
            margin: 0;
            padding: 0;
            background: #eee8de;
            font-family: Arial, Helvetica, sans-serif;
            color: #2f2118;
          "
        >
          <div
            style="
              width: 100%;
              padding: 32px 16px;
              box-sizing: border-box;
            "
          >
            <div
              style="
                max-width: 620px;
                margin: 0 auto;
                padding: 32px;
                box-sizing: border-box;
                background: #ffffff;
                border-radius: 14px;
                border: 1px solid #ded5c8;
              "
            >
              <h1
                style="
                  margin: 0 0 18px;
                  color: #2f2118;
                  font-size: 28px;
                  line-height: 1.25;
                "
              >
                Your reminder request was received
              </h1>

              <p
                style="
                  margin: 0;
                  font-size: 16px;
                  line-height: 1.6;
                "
              >
                You are subscribed to receive reminder
                emails for
                <strong>
                  ${escapeHtml(eventName)}
                </strong>.
              </p>

              <div
                style="
                  margin: 24px 0;
                  padding: 20px;
                  border-radius: 12px;
                  background: #f6f2eb;
                  border: 1px solid #ded5c8;
                "
              >
                <h2
                  style="
                    margin: 0;
                    color: #2f2118;
                    font-size: 20px;
                  "
                >
                  Event dates
                </h2>

                ${dateListHtml}
              </div>

              <div
                style="
                  margin: 24px 0;
                  padding: 20px;
                  border-radius: 12px;
                  background: #f6f2eb;
                  border: 1px solid #ded5c8;
                "
              >
                <h2
                  style="
                    margin: 0;
                    color: #2f2118;
                    font-size: 20px;
                  "
                >
                  Requested reminders
                </h2>

                ${frequencyListHtml}
              </div>

              <p
                style="
                  margin: 0;
                  font-size: 15px;
                  line-height: 1.6;
                "
              >
                We will send the selected reminders as
                each event date approaches.
              </p>

              <div
                style="
                  margin-top: 28px;
                  text-align: center;
                "
              >
                <a
                  href="${escapeHtml(
                    `${FRONTEND_URL}/events`
                  )}"
                  style="
                    display: inline-block;
                    padding: 13px 22px;
                    border-radius: 8px;
                    background: #5f3d2e;
                    color: #ffffff;
                    text-decoration: none;
                    font-weight: bold;
                  "
                >
                  View events
                </a>
              </div>

              <p
                style="
                  margin: 28px 0 0;
                  color: #6d6259;
                  font-size: 13px;
                  line-height: 1.5;
                "
              >
                This email confirms that BakersBurns
                received your event reminder preferences.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const response = await resend.emails.send({
      from: EVENT_EMAIL_FROM,
      to: email,

      subject:
        `Reminder preferences confirmed for ${eventName}`,

      html,
    });

    if (response.error) {
      throw new Error(
        response.error.message ||
        'Resend failed to deliver the reminder confirmation.'
      );
    }

    return response.data;
  };
module.exports = {
  sendEventOneMonthReminder,
  sendEventOneWeekReminder,
  sendEventOneDayReminder,
  sendEventReminderSubscriptionConfirmation
};