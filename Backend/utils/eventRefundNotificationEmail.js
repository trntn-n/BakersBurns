// utils/eventRefundNotificationEmail.js
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

const DEFAULT_FROM_EMAIL =
  process.env.EVENT_EMAIL_FROM ||
  process.env.RESEND_FROM_EMAIL ||
  'Bakers Burns <events@bakersburns.com>';

const DEFAULT_REPLY_TO =
  process.env.EVENT_REPLY_TO_EMAIL ||
  process.env.REPLY_TO_EMAIL ||
  null;

/**
 * Escape user-controlled values before inserting them
 * into an HTML email.
 *
 * @param {*} value
 * @returns {string}
 */
const escapeHtml = (value) => {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
};

/**
 * Normalize a money amount stored in Stripe's smallest
 * currency unit.
 *
 * Examples:
 * 1500 USD => $15.00
 * 1500 EUR => €15.00
 *
 * @param {number|string|null} amount
 * @param {string|null} currency
 * @returns {string}
 */
const formatStripeAmount = (
  amount,
  currency = 'usd'
) => {
  const parsedAmount = Number(amount);

  if (!Number.isFinite(parsedAmount)) {
    return '';
  }

  const normalizedCurrency =
    String(currency || 'usd')
      .trim()
      .toUpperCase();

  try {
    return new Intl.NumberFormat(
      'en-US',
      {
        style: 'currency',
        currency: normalizedCurrency,
      }
    ).format(parsedAmount / 100);
  } catch (error) {
    return `${(
      parsedAmount / 100
    ).toFixed(2)} ${normalizedCurrency}`;
  }
};

/**
 * Format an event date without shifting the calendar day
 * because of UTC conversion.
 *
 * @param {string|Date|null} value
 * @returns {string}
 */
const formatEventDate = (value) => {
  if (!value) {
    return '';
  }

  const stringValue = String(value);
  const dateMatch = stringValue.match(
    /^(\d{4})-(\d{2})-(\d{2})/
  );

  if (!dateMatch) {
    return stringValue;
  }

  const [, year, month, day] =
    dateMatch;

  const localDate = new Date(
    Number(year),
    Number(month) - 1,
    Number(day)
  );

  if (
    Number.isNaN(
      localDate.getTime()
    )
  ) {
    return stringValue;
  }

  return new Intl.DateTimeFormat(
    'en-US',
    {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }
  ).format(localDate);
};

/**
 * Format a stored event time.
 *
 * @param {string|null} value
 * @returns {string}
 */
const formatEventTime = (value) => {
  if (!value) {
    return '';
  }

  const match = String(value).match(
    /^(\d{1,2}):(\d{2})/
  );

  if (!match) {
    return String(value);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes)
  ) {
    return String(value);
  }

  const time = new Date();
  time.setHours(
    hours,
    minutes,
    0,
    0
  );

  return new Intl.DateTimeFormat(
    'en-US',
    {
      hour: 'numeric',
      minute: '2-digit',
    }
  ).format(time);
};

/**
 * Create a text-only version of the cancellation email.
 *
 * @param {object} params
 * @returns {string}
 */
const buildEventRefundText = ({
  customerName,
  eventName,
  eventDate,
  eventStartTime,
  refundAmount,
  refundId,
  supportEmail,
}) => {
  const greeting = customerName
    ? `Hello ${customerName},`
    : 'Hello,';

  const eventDateLine = eventDate
    ? `Event date: ${eventDate}${
        eventStartTime
          ? ` at ${eventStartTime}`
          : ''
      }`
    : '';

  const refundAmountLine =
    refundAmount
      ? `Refund amount: ${refundAmount}`
      : '';

  const refundReferenceLine =
    refundId
      ? `Refund reference: ${refundId}`
      : '';

  const supportLine =
    supportEmail
      ? `If you have any questions, contact us at ${supportEmail}.`
      : 'If you have any questions, reply to this email.';

  return [
    greeting,
    '',
    `We are sorry to let you know that "${eventName}" has been cancelled.`,
    '',
    eventDateLine,
    '',
    'Your ticket payment has been refunded to the original payment method.',
    '',
    refundAmountLine,
    refundReferenceLine,
    '',
    'Most refunds appear within 5–10 business days. The exact timing depends on your bank or card issuer.',
    '',
    'If the original charge is still pending, the refund may appear as a reversal and the original charge may disappear instead of appearing as a separate refund.',
    '',
    supportLine,
    '',
    'We apologize for the inconvenience.',
    '',
    'Bakers Burns',
  ]
    .filter(
      (line, index, lines) => {
        if (line !== '') {
          return true;
        }

        return (
          index > 0 &&
          lines[index - 1] !== ''
        );
      }
    )
    .join('\n');
};

