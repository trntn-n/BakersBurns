
// services/email/eventRefundAdminEmailService.js
'use strict';

const { Resend } = require('resend');

const User = require(
  '../../../models/user'
);

const resendApiKey =
  process.env.RESEND_API_KEY;

const resendFromEmail =
  process.env.EVENT_EMAIL_FROM ||
  process.env.RESEND_FROM_EMAIL ||
  process.env.EMAIL_FROM ||
  'Bakers Burns <events@bakersburns.com>';

const adminFrontendUrl = String(
  process.env.ADMIN_FRONTEND_URL ||
    process.env.ADMIN_URL ||
    ''
).trim();

/*
 * Only initialize Resend when an API key exists.
 *
 * This prevents the entire application from crashing
 * during startup if email configuration is temporarily
 * unavailable.
 */
const resend = resendApiKey
  ? new Resend(resendApiKey)
  : null;

/**
 * Normalize an email address for comparisons and
 * duplicate removal.
 *
 * @param {unknown} value
 * @returns {string}
 */
const normalizeEmail = (
  value
) => {
  return String(value || '')
    .trim()
    .toLowerCase();
};

/**
 * Escape user-controlled text before placing it into
 * an HTML email.
 *
 * @param {unknown} value
 * @returns {string}
 */
const escapeHtml = (
  value
) => {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
};

/**
 * Format a Stripe amount stored in the smallest
 * currency unit, such as cents.
 *
 * @param {unknown} amount
 * @param {unknown} currency
 * @returns {string}
 */
const formatCurrency = (
  amount,
  currency = 'usd'
) => {
  const numericAmount =
    Number(amount);

  const normalizedCurrency =
    String(currency || 'usd')
      .trim()
      .toUpperCase();

  if (
    !Number.isFinite(
      numericAmount
    )
  ) {
    return `0.00 ${normalizedCurrency}`;
  }

  try {
    return new Intl.NumberFormat(
      'en-US',
      {
        style: 'currency',
        currency:
          normalizedCurrency,
      }
    ).format(
      numericAmount / 100
    );
  } catch (error) {
    return (
      `${(
        numericAmount / 100
      ).toFixed(2)} ` +
      normalizedCurrency
    );
  }
};

/**
 * Get all email addresses that should receive
 * administrative notifications.
 *
 * Includes:
 *
 * 1. Users whose role is "admin".
 * 2. The optional ADMIN_EMAIL environment variable.
 *
 * ADMIN_EMAIL may contain one address or a
 * comma-separated list of addresses.
 *
 * @returns {Promise<string[]>}
 */
const getAdminEmailAddresses =
  async () => {
    const adminUsers =
      await User.findAll({
        where: {
          role: 'admin',
        },
        attributes: [
          'email',
        ],
        raw: true,
      });

    const databaseEmails =
      adminUsers.map(
        (adminUser) =>
          normalizeEmail(
            adminUser.email
          )
      );

    const configuredEmails =
      String(
        process.env.ADMIN_EMAIL ||
          ''
      )
        .split(',')
        .map(normalizeEmail);

    return [
      ...new Set([
        ...databaseEmails,
        ...configuredEmails,
      ]),
    ].filter(Boolean);
  };

/**
 * Build the optional link to the admin refund request
 * page.
 *
 * The exact frontend route can be updated later when
 * the admin refund UI is implemented.
 *
 * @param {number|string} refundRequestId
 * @returns {string|null}
 */
const buildAdminRefundUrl = (
  refundRequestId
) => {
  if (!adminFrontendUrl) {
    return null;
  }

  const baseUrl =
    adminFrontendUrl.replace(
      /\/+$/,
      ''
    );

  return (
    `${baseUrl}` +
    `/event-refunds/${encodeURIComponent(
      refundRequestId
    )}`
  );
};

/**
 * Send an email to every administrator notifying
 * them that a new event refund request was submitted.
 *
 * Emails are sent separately so administrators do not
 * see one another's addresses.
 *
 * Each email is attempted independently. One invalid
 * or unused admin address will not prevent emails from
 * being sent to the remaining administrators.
 *
 * @param {object} data
 * @param {object} data.refundRequest
 * @param {object|null} data.event
 * @returns {Promise<object>}
 */
