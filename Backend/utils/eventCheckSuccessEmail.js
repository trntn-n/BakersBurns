'use strict';

const { Resend } = require('resend');

const User = require('../models/user');
const Event = require('../models/events');
const EventOccurrence = require(
  '../models/eventOccurrence'
);
const EventReservation = require(
  '../models/eventReservation'
);

const resend = new Resend(
  process.env.RESEND_API_KEY
);

const DEFAULT_TIMEZONE =
  'America/Denver';

/*
 * Escape database and Stripe values before inserting
 * them into HTML.
 */
const escapeHtml = (value) => {
  return String(value ?? '')
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
    .match(
      /^(\d{4}-\d{2}-\d{2})/
    );

  return match ? match[1] : '';
};

const normalizeTimeOnly = (value) => {
  if (!value) {
    return '';
  }

  const match = String(value)
    .trim()
    .match(
      /^(\d{2}:\d{2})/
    );

  return match ? match[1] : '';
};

const normalizeNonNegativeInteger = (
  value,
  fallback = 0
) => {
  const parsedValue =
    Number.parseInt(
      value,
      10
    );

  if (
    !Number.isInteger(
      parsedValue
    ) ||
    parsedValue < 0
  ) {
    return fallback;
  }

  return parsedValue;
};

const normalizeRecipientList = (
  recipients
) => {
  const rawRecipients =
    Array.isArray(recipients)
      ? recipients
      : String(
          recipients || ''
        ).split(',');

  return [
    ...new Set(
      rawRecipients
        .map((recipient) =>
          String(recipient)
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
    ),
  ];
};

const formatDate = (value) => {
  const dateOnly =
    normalizeDateOnly(value);

  if (!dateOnly) {
    return 'Date unavailable';
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

const formatCalendarMonth = (
  value
) => {
  const dateOnly =
    normalizeDateOnly(value);

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

  return new Intl.DateTimeFormat(
    'en-US',
    {
      month: 'short',
    }
  )
    .format(
      new Date(
        year,
        month - 1,
        day
      )
    )
    .toUpperCase();
};

const formatCalendarDay = (
  value
) => {
  const dateOnly =
    normalizeDateOnly(value);

  if (!dateOnly) {
    return '';
  }

  return String(
    Number(
      dateOnly.split('-')[2]
    )
  );
};

const formatCalendarYear = (
  value
) => {
  const dateOnly =
    normalizeDateOnly(value);

  return dateOnly
    ? dateOnly.split('-')[0]
    : '';
};

const formatTime = (value) => {
  const normalizedTime =
    normalizeTimeOnly(value);

  if (!normalizedTime) {
    return '';
  }

  const [
    hour,
    minute,
  ] = normalizedTime
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

const formatTimeRange = (
  startTime,
  endTime
) => {
  const formattedStart =
    formatTime(startTime);

  const formattedEnd =
    formatTime(endTime);

  if (
    formattedStart &&
    formattedEnd
  ) {
    return `${formattedStart} – ${formattedEnd}`;
  }

  return (
    formattedStart ||
    formattedEnd ||
    'Time to be announced'
  );
};

const formatMoney = (
  cents,
  currency = 'usd'
) => {
  const numericCents =
    Number(cents);

  if (
    !Number.isFinite(
      numericCents
    )
  ) {
    return '';
  }

  return new Intl.NumberFormat(
    'en-US',
    {
      style: 'currency',
      currency:
        String(currency)
          .trim()
          .toUpperCase() ||
        'USD',
    }
  ).format(
    numericCents / 100
  );
};

const getSessionCustomerName = (
  session
) => {
  return (
    session?.customer_details
      ?.name ||
    session?.metadata
      ?.purchaserName ||
    session?.metadata
      ?.customerName ||
    ''
  );
};

const getSessionCustomerEmail = (
  session
) => {
  return (
    session?.customer_details
      ?.email ||
    session?.customer_email ||
    ''
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
    return session.payment_intent;
  }

  return (
    session?.payment_intent
      ?.id ||
    ''
  );
};

const getEventName = (event) => {
  return (
    event?.name ||
    event?.title ||
    event?.eventName ||
    event?.event_name ||
    'BakersBurns Event'
  );
};

const getEventDescription = (
  event
) => {
  return (
    event?.description ||
    event?.eventDescription ||
    event?.event_description ||
    ''
  );
};

const getEventLocation = (
  event
) => {
  return (
    event?.location ||
    event?.eventLocation ||
    event?.event_location ||
    ''
  );
};

const getEventStartTime = (
  event
) => {
  return (
    event?.startTime ||
    event?.start_time ||
    ''
  );
};

const getEventEndTime = (
  event
) => {
  return (
    event?.endTime ||
    event?.end_time ||
    ''
  );
};

/*
 * Convert either Sequelize camelCase properties or
 * raw snake_case database fields into one predictable
 * reservation shape.
 */
const normalizeReservation = (
  reservation,
  event
) => {
  const quantity =
    normalizeNonNegativeInteger(
      reservation?.quantity,
      0
    );

  const capacity =
    normalizeNonNegativeInteger(
      reservation?.capacity ??
        reservation
          ?.maxTicketQuantity ??
        reservation
          ?.max_ticket_quantity,
      0
    );

  const soldCount =
    normalizeNonNegativeInteger(
      reservation?.soldCount ??
        reservation
          ?.sold_count ??
        reservation
          ?.ticketsSold ??
        reservation
          ?.tickets_sold,
      0
    );

  const reservedCount =
    normalizeNonNegativeInteger(
      reservation?.reservedCount ??
        reservation
          ?.reserved_count,
      0
    );

  const explicitRemaining =
    reservation
      ?.remainingTickets ??
    reservation
      ?.remaining_tickets;

  const remainingTickets =
    explicitRemaining !==
      undefined &&
    explicitRemaining !==
      null
      ? normalizeNonNegativeInteger(
          explicitRemaining,
          0
        )
      : capacity > 0
        ? Math.max(
            capacity -
              soldCount -
              reservedCount,
            0
          )
        : null;

  return {
    id:
      reservation?.id ||
      reservation
        ?.reservationId ||
      reservation
        ?.reservation_id ||
      '',

    eventId:
      reservation?.eventId ||
      reservation
        ?.event_id ||
      event?.id ||
      '',

    occurrenceId:
      reservation
        ?.occurrenceId ||
      reservation
        ?.occurrence_id ||
      reservation
        ?.eventOccurrenceId ||
      reservation
        ?.event_occurrence_id ||
      '',

    occurrenceDate:
      normalizeDateOnly(
        reservation
          ?.occurrenceDate ||
        reservation
          ?.occurrence_date ||
        reservation?.date
      ),

    quantity,
    capacity,
    reservedCount,
    soldCount,
    remainingTickets,

    startTime:
      reservation?.startTime ||
      reservation?.start_time ||
      getEventStartTime(event),

    endTime:
      reservation?.endTime ||
      reservation?.end_time ||
      getEventEndTime(event),
  };
};

/*
 * Load the finalized reservation records directly from
 * the database.
 *
 * completeEventCheckoutHold currently returns a result
 * but does not return the event and reservations needed
 * by the email templates.
 */
const loadCompletedEventCheckout =
  async ({
    stripeSessionId,
  }) => {
    if (!stripeSessionId) {
      throw new Error(
        'stripeSessionId is required to load completed event checkout details.'
      );
    }

    const reservationRows =
      await EventReservation.findAll({
        where: {
          stripeSessionId,
          status: 'paid',
        },

        order: [
          [
            'occurrenceId',
            'ASC',
          ],
        ],

        raw: true,
      });

    if (
      reservationRows.length ===
      0
    ) {
      throw new Error(
        `No paid event reservations were found for Checkout Session ${stripeSessionId}.`
      );
    }

    const eventIds = [
      ...new Set(
        reservationRows
          .map((reservation) =>
            Number(
              reservation.eventId ??
                reservation.event_id
            )
          )
          .filter(
            Number.isInteger
          )
      ),
    ];

    if (
      eventIds.length !== 1
    ) {
      throw new Error(
        `Expected exactly one event for Checkout Session ${stripeSessionId}, but found ${eventIds.length}.`
      );
    }

    const event =
      await Event.findByPk(
        eventIds[0],
        {
          raw: true,
        }
      );

    if (!event) {
      throw new Error(
        `Event ${eventIds[0]} was not found for Checkout Session ${stripeSessionId}.`
      );
    }

    const occurrenceIds = [
      ...new Set(
        reservationRows
          .map((reservation) =>
            Number(
              reservation
                .occurrenceId ??
                reservation
                  .occurrence_id
            )
          )
          .filter(
            Number.isInteger
          )
      ),
    ];

    const occurrenceRows =
      occurrenceIds.length > 0
        ? await EventOccurrence
            .findAll({
              where: {
                id: occurrenceIds,
              },

              raw: true,
            })
        : [];

    const occurrenceMap =
      new Map(
        occurrenceRows.map(
          (occurrence) => [
            Number(
              occurrence.id
            ),
            occurrence,
          ]
        )
      );

    const reservations =
      reservationRows.map(
        (reservation) => {
          const occurrenceId =
            Number(
              reservation
                .occurrenceId ??
                reservation
                  .occurrence_id
            );

          const occurrence =
            occurrenceMap.get(
              occurrenceId
            );

          if (!occurrence) {
            throw new Error(
              `Event occurrence ${occurrenceId} was not found for Checkout Session ${stripeSessionId}.`
            );
          }

          const capacity =
            normalizeNonNegativeInteger(
              occurrence.capacity,
              0
            );

          const soldCount =
            normalizeNonNegativeInteger(
              occurrence.soldCount ??
                occurrence
                  .sold_count,
              0
            );

          const reservedCount =
            normalizeNonNegativeInteger(
              occurrence
                .reservedCount ??
                occurrence
                  .reserved_count,
              0
            );

          /*
           * soldCount already contains this completed
           * order. Subtract any still-active temporary
           * holds when reporting true remaining stock.
           */
          const remainingTickets =
            capacity > 0
              ? Math.max(
                  capacity -
                    soldCount -
                    reservedCount,
                  0
                )
              : null;

          return {
            ...reservation,

            occurrenceDate:
              occurrence
                .occurrenceDate ??
              occurrence
                .occurrence_date ??
              null,

            capacity,
            soldCount,
            reservedCount,
            remainingTickets,

            startTime:
              event.startTime ??
              event.start_time ??
              null,

            endTime:
              event.endTime ??
              event.end_time ??
              null,
          };
        }
      );

    return {
      event,
      reservations,
    };
  };

/*
 * Email clients support tables more consistently than
 * flexbox or CSS grid.
 */
const createEmailLayout = ({
  previewText,
  title,
  content,
}) => {
  const customFontUrl =
    process.env
      .EVENT_EMAIL_FONT_URL;

  const customFontCss =
    customFontUrl
      ? `
        @font-face {
          font-family: 'Carnivalee Freakshow';
          src: url('${escapeHtml(
            customFontUrl
          )}') format('truetype');
          font-weight: normal;
          font-style: normal;
        }
      `
      : '';

  return `
    <!doctype html>

    <html>
      <head>
        <meta charset="utf-8" />

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />

        <title>
          ${escapeHtml(title)}
        </title>

        <style>
          ${customFontCss}

          body,
          table,
          td,
          a {
            font-family:
              Montserrat,
              Arial,
              Helvetica,
              sans-serif;
          }

          .event-email-heading {
            font-family:
              'Carnivalee Freakshow',
              Georgia,
              'Times New Roman',
              serif;
          }

          @media only screen and (max-width: 620px) {
            .event-email-container {
              width: 100% !important;
            }

            .event-email-padding {
              padding: 22px 16px !important;
            }

            .event-email-heading {
              font-size: 38px !important;
            }

            .event-email-calendar-cell {
              display: block !important;
              width: 100% !important;
              padding-right: 0 !important;
              padding-bottom: 18px !important;
            }

            .event-email-details-cell {
              display: block !important;
              width: 100% !important;
              padding-left: 20px !important;
            }

            .event-email-summary-label,
            .event-email-summary-value {
              display: block !important;
              width: 100% !important;
              text-align: left !important;
            }

            .event-email-summary-value {
              padding-top: 4px !important;
            }
          }
        </style>
      </head>

      <body
        style="
          margin: 0;
          padding: 0;
          background-color: #25251f;
          color: #27271f;
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
          ${escapeHtml(previewText)}
        </div>

        <table
          role="presentation"
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          style="
            width: 100%;
            background-color: #25251f;
          "
        >
          <tr>
            <td
              align="center"
              style="
                padding: 28px 12px;
              "
            >
              <table
                role="presentation"
                width="680"
                cellpadding="0"
                cellspacing="0"
                border="0"
                class="event-email-container"
                style="
                  width: 100%;
                  max-width: 680px;
                  border: 1px solid #88826e;
                  border-radius: 20px;
                  border-collapse: separate;
                  overflow: hidden;
                  background-color: #f0eee3;
                  box-shadow:
                    0 20px 50px
                    rgba(0, 0, 0, 0.24);
                "
              >
                <tr>
                  <td
                    class="event-email-padding"
                    style="
                      padding: 34px;
                    "
                  >
                    ${content}

                    <table
                      role="presentation"
                      width="100%"
                      cellpadding="0"
                      cellspacing="0"
                      border="0"
                      style="
                        width: 100%;
                        margin-top: 30px;
                        border-top:
                          1px solid
                          #aaa38d;
                      "
                    >
                      <tr>
                        <td
                          style="
                            padding-top: 20px;
                            color: #6c695c;
                            font-size: 12px;
                            line-height: 1.6;
                            text-align: center;
                          "
                        >
                          &copy;
                          ${new Date().getFullYear()}
                          BakersBurns.

                          <br />

                          This email was sent because
                          an event ticket purchase was
                          completed.
                        </td>
                      </tr>
                    </table>
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

const createCalendarDateBlock = (
  date
) => {
  return `
    <table
      role="presentation"
      width="104"
      cellpadding="0"
      cellspacing="0"
      border="0"
      style="
        width: 104px;
        border-collapse: separate;
        border-radius: 14px;
        overflow: hidden;
        background-color: #7c4734;
        color: #ffffff;
      "
    >
      <tr>
        <td
          align="center"
          style="
            padding: 13px 8px 4px;
            font-size: 13px;
            font-weight: 800;
            letter-spacing: 1px;
            text-transform: uppercase;
          "
        >
          ${escapeHtml(
            formatCalendarMonth(date)
          )}
        </td>
      </tr>

      <tr>
        <td
          align="center"
          class="event-email-heading"
          style="
            padding: 1px 8px;
            font-family:
              'Carnivalee Freakshow',
              Georgia,
              serif;
            font-size: 45px;
            line-height: 1;
          "
        >
          ${escapeHtml(
            formatCalendarDay(date)
          )}
        </td>
      </tr>

      <tr>
        <td
          align="center"
          style="
            padding: 4px 8px 13px;
            font-size: 12px;
            font-weight: 700;
          "
        >
          ${escapeHtml(
            formatCalendarYear(date)
          )}
        </td>
      </tr>
    </table>
  `;
};

const createReservationCard = ({
  reservation,
  event,
  isAdmin = false,
}) => {
  const date =
    reservation.occurrenceDate;

  const timeRange =
    formatTimeRange(
      reservation.startTime,
      reservation.endTime
    );

  const availabilityHtml =
    isAdmin
      ? `
        <table
          role="presentation"
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          style="
            width: 100%;
            margin-top: 14px;
            border-top:
              1px solid
              #aaa38d;
          "
        >
          <tr>
            <td
              style="
                padding-top: 12px;
                color: #6c695c;
                font-size: 13px;
              "
            >
              Sold after this order
            </td>

            <td
              align="right"
              style="
                padding-top: 12px;
                color: #27271f;
                font-size: 13px;
                font-weight: 800;
              "
            >
              ${escapeHtml(
                reservation.soldCount
              )}
            </td>
          </tr>

          <tr>
            <td
              style="
                padding-top: 7px;
                color: #6c695c;
                font-size: 13px;
              "
            >
              Active temporary holds
            </td>

            <td
              align="right"
              style="
                padding-top: 7px;
                color: #27271f;
                font-size: 13px;
                font-weight: 800;
              "
            >
              ${escapeHtml(
                reservation
                  .reservedCount
              )}
            </td>
          </tr>

          <tr>
            <td
              style="
                padding-top: 7px;
                color: #6c695c;
                font-size: 13px;
              "
            >
              Capacity
            </td>

            <td
              align="right"
              style="
                padding-top: 7px;
                color: #27271f;
                font-size: 13px;
                font-weight: 800;
              "
            >
              ${
                reservation.capacity >
                0
                  ? escapeHtml(
                      reservation.capacity
                    )
                  : 'Unlimited'
              }
            </td>
          </tr>

          <tr>
            <td
              style="
                padding-top: 7px;
                color: #6c695c;
                font-size: 13px;
              "
            >
              Currently available
            </td>

            <td
              align="right"
              style="
                padding-top: 7px;
                color: #7c4734;
                font-size: 14px;
                font-weight: 800;
              "
            >
              ${
                reservation
                  .remainingTickets ===
                null
                  ? 'Unlimited'
                  : escapeHtml(
                      reservation
                        .remainingTickets
                    )
              }
            </td>
          </tr>
        </table>
      `
      : '';

  return `
    <table
      role="presentation"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      border="0"
      style="
        width: 100%;
        margin-top: 16px;
        border:
          1px solid
          #aaa38d;
        border-radius: 16px;
        border-collapse: separate;
        background-color: #dfdccd;
      "
    >
      <tr>
        <td
          class="event-email-calendar-cell"
          width="130"
          valign="top"
          style="
            width: 130px;
            padding:
              20px
              10px
              20px
              20px;
          "
        >
          ${createCalendarDateBlock(
            date
          )}
        </td>

        <td
          class="event-email-details-cell"
          valign="top"
          style="
            padding:
              20px
              20px
              20px
              10px;
          "
        >
          <div
            style="
              color: #7c4734;
              font-size: 12px;
              font-weight: 800;
              letter-spacing: 1px;
              text-transform: uppercase;
            "
          >
            ${escapeHtml(
              formatDate(date)
            )}
          </div>

          <div
            class="event-email-heading"
            style="
              margin-top: 5px;
              color: #27271f;
              font-family:
                'Carnivalee Freakshow',
                Georgia,
                serif;
              font-size: 28px;
              line-height: 1.1;
            "
          >
            ${escapeHtml(
              getEventName(event)
            )}
          </div>

          <div
            style="
              margin-top: 10px;
              color: #454337;
              font-size: 14px;
              font-weight: 800;
            "
          >
            ${escapeHtml(
              timeRange
            )}
          </div>

          <div
            style="
              margin-top: 7px;
              color: #6c695c;
              font-size: 13px;
            "
          >
            Tickets:

            <strong
              style="
                color: #27271f;
              "
            >
              ${escapeHtml(
                reservation.quantity
              )}
            </strong>
          </div>

          ${
            getEventLocation(event)
              ? `
                <div
                  style="
                    margin-top: 7px;
                    color: #6c695c;
                    font-size: 13px;
                  "
                >
                  Location:

                  <strong
                    style="
                      color: #27271f;
                    "
                  >
                    ${escapeHtml(
                      getEventLocation(
                        event
                      )
                    )}
                  </strong>
                </div>
              `
              : ''
          }

          ${availabilityHtml}
        </td>
      </tr>
    </table>
  `;
};

const createSummaryRow = (
  label,
  value
) => {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return '';
  }

  return `
    <tr>
      <td
        class="event-email-summary-label"
        style="
          width: 48%;
          padding: 8px 0;
          color: #6c695c;
          font-size: 14px;
          vertical-align: top;
        "
      >
        ${escapeHtml(label)}
      </td>

      <td
        class="event-email-summary-value"
        align="right"
        style="
          width: 52%;
          padding: 8px 0;
          color: #27271f;
          font-size: 14px;
          font-weight: 800;
          overflow-wrap: anywhere;
          vertical-align: top;
        "
      >
        ${escapeHtml(value)}
      </td>
    </tr>
  `;
};

const createCustomerEmail = ({
  session,
  event,
  reservations,
}) => {
  const eventName =
    getEventName(event);

  const customerName =
    getSessionCustomerName(
      session
    );

  const totalTickets =
    reservations.reduce(
      (
        total,
        reservation
      ) => {
        return (
          total +
          reservation.quantity
        );
      },
      0
    );

  const totalPaid =
    formatMoney(
      session.amount_total,
      session.currency
    );

  const reservationCards =
    reservations
      .map((reservation) =>
        createReservationCard({
          reservation,
          event,
        })
      )
      .join('');

  const content = `
    <div
      style="
        color: #7c4734;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 1.4px;
        text-transform: uppercase;
      "
    >
      Payment successful
    </div>

    <h1
      class="event-email-heading"
      style="
        margin: 8px 0 12px;
        color: #27271f;
        font-family:
          'Carnivalee Freakshow',
          Georgia,
          serif;
        font-size: 48px;
        font-weight: normal;
        line-height: 1;
      "
    >
      Your tickets are confirmed
    </h1>

    <p
      style="
        margin: 0;
        color: #5d5a4e;
        font-size: 15px;
        line-height: 1.7;
      "
    >
      ${
        customerName
          ? `Thank you, ${escapeHtml(
              customerName
            )}.`
          : 'Thank you for your purchase.'
      }

      Your tickets for

      <strong
        style="
          color: #27271f;
        "
      >
        ${escapeHtml(
          eventName
        )}
      </strong>

      have been reserved successfully.
    </p>

    ${
      getEventDescription(event)
        ? `
          <p
            style="
              margin: 16px 0 0;
              color: #5d5a4e;
              font-size: 14px;
              line-height: 1.7;
            "
          >
            ${escapeHtml(
              getEventDescription(
                event
              )
            )}
          </p>
        `
        : ''
    }

    <div
      style="
        margin-top: 26px;
        color: #7c4734;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 1.2px;
        text-transform: uppercase;
      "
    >
      Your scheduled dates
    </div>

    ${reservationCards}

    <table
      role="presentation"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      border="0"
      style="
        width: 100%;
        margin-top: 24px;
        border-top:
          1px solid
          #aaa38d;
      "
    >
      ${createSummaryRow(
        'Total tickets',
        totalTickets
      )}

      ${createSummaryRow(
        'Total paid',
        totalPaid
      )}

      ${createSummaryRow(
        'Confirmation email',
        getSessionCustomerEmail(
          session
        )
      )}

      ${createSummaryRow(
        'Checkout reference',
        session.id
      )}
    </table>

    <p
      style="
        margin: 24px 0 0;
        color: #5d5a4e;
        font-size: 13px;
        line-height: 1.7;
      "
    >
      Keep this email for your records.
      Your event purchase is recorded
      under the email address used at
      checkout.
    </p>
  `;

  return {
    subject:
      `Ticket confirmation — ${eventName}`,

    html: createEmailLayout({
      previewText:
        `Your tickets for ${eventName} are confirmed.`,

      title:
        `Ticket confirmation — ${eventName}`,

      content,
    }),
  };
};

const createAdminEmail = ({
  session,
  event,
  reservations,
}) => {
  const eventName =
    getEventName(event);

  const totalTickets =
    reservations.reduce(
      (
        total,
        reservation
      ) => {
        return (
          total +
          reservation.quantity
        );
      },
      0
    );

  const totalPaid =
    formatMoney(
      session.amount_total,
      session.currency
    );

  const reservationCards =
    reservations
      .map((reservation) =>
        createReservationCard({
          reservation,
          event,
          isAdmin: true,
        })
      )
      .join('');

  const content = `
    <div
      style="
        color: #7c4734;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 1.4px;
        text-transform: uppercase;
      "
    >
      New event order
    </div>

    <h1
      class="event-email-heading"
      style="
        margin: 8px 0 12px;
        color: #27271f;
        font-family:
          'Carnivalee Freakshow',
          Georgia,
          serif;
        font-size: 48px;
        font-weight: normal;
        line-height: 1;
      "
    >
      Tickets purchased
    </h1>

    <p
      style="
        margin: 0;
        color: #5d5a4e;
        font-size: 15px;
        line-height: 1.7;
      "
    >
      A customer successfully purchased
      tickets for

      <strong
        style="
          color: #27271f;
        "
      >
        ${escapeHtml(
          eventName
        )}
      </strong>.
    </p>

    <table
      role="presentation"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      border="0"
      style="
        width: 100%;
        margin-top: 24px;
        border-top:
          1px solid
          #aaa38d;
      "
    >
      ${createSummaryRow(
        'Customer name',
        getSessionCustomerName(
          session
        ) ||
        'Not provided'
      )}

      ${createSummaryRow(
        'Customer email',
        getSessionCustomerEmail(
          session
        )
      )}

      ${createSummaryRow(
        'Tickets purchased',
        totalTickets
      )}

      ${createSummaryRow(
        'Total paid',
        totalPaid
      )}

      ${createSummaryRow(
        'Stripe Checkout Session',
        session.id
      )}

      ${createSummaryRow(
        'Payment Intent',
        getPaymentIntentId(
          session
        )
      )}

      ${createSummaryRow(
        'Event ID',
        event.id ||
        session.metadata
          ?.eventId ||
        ''
      )}
    </table>

    <div
      style="
        margin-top: 26px;
        color: #7c4734;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 1.2px;
        text-transform: uppercase;
      "
    >
      Purchased dates and availability
    </div>

    ${reservationCards}
  `;

  return {
    subject:
      `New event order — ${eventName}`,

    html: createEmailLayout({
      previewText:
        `${totalTickets} ticket${
          totalTickets === 1
            ? ''
            : 's'
        } purchased for ${eventName}.`,

      title:
        `New event order — ${eventName}`,

      content,
    }),
  };
};

const getAdminRecipients =
  async () => {
    const recipients = [];

    recipients.push(
      ...normalizeRecipientList(
        process.env.ADMIN_EMAIL
      )
    );

    try {
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

      for (
        const adminUser of
        adminUsers
      ) {
        if (adminUser.email) {
          recipients.push(
            adminUser.email
          );
        }
      }
    } catch (error) {
      /*
       * ADMIN_EMAIL can still be used even if the
       * database lookup temporarily fails.
       */
      console.error(
        'Could not load admin email recipients:',
        {
          message:
            error.message,
        }
      );
    }

    return normalizeRecipientList(
      recipients
    );
  };

const sendResendEmail = async ({
  to,
  subject,
  html,
}) => {
  if (
    !process.env
      .RESEND_API_KEY
  ) {
    throw new Error(
      'RESEND_API_KEY is not configured.'
    );
  }

  const recipients =
    normalizeRecipientList(to);

  if (
    recipients.length === 0
  ) {
    throw new Error(
      'At least one email recipient is required.'
    );
  }

  const {
    data,
    error,
  } =
    await resend.emails.send({
      from:
        process.env
          .EVENT_EMAIL_FROM ||
        process.env
          .ORDER_EMAIL_FROM ||
        'BakersBurns Events <events@bakersburns.com>',

      to: recipients,

      replyTo:
        process.env
          .EVENT_EMAIL_REPLY_TO ||
        process.env
          .ORDER_EMAIL_REPLY_TO ||
        'support@bakersburns.com',

      subject,
      html,
    });

  if (error) {
    throw new Error(
      `Resend rejected the event email: ${
        error.message ||
        JSON.stringify(error)
      }`
    );
  }

  return data;
};

const sendEventCheckoutEmails =
  async ({
    session,
    completionResult,
  }) => {
    if (!session?.id) {
      throw new Error(
        'A Stripe Checkout Session is required to send event emails.'
      );
    }

    /*
     * Always load the finalized checkout details directly from
     * the database.
     *
     * The inventory service returns the newly created reservation
     * records, but those records do not contain the associated
     * EventOccurrence fields required by the email templates,
     * including occurrenceDate and availability information.
     */
    console.log(
      'Loading finalized event checkout details for email:',
      {
        stripeSessionId: session.id,

        completionResultHasEvent: Boolean(
          completionResult?.event
        ),

        completionResultReservationCount:
          Array.isArray(
            completionResult?.reservations
          )
            ? completionResult.reservations.length
            : 0,
      }
    );

    const databaseResult =
      await loadCompletedEventCheckout({
        stripeSessionId: session.id,
      });

    const event = databaseResult.event;

    const rawReservations =
      databaseResult.reservations;

    console.log(
      'Raw reservations before normalize:',
      JSON.stringify(rawReservations, null, 2)
    );

    const reservations =
      rawReservations
        .map((reservation) =>
          normalizeReservation(
            reservation,
            event
          )
        )
        .filter(
          (reservation) =>
            reservation.occurrenceDate &&
            reservation.quantity > 0
        );

    if (reservations.length === 0) {
      throw new Error(
        `No usable completed event reservations were found for Checkout Session ${session.id}.`
      );
    }

    const purchaserEmail =
      getSessionCustomerEmail(
        session
      );

    const emailResults = {
      customer: null,
      admins: null,
    };

    /*
     * Send the purchaser email and admin email
     * independently so an admin-email failure does not
     * hide a successful purchaser delivery.
     */
    if (purchaserEmail) {
      const customerEmail =
        createCustomerEmail({
          session,
          event,
          reservations,
        });

      try {
        emailResults.customer =
          await sendResendEmail({
            to: purchaserEmail,

            subject:
              customerEmail.subject,

            html:
              customerEmail.html,
          });

        console.log(
          'Event customer confirmation email sent:',
          {
            stripeSessionId:
              session.id,

            purchaserEmail,

            resendEmailId:
              emailResults
                .customer?.id ||
              null,
          }
        );
      } catch (error) {
        console.error(
          'Event customer confirmation email failed:',
          {
            stripeSessionId:
              session.id,

            purchaserEmail,

            message:
              error.message,

            stack:
              error.stack,
          }
        );

        throw error;
      }
    } else {
      console.warn(
        `Event Checkout Session ${session.id} has no purchaser email.`
      );
    }

    /*
     * Send the admin notification to each recipient
     * independently. sendResendEmail sends one Resend
     * request per recipient here, so a single invalid or
     * rejected admin address cannot fail delivery to the
     * other admins, and cannot fail the Stripe webhook
     * just because one admin address is bad.
     */
    const adminRecipients =
      await getAdminRecipients();

    if (
      adminRecipients.length >
      0
    ) {
      const adminEmail =
        createAdminEmail({
          session,
          event,
          reservations,
        });

      const adminDeliveryResults =
        await Promise.allSettled(
          adminRecipients.map(
            async (adminRecipient) => {
              try {
                const result =
                  await sendResendEmail({
                    to: adminRecipient,
                    subject:
                      adminEmail.subject,
                    html:
                      adminEmail.html,
                  });

                console.log(
                  'Event admin notification email sent:',
                  {
                    stripeSessionId:
                      session.id,
                    adminRecipient,
                    resendEmailId:
                      result?.id || null,
                  }
                );

                return {
                  recipient:
                    adminRecipient,
                  success: true,
                  resendEmailId:
                    result?.id || null,
                };
              } catch (error) {
                console.error(
                  'Event admin notification email failed for recipient:',
                  {
                    stripeSessionId:
                      session.id,
                    adminRecipient,
                    message:
                      error.message,
                    stack:
                      error.stack,
                  }
                );

                return {
                  recipient:
                    adminRecipient,
                  success: false,
                  error:
                    error.message,
                };
              }
            }
          )
        );

      const normalizedAdminResults =
        adminDeliveryResults.map(
          (result) => {
            if (
              result.status ===
              'fulfilled'
            ) {
              return result.value;
            }

            return {
              recipient: null,
              success: false,
              error:
                result.reason?.message ||
                String(result.reason),
            };
          }
        );

      const successfulAdminEmails =
        normalizedAdminResults.filter(
          (result) =>
            result.success
        );

      const failedAdminEmails =
        normalizedAdminResults.filter(
          (result) =>
            !result.success
        );

      emailResults.admins = {
        successful:
          successfulAdminEmails,
        failed:
          failedAdminEmails,
      };

      console.log(
        'Event admin notification delivery completed:',
        {
          stripeSessionId:
            session.id,
          attemptedCount:
            adminRecipients.length,
          successfulCount:
            successfulAdminEmails.length,
          failedCount:
            failedAdminEmails.length,
          failedRecipients:
            failedAdminEmails.map(
              (result) =>
                result.recipient
            ),
        }
      );
    } else {
      console.warn(
        'No event admin email recipients are configured.'
      );
    }

    console.log(
      'Event checkout emails processed:',
      {
        stripeSessionId:
          session.id,

        eventId:
          event.id ||
          null,

        purchaserEmail:
          purchaserEmail ||
          null,

        reservationCount:
          reservations.length,

        adminRecipientCount:
          adminRecipients.length,

        customerEmailId:
          emailResults
            .customer?.id ||
          null,

        adminEmailSuccessCount:
          emailResults.admins
            ?.successful?.length || 0,

        adminEmailFailureCount:
          emailResults.admins
            ?.failed?.length || 0,
      }
    );

    return emailResults;
  };

module.exports = {
  sendEventCheckoutEmails,
};