/* register/EventCheckoutSuccess.jsx */
import React, {
    useEffect,
    useMemo,
    useState,
  } from "react";
  
  import {
    Link,
    useSearchParams,
  } from "react-router-dom";
  
  import { registerApi } from "../../config/axios";
  
  import "./EventCheckoutSuccess.css";
  
  const CHECKOUT_DETAILS_ENDPOINT =
    "/register-events/checkout-success";
  
  /*
   * Placeholder — this route does not exist on the backend yet.
   * Expected request body:
   *   {
   *     email: string,
   *     eventId: number | null,
   *     sessionId: string | null,
   *     occurrenceIds: number[],
   *     oneMonthBeforeRequested: boolean,
   *     oneWeekBeforeRequested: boolean,
   *     oneDayBeforeRequested: boolean,
   *   }
   * Should upsert one EventNotificationSubscription row per
   * occurrenceId, keyed on (email, eventOccurrenceId).
   */
  const EVENT_NOTIFICATION_SUBSCRIBE_ENDPOINT =
    "/register-events/event-notification-subscriptions";
  
  const DEFAULT_EVENT_TIMEZONE =
    "America/Denver";
  
  const DETAILS_RETRY_ATTEMPTS = 5;
  const DETAILS_RETRY_DELAY_MS = 1200;
  
  const EMAIL_PATTERN =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  /*
   * Single source of truth for the reminder checkboxes —
   * used to render the fieldset, validate selection, and
   * build the confirmation modal summary, so all three
   * always stay in sync.
   */
  const REMINDER_FREQUENCY_OPTIONS = [
    {
      key: "oneMonthBeforeRequested",
      label: "1 month before",
    },
    {
      key: "oneWeekBeforeRequested",
      label: "1 week before",
    },
    {
      key: "oneDayBeforeRequested",
      label: "1 day before",
    },
  ];
  
  const DEFAULT_REMINDER_FREQUENCIES =
    REMINDER_FREQUENCY_OPTIONS.reduce(
      (defaults, option) => ({
        ...defaults,
        [option.key]: true,
      }),
      {}
    );
  
  /*
   * Keeps date-only values from shifting through UTC.
   */
  const normalizeDateOnly = (value) => {
    if (!value) {
      return "";
    }
  
    const match = String(value)
      .trim()
      .match(/^(\d{4}-\d{2}-\d{2})/);
  
    return match ? match[1] : "";
  };
  
  const normalizeTimeOnly = (
    value,
    fallback = ""
  ) => {
    if (!value) {
      return fallback;
    }
  
    const match = String(value)
      .trim()
      .match(/^(\d{2}:\d{2})/);
  
    return match ? match[1] : fallback;
  };
  
  /*
   * Reservation objects may expose the occurrence's primary
   * key under any of these names depending on the endpoint.
   * Returns null (rather than a fallback string) when no real
   * ID is present, since a subscription must reference a real
   * EventOccurrence row.
   */
  const extractOccurrenceId = (
    reservation
  ) => {
    return (
      reservation.eventOccurrenceId ??
      reservation.occurrenceId ??
      reservation.occurrence_id ??
      null
    );
  };
  
  const formatDate = (value) => {
    const dateOnly =
      normalizeDateOnly(value);
  
    if (!dateOnly) {
      return "";
    }
  
    const [
      year,
      month,
      day,
    ] = dateOnly
      .split("-")
      .map(Number);
  
    const date = new Date(
      year,
      month - 1,
      day
    );
  
    return new Intl.DateTimeFormat(
      "en-US",
      {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }
    ).format(date);
  };
  
  const formatTime = (value) => {
    const normalizedTime =
      normalizeTimeOnly(value);
  
    if (!normalizedTime) {
      return "";
    }
  
    const [hour, minute] =
      normalizedTime
        .split(":")
        .map(Number);
  
    const date = new Date();
    date.setHours(
      hour,
      minute,
      0,
      0
    );
  
    return new Intl.DateTimeFormat(
      "en-US",
      {
        hour: "numeric",
        minute: "2-digit",
      }
    ).format(date);
  };
  
  const formatMoney = (
    cents,
    currency = "usd"
  ) => {
    const numericCents =
      Number(cents);
  
    if (
      !Number.isFinite(
        numericCents
      )
    ) {
      return "";
    }
  
    return new Intl.NumberFormat(
      "en-US",
      {
        style: "currency",
        currency:
          String(currency).toUpperCase(),
      }
    ).format(
      numericCents / 100
    );
  };
  
  const sleep = (milliseconds) =>
    new Promise((resolve) => {
      window.setTimeout(
        resolve,
        milliseconds
      );
    });
  
  const addMinutesToTime = (
    time,
    minutesToAdd
  ) => {
    const normalizedTime =
      normalizeTimeOnly(
        time,
        "00:00"
      );
  
    const [
      hours,
      minutes,
    ] = normalizedTime
      .split(":")
      .map(Number);
  
    const totalMinutes =
      hours * 60 +
      minutes +
      minutesToAdd;
  
    const normalizedTotal =
      (
        totalMinutes %
          (24 * 60) +
        24 * 60
      ) %
      (24 * 60);
  
    const finalHours =
      Math.floor(
        normalizedTotal / 60
      );
  
    const finalMinutes =
      normalizedTotal % 60;
  
    return `${String(
      finalHours
    ).padStart(2, "0")}:${String(
      finalMinutes
    ).padStart(2, "0")}`;
  };
  
  const toCompactCalendarDateTime = (
    date,
    time
  ) => {
    const dateOnly =
      normalizeDateOnly(date);
  
    const timeOnly =
      normalizeTimeOnly(
        time,
        "00:00"
      );
  
    if (!dateOnly) {
      return "";
    }
  
    return `${dateOnly.replaceAll(
      "-",
      ""
    )}T${timeOnly.replace(
      ":",
      ""
    )}00`;
  };
  
  const toCompactCalendarDate = (
    date
  ) => {
    return normalizeDateOnly(
      date
    ).replaceAll("-", "");
  };
  
  const addOneDay = (dateValue) => {
    const dateOnly =
      normalizeDateOnly(dateValue);
  
    if (!dateOnly) {
      return "";
    }
  
    const [
      year,
      month,
      day,
    ] = dateOnly
      .split("-")
      .map(Number);
  
    const date = new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );
  
    date.setUTCDate(
      date.getUTCDate() + 1
    );
  
    return [
      date.getUTCFullYear(),
      String(
        date.getUTCMonth() + 1
      ).padStart(2, "0"),
      String(
        date.getUTCDate()
      ).padStart(2, "0"),
    ].join("-");
  };
  
  const escapeIcsText = (value) => {
    return String(value || "")
      .replaceAll("\\", "\\\\")
      .replaceAll("\n", "\\n")
      .replaceAll(",", "\\,")
      .replaceAll(";", "\\;");
  };
  
  const createCalendarEntry = ({
    event,
    reservation,
  }) => {
    const occurrenceDate =
      normalizeDateOnly(
        reservation.occurrenceDate
      );
  
    const startTime =
      normalizeTimeOnly(
        event.startTime
      );
  
    const endTime =
      normalizeTimeOnly(
        event.endTime
      ) ||
      (
        startTime
          ? addMinutesToTime(
              startTime,
              60
            )
          : ""
      );
  
    return {
      id:
        reservation.id ||
        reservation.occurrenceId ||
        `${event.id}-${occurrenceDate}`,
  
      title:
        event.name ||
        "BakersBurns Event",
  
      description:
        event.description || "",
  
      location:
        event.location || "",
  
      occurrenceDate,
  
      startTime,
  
      endTime,
  
      quantity:
        Number(
          reservation.quantity || 0
        ),
  
      timezone:
        event.timezone ||
        DEFAULT_EVENT_TIMEZONE,
    };
  };
  
  const buildGoogleCalendarUrl = (
    entry
  ) => {
    const parameters =
      new URLSearchParams();
  
    parameters.set(
      "action",
      "TEMPLATE"
    );
  
    parameters.set(
      "text",
      entry.title
    );
  
    const descriptionParts = [
      entry.description,
  
      entry.quantity > 0
        ? `Tickets purchased: ${entry.quantity}`
        : "",
    ].filter(Boolean);
  
    parameters.set(
      "details",
      descriptionParts.join(
        "\n\n"
      )
    );
  
    if (entry.location) {
      parameters.set(
        "location",
        entry.location
      );
    }
  
    if (entry.startTime) {
      const start =
        toCompactCalendarDateTime(
          entry.occurrenceDate,
          entry.startTime
        );
  
      const end =
        toCompactCalendarDateTime(
          entry.occurrenceDate,
          entry.endTime
        );
  
      parameters.set(
        "dates",
        `${start}/${end}`
      );
  
      parameters.set(
        "ctz",
        entry.timezone
      );
    } else {
      const start =
        toCompactCalendarDate(
          entry.occurrenceDate
        );
  
      const end =
        toCompactCalendarDate(
          addOneDay(
            entry.occurrenceDate
          )
        );
  
      parameters.set(
        "dates",
        `${start}/${end}`
      );
    }
  
    return `https://calendar.google.com/calendar/render?${parameters.toString()}`;
  };
  
  const buildIcsContent = (
    entries
  ) => {
    const generatedAt =
      new Date()
        .toISOString()
        .replaceAll("-", "")
        .replaceAll(":", "")
        .replace(
          /\.\d{3}Z$/,
          "Z"
        );
  
    const calendarLines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//BakersBurns//Event Tickets//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];
  
    for (const entry of entries) {
      calendarLines.push(
        "BEGIN:VEVENT"
      );
  
      calendarLines.push(
        `UID:${escapeIcsText(
          `${entry.id}@bakersburns`
        )}`
      );
  
      calendarLines.push(
        `DTSTAMP:${generatedAt}`
      );
  
      if (entry.startTime) {
        calendarLines.push(
          `DTSTART;TZID=${entry.timezone}:${toCompactCalendarDateTime(
            entry.occurrenceDate,
            entry.startTime
          )}`
        );
  
        calendarLines.push(
          `DTEND;TZID=${entry.timezone}:${toCompactCalendarDateTime(
            entry.occurrenceDate,
            entry.endTime
          )}`
        );
      } else {
        calendarLines.push(
          `DTSTART;VALUE=DATE:${toCompactCalendarDate(
            entry.occurrenceDate
          )}`
        );
  
        calendarLines.push(
          `DTEND;VALUE=DATE:${toCompactCalendarDate(
            addOneDay(
              entry.occurrenceDate
            )
          )}`
        );
      }
  
      calendarLines.push(
        `SUMMARY:${escapeIcsText(
          entry.title
        )}`
      );
  
      const description = [
        entry.description,
  
        entry.quantity > 0
          ? `Tickets purchased: ${entry.quantity}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");
  
      if (description) {
        calendarLines.push(
          `DESCRIPTION:${escapeIcsText(
            description
          )}`
        );
      }
  
      if (entry.location) {
        calendarLines.push(
          `LOCATION:${escapeIcsText(
            entry.location
          )}`
        );
      }
  
      calendarLines.push(
        "STATUS:CONFIRMED"
      );
  
      calendarLines.push(
        "END:VEVENT"
      );
    }
  
    calendarLines.push(
      "END:VCALENDAR"
    );
  
    return calendarLines.join(
      "\r\n"
    );
  };
  
  const downloadIcsFile = (
    entries
  ) => {
    if (
      !Array.isArray(entries) ||
      entries.length === 0
    ) {
      return;
    }
  
    const contents =
      buildIcsContent(entries);
  
    const blob = new Blob(
      [contents],
      {
        type:
          "text/calendar;charset=utf-8",
      }
    );
  
    const objectUrl =
      URL.createObjectURL(blob);
  
    const anchor =
      document.createElement("a");
  
    anchor.href = objectUrl;
    anchor.download =
      entries.length === 1
        ? "bakersburns-event.ics"
        : "bakersburns-events.ics";
  
    document.body.appendChild(
      anchor
    );
  
    anchor.click();
    anchor.remove();
  
    URL.revokeObjectURL(
      objectUrl
    );
  };
  
  const EventCheckoutSuccess = () => {
    const [searchParams] =
      useSearchParams();
  
    const sessionId =
      searchParams.get(
        "session_id"
      );
  
    const [
      checkoutDetails,
      setCheckoutDetails,
    ] = useState(null);
  
    const [
      loading,
      setLoading,
    ] = useState(true);
  
    const [
      pageError,
      setPageError,
    ] = useState("");
  
    const [
      reminderEmail,
      setReminderEmail,
    ] = useState("");
  
    const [
      reminderFrequencies,
      setReminderFrequencies,
    ] = useState(
      DEFAULT_REMINDER_FREQUENCIES
    );
  
    const [
      reminderLoading,
      setReminderLoading,
    ] = useState(false);
  
    const [
      reminderError,
      setReminderError,
    ] = useState("");
  
    /*
     * null when closed. When a subscription succeeds this
     * holds the email + chosen frequency labels so the
     * confirmation modal can summarize what was saved.
     */
    const [
      reminderConfirmation,
      setReminderConfirmation,
    ] = useState(null);
  
    useEffect(() => {
      let isMounted = true;
  
      const loadCheckoutDetails =
        async () => {
          if (!sessionId) {
            if (isMounted) {
              setPageError(
                "The checkout session ID is missing."
              );
  
              setLoading(false);
            }
  
            return;
          }
  
          for (
            let attempt = 1;
            attempt <=
            DETAILS_RETRY_ATTEMPTS;
            attempt += 1
          ) {
            try {
              const response =
                await registerApi.get(
                  CHECKOUT_DETAILS_ENDPOINT,
                  {
                    params: {
                      sessionId,
                    },
                  }
                );
  
              if (!isMounted) {
                return;
              }
  
              setCheckoutDetails(
                response.data
              );
  
              const customerEmail =
                response.data
                  ?.customerEmail ||
                response.data
                  ?.purchaserEmail ||
                "";
  
              setReminderEmail(
                customerEmail
              );
  
              setPageError("");
              setLoading(false);
  
              return;
            } catch (error) {
              const status =
                error.response?.status;
  
              const canRetry =
                (
                  status === 404 ||
                  status === 409
                ) &&
                attempt <
                  DETAILS_RETRY_ATTEMPTS;
  
              if (canRetry) {
                await sleep(
                  DETAILS_RETRY_DELAY_MS
                );
  
                continue;
              }
  
              console.error(
                "Failed to load event checkout details:",
                error
              );
  
              if (isMounted) {
                setPageError(
                  error.response?.data
                    ?.message ||
                    "We could not load your event purchase details."
                );
  
                setLoading(false);
              }
  
              return;
            }
          }
        };
  
      loadCheckoutDetails();
  
      return () => {
        isMounted = false;
      };
    }, [sessionId]);
  
    /*
     * Closes the confirmation modal on Escape.
     */
    useEffect(() => {
      if (!reminderConfirmation) {
        return undefined;
      }
  
      const handleKeyDown = (
        keyboardEvent
      ) => {
        if (
          keyboardEvent.key ===
          "Escape"
        ) {
          setReminderConfirmation(
            null
          );
        }
      };
  
      document.addEventListener(
        "keydown",
        handleKeyDown
      );
  
      return () => {
        document.removeEventListener(
          "keydown",
          handleKeyDown
        );
      };
    }, [reminderConfirmation]);
  
    const event =
      checkoutDetails?.event || {};
  
    const reservations =
      Array.isArray(
        checkoutDetails?.reservations
      )
        ? checkoutDetails.reservations
        : [];
  
    const calendarEntries =
      useMemo(() => {
        return reservations
          .map((reservation) =>
            createCalendarEntry({
              event,
              reservation,
            })
          )
          .filter(
            (entry) =>
              entry.occurrenceDate
          );
      }, [
        event,
        reservations,
      ]);
  
    const totalTickets =
      useMemo(() => {
        return reservations.reduce(
          (
            total,
            reservation
          ) =>
            total +
            Number(
              reservation.quantity ||
                0
            ),
          0
        );
      }, [reservations]);
  
    /*
     * The dates a reminder subscription can actually be
     * attached to — only reservations that carry a real
     * EventOccurrence ID qualify.
     */
    const reminderEligibleDates =
      useMemo(() => {
        return reservations
          .map((reservation) => {
            const occurrenceId =
              extractOccurrenceId(
                reservation
              );
  
            const occurrenceDate =
              normalizeDateOnly(
                reservation.occurrenceDate
              );
  
            if (
              !occurrenceId ||
              !occurrenceDate
            ) {
              return null;
            }
  
            return {
              occurrenceId,
              occurrenceDate,
            };
          })
          .filter(Boolean);
      }, [reservations]);
  
    const totalPaid =
      checkoutDetails
        ?.amountTotal;
  
    const currency =
      checkoutDetails
        ?.currency || "usd";
  
    const toggleReminderFrequency = (
      frequencyKey
    ) => {
      setReminderFrequencies(
        (previous) => ({
          ...previous,
          [frequencyKey]:
            !previous[
              frequencyKey
            ],
        })
      );
  
      setReminderError("");
    };
  
    const submitReminderSubscription =
      async (submitEvent) => {
        submitEvent.preventDefault();
  
        const normalizedEmail =
          reminderEmail
            .trim()
            .toLowerCase();
  
        setReminderError("");
  
        if (
          !EMAIL_PATTERN.test(
            normalizedEmail
          )
        ) {
          setReminderError(
            "Enter a valid email address."
          );
  
          return;
        }
  
        const selectedFrequencyOptions =
          REMINDER_FREQUENCY_OPTIONS.filter(
            (option) =>
              reminderFrequencies[
                option.key
              ]
          );
  
        if (
          selectedFrequencyOptions.length ===
          0
        ) {
          setReminderError(
            "Select at least one reminder timing."
          );
  
          return;
        }
  
        if (
          reminderEligibleDates.length ===
          0
        ) {
          setReminderError(
            "Reminders are not available for this booking."
          );
  
          return;
        }
  
        try {
          setReminderLoading(true);
  
          await registerApi.post(
            EVENT_NOTIFICATION_SUBSCRIBE_ENDPOINT,
            {
              email:
                normalizedEmail,
  
              eventId:
                event.id || null,
  
              sessionId,
  
              occurrenceIds:
                reminderEligibleDates.map(
                  (date) =>
                    date.occurrenceId
                ),
  
              ...reminderFrequencies,
            }
          );
  
          setReminderConfirmation({
            email:
              normalizedEmail,
            frequencyLabels:
              selectedFrequencyOptions.map(
                (option) =>
                  option.label
              ),
          });
        } catch (error) {
          console.error(
            "Failed to subscribe to event reminders:",
            error
          );
  
          setReminderError(
            error.response?.data
              ?.message ||
              "We could not save your reminder preferences."
          );
        } finally {
          setReminderLoading(
            false
          );
        }
      };
  
    if (loading) {
      return (
        <main className="event-success-page">
          <section className="event-success-shell">
            <div className="event-success-loading">
              <div
                className="event-success-spinner"
                aria-hidden="true"
              />
  
              <h1>
                Confirming your purchase
              </h1>
  
              <p>
                We are loading your
                event details.
              </p>
            </div>
          </section>
        </main>
      );
    }
  
    if (
      pageError ||
      !checkoutDetails
    ) {
      return (
        <main className="event-success-page">
          <section className="event-success-shell">
            <div className="event-success-error">
              <span
                className="event-success-error__icon"
                aria-hidden="true"
              >
                !
              </span>
  
              <h1>
                Purchase completed
              </h1>
  
              <p>
                {pageError ||
                  "Your payment was received, but the purchase details are not currently available."}
              </p>
  
              <p className="event-success-error__note">
                Your payment confirmation
                email and Stripe receipt
                remain valid.
              </p>
  
              <Link
                className="event-success-button event-success-button--primary"
                to="/events"
              >
                Return to events
              </Link>
            </div>
          </section>
        </main>
      );
    }
  
    return (
      <main className="event-success-page">
        <section className="event-success-shell">
          <header className="event-success-hero">
            <div
              className="event-success-checkmark"
              aria-hidden="true"
            >
              ✓
            </div>
  
            <span className="event-success-eyebrow">
              Payment successful
            </span>
  
            <h1>
              Thank you for your purchase!
            </h1>
  
            <p>
              Your tickets have been
              reserved. Save the event to
              your calendar so you do not
              miss it.
            </p>
  
            {checkoutDetails
              ?.customerEmail && (
              <span className="event-success-confirmation">
                Confirmation sent to{" "}
                <strong>
                  {
                    checkoutDetails.customerEmail
                  }
                </strong>
              </span>
            )}
          </header>
  
          <section className="event-success-summary">
            <div className="event-success-summary__heading">
              <div>
                <span>
                  Your event
                </span>
  
                <h2>
                  {event.name ||
                    "BakersBurns Event"}
                </h2>
              </div>
  
              {Number.isFinite(
                Number(totalPaid)
              ) && (
                <strong>
                  {formatMoney(
                    totalPaid,
                    currency
                  )}
                </strong>
              )}
            </div>
  
            {event.description && (
              <p className="event-success-description">
                {event.description}
              </p>
            )}
  
            {event.location && (
              <div className="event-success-location">
                <span>
                  Location
                </span>
  
                <strong>
                  {event.location}
                </strong>
              </div>
            )}
  
            <div className="event-success-ticket-total">
              <span>
                Total tickets
              </span>
  
              <strong>
                {totalTickets}
              </strong>
            </div>
          </section>
  
          <section className="event-success-dates">
            <div className="event-success-section-heading">
              <span>
                Scheduled dates
              </span>
  
              <h2>
                Add your event to a
                calendar
              </h2>
  
              <p>
                The calendar file works
                with Apple Calendar,
                iPhone, Android, Outlook,
                and most calendar apps.
              </p>
            </div>
  
            <div className="event-success-date-list">
              {calendarEntries.map(
                (entry) => (
                  <article
                    className="event-success-date-card"
                    key={entry.id}
                  >
                    <div className="event-success-date-card__details">
                      <span className="event-success-date-card__date">
                        {formatDate(
                          entry.occurrenceDate
                        )}
                      </span>
  
                      {entry.startTime && (
                        <strong>
                          {formatTime(
                            entry.startTime
                          )}
  
                          {entry.endTime
                            ? ` – ${formatTime(
                                entry.endTime
                              )}`
                            : ""}
                        </strong>
                      )}
  
                      <span>
                        {entry.quantity}{" "}
                        ticket
                        {entry.quantity ===
                        1
                          ? ""
                          : "s"}
                      </span>
                    </div>
  
  
                    <a
                      className="event-success-button event-success-button--google"
                      href={buildGoogleCalendarUrl(
                        entry
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Add to Google
                      Calendar
                    </a>
                  </article>
                )
              )}
            </div>
  
            <button
              type="button"
              className="event-success-button event-success-button--calendar"
              onClick={() =>
                downloadIcsFile(
                  calendarEntries
                )
              }
              disabled={
                calendarEntries.length ===
                0
              }
            >
              Save to Apple / Phone
              Calendar
            </button>
          </section>
  
          <section className="event-success-updates">
            <div>
              <span className="event-success-eyebrow">
                Stay informed
              </span>
  
              <h2>
                Get reminders as the
                date approaches
              </h2>
  
              <p>
                Choose when you'd like a
                reminder email before{" "}
                {reminderEligibleDates.length >
                1
                  ? "each date you're attending"
                  : "the event"}
                . All three are on by
                default — just confirm
                your email and hit
                subscribe.
              </p>
            </div>
  
            {reminderEligibleDates.length ===
            0 ? (
              <p className="event-success-form-message event-success-form-message--error">
                Reminders are not
                currently available
                for this booking.
              </p>
            ) : (
              <form
                className="event-success-updates__form"
                onSubmit={
                  submitReminderSubscription
                }
              >
                <label htmlFor="eventReminderEmail">
                  Email address
                </label>
  
                <div className="event-success-updates__controls">
                  <input
                    id="eventReminderEmail"
                    type="email"
                    value={
                      reminderEmail
                    }
                    onChange={(
                      changeEvent
                    ) => {
                      setReminderEmail(
                        changeEvent
                          .target.value
                      );
  
                      setReminderError(
                        ""
                      );
                    }}
                    placeholder="you@example.com"
                    autoComplete="email"
                    disabled={
                      reminderLoading
                    }
                  />
                </div>
  
                <fieldset className="event-success-frequency-fieldset">
                  <legend>
                    Remind me
                  </legend>
  
                  {REMINDER_FREQUENCY_OPTIONS.map(
                    (option) => (
                      <label
                        className="event-success-checkbox"
                        key={
                          option.key
                        }
                      >
                        <input
                          type="checkbox"
                          className="event-success-checkbox-input"
                          checked={
                            reminderFrequencies[
                              option.key
                            ]
                          }
                          onChange={() =>
                            toggleReminderFrequency(
                              option.key
                            )
                          }
                          disabled={
                            reminderLoading
                          }
                        />
  
                        <span
                          className="event-success-checkbox-box"
                          aria-hidden="true"
                        />
  
                        <span className="event-success-checkbox-label">
                          {option.label}
                        </span>
                      </label>
                    )
                  )}
                </fieldset>
  
                <button
                  type="submit"
                  className="event-success-button event-success-button--primary"
                  disabled={
                    reminderLoading
                  }
                >
                  {reminderLoading
                    ? "Saving..."
                    : "Subscribe to reminders"}
                </button>
  
                {reminderError && (
                  <p
                    className="event-success-form-message event-success-form-message--error"
                    role="alert"
                  >
                    {reminderError}
                  </p>
                )}
              </form>
            )}
          </section>
  
          <footer className="event-success-footer">
            <Link
              className="event-success-button event-success-button--secondary"
              to="/events"
            >
              View more events
            </Link>
  
            <Link
              className="event-success-home-link"
              to="/"
            >
              Return home
            </Link>
          </footer>
        </section>
  
        {reminderConfirmation && (
          <div
            className="event-reminder-confirm-backdrop"
            role="presentation"
            onMouseDown={(
              mouseEvent
            ) => {
              if (
                mouseEvent.target ===
                mouseEvent.currentTarget
              ) {
                setReminderConfirmation(
                  null
                );
              }
            }}
          >
            <section
              className="event-reminder-confirm-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="event-reminder-confirm-title"
            >
              <header className="event-reminder-confirm-modal__header">
                <h2 id="event-reminder-confirm-title">
                  You're all set
                </h2>
  
                <button
                  type="button"
                  className="event-reminder-confirm-modal__close"
                  aria-label="Close confirmation"
                  onClick={() =>
                    setReminderConfirmation(
                      null
                    )
                  }
                >
                  ×
                </button>
              </header>
  
              <div className="event-reminder-confirm-modal__body">
                <p>
                  We'll email{" "}
                  <strong>
                    {
                      reminderConfirmation.email
                    }
                  </strong>{" "}
                  reminders for{" "}
                  {event.name ||
                    "this event"}
                  :
                </p>
  
                <ul className="event-reminder-confirm-modal__list">
                  {reminderConfirmation.frequencyLabels.map(
                    (label) => (
                      <li key={label}>
                        {label}
                      </li>
                    )
                  )}
                </ul>
              </div>
  
              <div className="event-reminder-confirm-modal__footer">
                <button
                  type="button"
                  className="event-reminder-confirm-modal__done"
                  onClick={() =>
                    setReminderConfirmation(
                      null
                    )
                  }
                >
                  Done
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    );
  };
  
  export default EventCheckoutSuccess;