const sendRefundAdminEmailService =
  async ({
    refundRequest,
    event = null,
  }) => {
    if (!refundRequest) {
      throw new Error(
        'A refund request is required to send the admin notification.'
      );
    }

    if (!resend) {
      throw new Error(
        'Missing RESEND_API_KEY environment variable.'
      );
    }

    const recipients =
      await getAdminEmailAddresses();

    if (recipients.length === 0) {
      console.warn(
        'Event refund admin email was not sent because no administrator email addresses were found.',
        {
          refundRequestId:
            refundRequest.id,
        }
      );

      return {
        success: false,
        complete: false,
        sent: 0,
        failed: 0,
        recipients: [],
        successful: [],
        failures: [],
      };
    }

    const eventName =
      event?.name ||
      event?.title ||
      `Event #${refundRequest.eventId}`;

    const amount =
      formatCurrency(
        refundRequest.amountRequested,
        refundRequest.currency
      );

    const requestedAt =
      refundRequest.requestedAt
        ? new Date(
            refundRequest.requestedAt
          ).toLocaleString(
            'en-US',
            {
              dateStyle: 'medium',
              timeStyle: 'short',
            }
          )
        : 'Not available';

    const details =
      refundRequest.details ||
      'No additional details were provided.';

    const adminRefundUrl =
      buildAdminRefundUrl(
        refundRequest.id
      );

    const subject =
      `New event refund request: ${eventName}`;

    const text = [
      'A new event refund request has been submitted.',
      '',
      `Refund request ID: ${refundRequest.id}`,
      `Event: ${eventName}`,
      `Event ID: ${refundRequest.eventId}`,
      `Purchaser: ${refundRequest.purchaserEmail}`,
      `Amount requested: ${amount}`,
      `Reason: ${refundRequest.reason}`,
      `Details: ${details}`,
      `Status: ${refundRequest.status}`,
      `Requested at: ${requestedAt}`,
      `Stripe session: ${refundRequest.stripeSessionId}`,
      `Payment intent: ${
        refundRequest
          .stripePaymentIntentId ||
        'Not available'
      }`,
      adminRefundUrl
        ? ''
        : null,
      adminRefundUrl
        ? `Review request: ${adminRefundUrl}`
        : null,
    ]
      .filter(
        (line) =>
          line !== null
      )
      .join('\n');

    const html = `
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">

          <meta
            name="viewport"
            content="width=device-width, initial-scale=1"
          >

          <title>
            ${escapeHtml(subject)}
          </title>
        </head>

        <body
          style="
            margin: 0;
            padding: 0;
            background-color: #f4f4f4;
            font-family: Arial, Helvetica, sans-serif;
            color: #222222;
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
              background-color: #f4f4f4;
              padding: 24px 12px;
            "
          >
            <tr>
              <td align="center">
                <table
                  role="presentation"
                  width="100%"
                  cellspacing="0"
                  cellpadding="0"
                  border="0"
                  style="
                    width: 100%;
                    max-width: 640px;
                    background-color: #ffffff;
                    border-radius: 10px;
                    overflow: hidden;
                    border: 1px solid #dddddd;
                  "
                >
                  <tr>
                    <td
                      style="
                        padding: 24px;
                        background-color: #252525;
                        color: #ffffff;
                      "
                    >
                      <h1
                        style="
                          margin: 0;
                          font-size: 23px;
                          line-height: 1.3;
                        "
                      >
                        New Event Refund Request
                      </h1>

                      <p
                        style="
                          margin: 8px 0 0;
                          font-size: 15px;
                          color: #e5e5e5;
                        "
                      >
                        An event purchase refund is waiting
                        for administrator review.
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding: 24px;">
                      <table
                        role="presentation"
                        width="100%"
                        cellspacing="0"
                        cellpadding="0"
                        border="0"
                        style="
                          width: 100%;
                          border-collapse: collapse;
                        "
                      >
                        ${createDetailRow(
                          'Request ID',
                          refundRequest.id
                        )}

                        ${createDetailRow(
                          'Event',
                          eventName
                        )}

                        ${createDetailRow(
                          'Event ID',
                          refundRequest.eventId
                        )}

                        ${createDetailRow(
                          'Purchaser',
                          refundRequest.purchaserEmail
                        )}

                        ${createDetailRow(
                          'Amount',
                          amount
                        )}

                        ${createDetailRow(
                          'Reason',
                          refundRequest.reason
                        )}

                        ${createDetailRow(
                          'Status',
                          refundRequest.status
                        )}

                        ${createDetailRow(
                          'Requested',
                          requestedAt
                        )}

                        ${createDetailRow(
                          'Stripe Session',
                          refundRequest.stripeSessionId
                        )}

                        ${createDetailRow(
                          'Payment Intent',
                          refundRequest
                            .stripePaymentIntentId ||
                            'Not available'
                        )}
                      </table>

                      <div
                        style="
                          margin-top: 22px;
                          padding: 16px;
                          background-color: #f7f7f7;
                          border-left: 4px solid #777777;
                        "
                      >
                        <p
                          style="
                            margin: 0 0 8px;
                            font-size: 14px;
                            font-weight: bold;
                          "
                        >
                          Additional details
                        </p>

                        <p
                          style="
                            margin: 0;
                            font-size: 14px;
                            line-height: 1.6;
                            white-space: pre-wrap;
                          "
                        >${escapeHtml(details)}</p>
                      </div>

                      ${
                        adminRefundUrl
                          ? `
                            <div
                              style="
                                margin-top: 24px;
                                text-align: center;
                              "
                            >
                              <a
                                href="${escapeHtml(
                                  adminRefundUrl
                                )}"
                                style="
                                  display: inline-block;
                                  padding: 12px 20px;
                                  background-color: #252525;
                                  color: #ffffff;
                                  text-decoration: none;
                                  border-radius: 6px;
                                  font-size: 15px;
                                  font-weight: bold;
                                "
                              >
                                Review Refund Request
                              </a>
                            </div>
                          `
                          : ''
                      }
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

    /*
     * Attempt every admin email independently and
     * concurrently.
     *
     * Promise.allSettled ensures an invalid address does
     * not stop the remaining addresses from being sent.
     */
    const sendResults =
      await Promise.allSettled(
        recipients.map(
          async (recipient) => {
            const response =
              await resend.emails.send({
                from:
                  resendFromEmail,
                to: [
                  recipient,
                ],
                subject,
                text,
                html,
              });

            /*
             * Some Resend SDK versions return an error
             * object rather than rejecting the promise.
             */
            if (response?.error) {
              const resendError =
                new Error(
                  response.error.message ||
                    'Resend returned an unknown error.'
                );

              resendError.code =
                response.error.name ||
                'resend_email_error';

              resendError.details =
                response.error;

              throw resendError;
            }

            return {
              recipient,
              emailId:
                response?.data?.id ||
                response?.id ||
                null,
            };
          }
        )
      );

    const successful = [];
    const failed = [];

    sendResults.forEach(
      (
        result,
        index
      ) => {
        const recipient =
          recipients[index];

        if (
          result.status ===
          'fulfilled'
        ) {
          successful.push(
            result.value
          );

          return;
        }

        failed.push({
          recipient,
          error:
            result.reason?.message ||
            String(
              result.reason
            ),
          code:
            result.reason?.code ||
            null,
        });
      }
    );

    if (successful.length > 0) {
      console.log(
        'Event refund admin notification emails sent:',
        {
          refundRequestId:
            refundRequest.id,
          sent:
            successful.length,
          recipients:
            successful.map(
              (result) =>
                result.recipient
            ),
          emailIds:
            successful
              .map(
                (result) =>
                  result.emailId
              )
              .filter(Boolean),
        }
      );
    }

    if (failed.length > 0) {
      console.error(
        'Some event refund admin notification emails failed:',
        {
          refundRequestId:
            refundRequest.id,
          failed,
        }
      );
    }

    return {
      /*
       * success means at least one administrator received
       * the notification.
       */
      success:
        successful.length > 0,

      /*
       * complete means every configured administrator
       * received the notification.
       */
      complete:
        failed.length === 0,

      sent:
        successful.length,

      failed:
        failed.length,

      recipients,

      successful,

      failures:
        failed,
    };
  };

/**
 * Create one reusable detail row for the HTML email.
 *
 * @param {string} label
 * @param {unknown} value
 * @returns {string}
 */
function createDetailRow(
  label,
  value
) {
  return `
    <tr>
      <td
        style="
          width: 160px;
          padding: 10px 8px;
          border-bottom: 1px solid #eeeeee;
          font-size: 14px;
          font-weight: bold;
          vertical-align: top;
        "
      >
        ${escapeHtml(label)}
      </td>

      <td
        style="
          padding: 10px 8px;
          border-bottom: 1px solid #eeeeee;
          font-size: 14px;
          line-height: 1.5;
          word-break: break-word;
          vertical-align: top;
        "
      >
        ${escapeHtml(value)}
      </td>
    </tr>
  `;
}

module.exports = {
  sendRefundAdminEmailService,
};