/**
 * Create the HTML cancellation email.
 *
 * @param {object} params
 * @returns {string}
 */
const buildEventRefundHtml = ({
  customerName,
  eventName,
  eventDate,
  eventStartTime,
  refundAmount,
  refundId,
  supportEmail,
}) => {
  const safeCustomerName =
    escapeHtml(customerName);

  const safeEventName =
    escapeHtml(eventName);

  const safeEventDate =
    escapeHtml(eventDate);

  const safeEventStartTime =
    escapeHtml(eventStartTime);

  const safeRefundAmount =
    escapeHtml(refundAmount);

  const safeRefundId =
    escapeHtml(refundId);

  const safeSupportEmail =
    escapeHtml(supportEmail);

  const greeting = safeCustomerName
    ? `Hello ${safeCustomerName},`
    : 'Hello,';

  const eventDateMarkup =
    safeEventDate
      ? `
        <tr>
          <td
            style="
              padding: 8px 0;
              color: #666666;
              font-size: 14px;
              vertical-align: top;
            "
          >
            Event date
          </td>

          <td
            style="
              padding: 8px 0;
              color: #222222;
              font-size: 14px;
              font-weight: 600;
              text-align: right;
              vertical-align: top;
            "
          >
            ${safeEventDate}${
              safeEventStartTime
                ? `<br>${safeEventStartTime}`
                : ''
            }
          </td>
        </tr>
      `
      : '';

  const refundAmountMarkup =
    safeRefundAmount
      ? `
        <tr>
          <td
            style="
              padding: 8px 0;
              color: #666666;
              font-size: 14px;
              vertical-align: top;
            "
          >
            Refund amount
          </td>

          <td
            style="
              padding: 8px 0;
              color: #222222;
              font-size: 14px;
              font-weight: 600;
              text-align: right;
              vertical-align: top;
            "
          >
            ${safeRefundAmount}
          </td>
        </tr>
      `
      : '';

  const refundIdMarkup =
    safeRefundId
      ? `
        <tr>
          <td
            style="
              padding: 8px 0;
              color: #666666;
              font-size: 14px;
              vertical-align: top;
            "
          >
            Refund reference
          </td>

          <td
            style="
              padding: 8px 0;
              color: #222222;
              font-family: monospace;
              font-size: 12px;
              text-align: right;
              vertical-align: top;
              word-break: break-all;
            "
          >
            ${safeRefundId}
          </td>
        </tr>
      `
      : '';

  const supportMarkup =
    safeSupportEmail
      ? `
        If you have any questions, email
        <a
          href="mailto:${safeSupportEmail}"
          style="
            color: #7a402b;
            font-weight: 600;
          "
        >
          ${safeSupportEmail}
        </a>.
      `
      : `
        If you have any questions, reply to
        this email.
      `;

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        >

        <title>
          Event cancellation and refund
        </title>
      </head>

      <body
        style="
          margin: 0;
          padding: 0;
          background-color: #f5f1ec;
          color: #222222;
          font-family:
            Arial,
            Helvetica,
            sans-serif;
        "
      >
        <div
          style="
            display: none;
            max-height: 0;
            overflow: hidden;
            opacity: 0;
          "
        >
          ${safeEventName} has been cancelled
          and your payment has been refunded.
        </div>

        <table
          role="presentation"
          width="100%"
          cellspacing="0"
          cellpadding="0"
          border="0"
          style="
            width: 100%;
            background-color: #f5f1ec;
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
                  border: 1px solid #e5ddd5;
                  border-radius: 14px;
                  box-shadow:
                    0 8px 28px
                    rgba(0, 0, 0, 0.06);
                "
              >
                <tr>
                  <td
                    style="
                      padding: 28px 32px;
                      background-color: #3c2118;
                      color: #ffffff;
                    "
                  >
                    <p
                      style="
                        margin: 0 0 8px;
                        color: #dcc8bc;
                        font-size: 12px;
                        font-weight: 700;
                        letter-spacing: 1.5px;
                        text-transform: uppercase;
                      "
                    >
                      Event update
                    </p>

                    <h1
                      style="
                        margin: 0;
                        font-size: 26px;
                        line-height: 1.25;
                      "
                    >
                      Event cancelled
                    </h1>
                  </td>
                </tr>

                <tr>
                  <td style="padding: 32px;">
                    <p
                      style="
                        margin: 0 0 18px;
                        font-size: 16px;
                        line-height: 1.6;
                      "
                    >
                      ${greeting}
                    </p>

                    <p
                      style="
                        margin: 0 0 18px;
                        font-size: 16px;
                        line-height: 1.6;
                      "
                    >
                      We are sorry to let you know
                      that
                      <strong>
                        ${safeEventName}
                      </strong>
                      has been cancelled.
                    </p>

                    <p
                      style="
                        margin: 0 0 24px;
                        font-size: 16px;
                        line-height: 1.6;
                      "
                    >
                      Your ticket payment has been
                      refunded to the original
                      payment method.
                    </p>

                    <table
                      role="presentation"
                      width="100%"
                      cellspacing="0"
                      cellpadding="0"
                      border="0"
                      style="
                        margin: 0 0 24px;
                        padding: 18px;
                        background-color: #faf7f4;
                        border: 1px solid #eadfd7;
                        border-radius: 10px;
                      "
                    >
                      <tr>
                        <td
                          colspan="2"
                          style="
                            padding: 0 0 10px;
                            color: #3c2118;
                            font-size: 16px;
                            font-weight: 700;
                          "
                        >
                          Refund details
                        </td>
                      </tr>

                      <tr>
                        <td
                          style="
                            padding: 8px 0;
                            color: #666666;
                            font-size: 14px;
                            vertical-align: top;
                          "
                        >
                          Event
                        </td>

                        <td
                          style="
                            padding: 8px 0;
                            color: #222222;
                            font-size: 14px;
                            font-weight: 600;
                            text-align: right;
                            vertical-align: top;
                          "
                        >
                          ${safeEventName}
                        </td>
                      </tr>

                      ${eventDateMarkup}
                      ${refundAmountMarkup}
                      ${refundIdMarkup}
                    </table>

                    <div
                      style="
                        margin: 0 0 24px;
                        padding: 18px;
                        background-color: #fff7df;
                        border: 1px solid #eed894;
                        border-radius: 10px;
                      "
                    >
                      <p
                        style="
                          margin: 0 0 8px;
                          color: #554310;
                          font-size: 15px;
                          font-weight: 700;
                        "
                      >
                        When will the refund arrive?
                      </p>

                      <p
                        style="
                          margin: 0;
                          color: #554310;
                          font-size: 14px;
                          line-height: 1.6;
                        "
                      >
                        Most refunds appear within
                        5–10 business days. The
                        exact timing depends on your
                        bank or card issuer.
                      </p>
                    </div>

                    <p
                      style="
                        margin: 0 0 18px;
                        color: #555555;
                        font-size: 14px;
                        line-height: 1.6;
                      "
                    >
                      In some cases, the original
                      charge may disappear from your
                      statement instead of a separate
                      refund appearing.
                    </p>

                    <p
                      style="
                        margin: 0 0 18px;
                        font-size: 15px;
                        line-height: 1.6;
                      "
                    >
                      ${supportMarkup}
                    </p>

                    <p
                      style="
                        margin: 0;
                        font-size: 15px;
                        line-height: 1.6;
                      "
                    >
                      We apologize for the
                      inconvenience.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td
                    style="
                      padding: 20px 32px;
                      background-color: #f8f4f0;
                      border-top: 1px solid #e8dfd8;
                      color: #777777;
                      font-size: 12px;
                      line-height: 1.5;
                    "
                  >
                    This is a transactional email
                    regarding your event purchase
                    and refund.
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

/**
 * Send one event cancellation/refund notification.
 *
 * Call this only after Stripe reports that the refund
 * succeeded.
 *
 * @param {object} options
 * @param {string} options.to
 * @param {string|null} [options.customerName]
 * @param {string} options.eventName
 * @param {string|Date|null} [options.eventDate]
 * @param {string|null} [options.eventStartTime]
 * @param {number|string|null} [options.refundAmount]
 * @param {string|null} [options.currency]
 * @param {string|null} [options.refundId]
 * @param {string|null} [options.supportEmail]
 * @returns {Promise<object>}
 */
const sendEventRefundNotificationEmail =
  async ({
    to,
    customerName = null,
    eventName,
    eventDate = null,
    eventStartTime = null,
    refundAmount = null,
    currency = 'usd',
    refundId = null,
    supportEmail =
      process.env.EVENT_SUPPORT_EMAIL ||
      process.env.ADMIN_EMAIL ||
      null,
  }) => {
    if (
      typeof to !== 'string' ||
      !to.trim()
    ) {
      throw new Error(
        'A customer email address is required.'
      );
    }

    if (
      typeof eventName !== 'string' ||
      !eventName.trim()
    ) {
      throw new Error(
        'An event name is required.'
      );
    }

    const normalizedEmail =
      to.trim().toLowerCase();

    const normalizedEventName =
      eventName.trim();

    const formattedDate =
      formatEventDate(eventDate);

    const formattedStartTime =
      formatEventTime(eventStartTime);

    const formattedRefundAmount =
      refundAmount === null ||
      refundAmount === undefined
        ? ''
        : formatStripeAmount(
            refundAmount,
            currency
          );

    const emailData = {
      customerName,
      eventName:
        normalizedEventName,
      eventDate:
        formattedDate,
      eventStartTime:
        formattedStartTime,
      refundAmount:
        formattedRefundAmount,
      refundId,
      supportEmail,
    };

    const payload = {
      from: DEFAULT_FROM_EMAIL,
      to: [normalizedEmail],
      subject:
        `Cancelled: ${normalizedEventName} — refund issued`,
      html:
        buildEventRefundHtml(emailData),
      text:
        buildEventRefundText(emailData),
    };

    if (DEFAULT_REPLY_TO) {
      payload.replyTo =
        DEFAULT_REPLY_TO;
    }

    const {
      data,
      error,
    } = await resend.emails.send(
      payload
    );

    if (error) {
      const resendError =
        new Error(
          error.message ||
          'Unable to send the event refund notification.'
        );

      resendError.code =
        error.name ||
        'resend_email_error';

      resendError.details =
        error;

      throw resendError;
    }

    return {
      success: true,
      emailId: data?.id || null,
      recipient:
        normalizedEmail,
    };
  };

/**
 * Send refund notifications without failing the entire
 * batch when one email fails.
 *
 * @param {object[]} notifications
 * @returns {Promise<{
 *   success: boolean,
 *   sent: object[],
 *   failed: object[]
 * }>}
 */
const sendEventRefundNotificationBatch =
  async (notifications = []) => {
    if (!Array.isArray(notifications)) {
      throw new TypeError(
        'notifications must be an array.'
      );
    }

    const sent = [];
    const failed = [];

    for (
      const notification
      of notifications
    ) {
      try {
        const result =
          await sendEventRefundNotificationEmail(
            notification
          );

        sent.push(result);
      } catch (error) {
        failed.push({
          recipient:
            notification?.to ||
            null,
          refundId:
            notification?.refundId ||
            null,
          message:
            error.message,
        });
      }
    }

    return {
      success:
        failed.length === 0,
      sent,
      failed,
    };
  };

module.exports = {
  sendEventRefundNotificationEmail,
  sendEventRefundNotificationBatch,
  buildEventRefundHtml,
  buildEventRefundText,
  formatStripeAmount,
};