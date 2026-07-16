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
  
  const EVENT_UPDATES_ENDPOINT =
    "/register-events/event-updates";
  
  const DEFAULT_EVENT_TIMEZONE =
    "America/Denver";
  
  const DETAILS_RETRY_ATTEMPTS = 5;
  const DETAILS_RETRY_DELAY_MS = 1200;
  
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
      updatesEmail,
      setUpdatesEmail,
    ] = useState("");
  
    const [
      signupLoading,
      setSignupLoading,
    ] = useState(false);
  
    const [
      signupMessage,
      setSignupMessage,
    ] = useState("");
  
    const [
      signupError,
      setSignupError,
    ] = useState("");
  
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
  
              setUpdatesEmail(
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
  
    const totalPaid =
      checkoutDetails
        ?.amountTotal;
  
    const currency =
      checkoutDetails
        ?.currency || "usd";
  
    const submitUpdatesSignup =
      async (submitEvent) => {
        submitEvent.preventDefault();
  
        const normalizedEmail =
          updatesEmail
            .trim()
            .toLowerCase();
  
        setSignupMessage("");
        setSignupError("");
  
        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            normalizedEmail
          )
        ) {
          setSignupError(
            "Enter a valid email address."
          );
  
          return;
        }
  
        try {
          setSignupLoading(true);
  
          const response =
            await registerApi.post(
              EVENT_UPDATES_ENDPOINT,
              {
                email:
                  normalizedEmail,
  
                sessionId,
  
                eventId:
                  event.id || null,
  
                source:
                  "event-checkout-success",
              }
            );
  
          setSignupMessage(
            response.data?.message ||
              "You are signed up for event updates."
          );
        } catch (error) {
          console.error(
            "Failed to sign up for event updates:",
            error
          );
  
          setSignupError(
            error.response?.data
              ?.message ||
              "We could not complete your signup."
          );
        } finally {
          setSignupLoading(false);
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
                Get updates about your
                upcoming events
              </h2>
  
              <p>
                Receive schedule changes,
                reminders, and important
                information about events
                you purchased.
              </p>
            </div>
  
            <form
              className="event-success-updates__form"
              onSubmit={
                submitUpdatesSignup
              }
            >
              <label htmlFor="eventUpdatesEmail">
                Email address
              </label>
  
              <div className="event-success-updates__controls">
                <input
                  id="eventUpdatesEmail"
                  type="email"
                  value={
                    updatesEmail
                  }
                  onChange={(
                    changeEvent
                  ) => {
                    setUpdatesEmail(
                      changeEvent
                        .target.value
                    );
  
                    setSignupMessage(
                      ""
                    );
  
                    setSignupError(
                      ""
                    );
                  }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={
                    signupLoading
                  }
                />
  
                <button
                  type="submit"
                  className="event-success-button event-success-button--primary"
                  disabled={
                    signupLoading
                  }
                >
                  {signupLoading
                    ? "Signing up..."
                    : "Sign up for updates"}
                </button>
              </div>
  
              {signupMessage && (
                <p
                  className="event-success-form-message event-success-form-message--success"
                  role="status"
                >
                  {signupMessage}
                </p>
              )}
  
              {signupError && (
                <p
                  className="event-success-form-message event-success-form-message--error"
                  role="alert"
                >
                  {signupError}
                </p>
              )}
            </form>
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
      </main>
    );
  };
  
  export default EventCheckoutSuccess;