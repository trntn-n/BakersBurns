'use strict';
const {FROM_ADDRESSES } = require('../email-constants');

const escapeHtml = (value) => {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
};

const formatRefundAmount = (
    amount,
    currency = 'usd'
  ) => {
    const numericAmount =
      Number(amount || 0) / 100;
  
    try {
      return new Intl.NumberFormat(
        'en-US',
        {
          style: 'currency',
          currency:
            String(currency || 'usd')
              .trim()
              .toUpperCase(),
        }
      ).format(numericAmount);
    } catch {
      return `$${numericAmount.toFixed(2)}`;
    }
  };

const formatEventDate = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(value);
  }

  return date.toLocaleDateString(
    'en-US',
    {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }
  );
};

const buildEventRefundNotificationEmail = ({
  customerName,
  eventName,
  eventDate,
  eventStartTime,
  refundAmount,
  currency,
  refundId,
  quantity,
  cancellationReason,
}) => {
  const safeCustomerName =
    escapeHtml(
      customerName ||
        'Customer'
    );

  const safeEventName =
    escapeHtml(
      eventName ||
        'your event'
    );

  const formattedDate =
    formatEventDate(
      eventDate
    );

  const formattedAmount =
    formatRefundAmount(
      refundAmount,
      currency
    );

  const subject =
    `Refund processed for ${eventName || 'your event'}`;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />

        <title>
          Event refund processed
        </title>
      </head>

      <body
        style="
          margin: 0;
          padding: 0;
          background: #f4f4f4;
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
            background: #f4f4f4;
          "
        >
          <tr>
            <td
              align="center"
              style="
                padding: 32px 16px;
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
                  max-width: 620px;
                  background: #ffffff;
                  border-radius: 12px;
                  overflow: hidden;
                "
              >
                <tr>
                  <td
                    style="
                      padding: 32px;
                    "
                  >
                    <h1
                      style="
                        margin: 0 0 18px;
                        font-size: 28px;
                        line-height: 1.25;
                        color: #222222;
                      "
                    >
                      Your refund was processed
                    </h1>

                    <p
                      style="
                        margin: 0 0 16px;
                        font-size: 16px;
                        line-height: 1.7;
                        color: #444444;
                      "
                    >
                      Hello ${safeCustomerName},
                    </p>

                    <p
                      style="
                        margin: 0 0 24px;
                        font-size: 16px;
                        line-height: 1.7;
                        color: #444444;
                      "
                    >
                      Your refund for
                      <strong>
                        ${safeEventName}
                      </strong>
                      has been successfully processed.
                    </p>

                    <table
                      role="presentation"
                      width="100%"
                      cellspacing="0"
                      cellpadding="0"
                      border="0"
                      style="
                        width: 100%;
                        padding: 18px;
                        background: #fafafa;
                        border-radius: 8px;
                      "
                    >
                      ${
                        formattedDate
                          ? `
                            <tr>
                              <td
                                style="
                                  padding: 8px 0;
                                  color: #666666;
                                "
                              >
                                Date
                              </td>

                              <td
                                style="
                                  padding: 8px 0;
                                  text-align: right;
                                  font-weight: 600;
                                  color: #222222;
                                "
                              >
                                ${escapeHtml(
                                  formattedDate
                                )}
                              </td>
                            </tr>
                          `
                          : ''
                      }

                      ${
                        eventStartTime
                          ? `
                            <tr>
                              <td
                                style="
                                  padding: 8px 0;
                                  color: #666666;
                                "
                              >
                                Start time
                              </td>

                              <td
                                style="
                                  padding: 8px 0;
                                  text-align: right;
                                  font-weight: 600;
                                  color: #222222;
                                "
                              >
                                ${escapeHtml(
                                  eventStartTime
                                )}
                              </td>
                            </tr>
                          `
                          : ''
                      }

                      <tr>
                        <td
                          style="
                            padding: 8px 0;
                            color: #666666;
                          "
                        >
                          Quantity
                        </td>

                        <td
                          style="
                            padding: 8px 0;
                            text-align: right;
                            font-weight: 600;
                            color: #222222;
                          "
                        >
                          ${escapeHtml(
                            quantity
                          )}
                        </td>
                      </tr>

                      <tr>
                        <td
                          style="
                            padding: 8px 0;
                            color: #666666;
                          "
                        >
                          Refund amount
                        </td>

                        <td
                          style="
                            padding: 8px 0;
                            text-align: right;
                            font-weight: 600;
                            color: #222222;
                          "
                        >
                          ${escapeHtml(
                            formattedAmount
                          )}
                        </td>
                      </tr>

                      ${
                        refundId
                          ? `
                            <tr>
                              <td
                                style="
                                  padding: 8px 0;
                                  color: #666666;
                                "
                              >
                                Refund ID
                              </td>

                              <td
                                style="
                                  padding: 8px 0;
                                  text-align: right;
                                  font-size: 13px;
                                  color: #222222;
                                "
                              >
                                ${escapeHtml(
                                  refundId
                                )}
                              </td>
                            </tr>
                          `
                          : ''
                      }
                    </table>

                    ${
                      cancellationReason
                        ? `
                          <div
                            style="
                              margin-top: 24px;
                              padding: 16px;
                              border-radius: 8px;
                              background: #f7f3ef;
                            "
                          >
                            <strong
                              style="
                                display: block;
                                margin-bottom: 6px;
                                color: #222222;
                              "
                            >
                              Cancellation reason
                            </strong>

                            <span
                              style="
                                color: #555555;
                                line-height: 1.6;
                              "
                            >
                              ${escapeHtml(
                                cancellationReason
                              )}
                            </span>
                          </div>
                        `
                        : ''
                    }

                    <p
                      style="
                        margin: 24px 0 0;
                        font-size: 14px;
                        line-height: 1.7;
                        color: #666666;
                      "
                    >
                      Depending on your financial institution,
                      the refund may take several business days
                      to appear in your account.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return {
    from: FROM_ADDRESSES.EVENTS,
    replyTo: 'events@bakersburns.com',
    subject,
    html,
  };
};

module.exports = {
  buildEventRefundNotificationEmail,
};