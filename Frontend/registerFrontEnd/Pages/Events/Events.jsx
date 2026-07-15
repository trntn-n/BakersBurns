/* register/Events.jsx */
import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import Cookies from "js-cookie";
import moment from "moment";

import { registerApi } from "../../config/axios";
import "./Event.css";
import TicketQuantityModal from "./TicketQuantityModal";

const EVENTS_ENDPOINT =
  "/register-events/all";

const CHECKOUT_ENDPOINT =
  "/register-events/checkout-events";

const cookieOptions = {
  expires: 1,
  path: "/",
  sameSite: "Lax",
  secure:
    window.location.protocol === "https:",
};

/*
 * Converts database/backend boolean values into
 * a predictable JavaScript boolean.
 */
const normalizeBoolean = (value) => {
  if (
    value === true ||
    value === 1 ||
    value === "1"
  ) {
    return true;
  }

  if (
    value === false ||
    value === 0 ||
    value === "0" ||
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return false;
  }

  if (typeof value === "string") {
    const normalizedValue = value
      .trim()
      .toLowerCase();

    return [
      "true",
      "yes",
      "y",
      "on",
    ].includes(normalizedValue);
  }

  return false;
};

/*
 * Supports days arriving as:
 *
 * ["Monday", "Wednesday"]
 * "Monday,Wednesday"
 * '["Monday","Wednesday"]'
 */
const normalizeDays = (days) => {
  if (Array.isArray(days)) {
    return days
      .map((day) =>
        String(day).trim()
      )
      .filter(Boolean);
  }

  if (typeof days !== "string") {
    return [];
  }

  const trimmedDays = days.trim();

  if (!trimmedDays) {
    return [];
  }

  try {
    const parsedDays =
      JSON.parse(trimmedDays);

    if (Array.isArray(parsedDays)) {
      return parsedDays
        .map((day) =>
          String(day).trim()
        )
        .filter(Boolean);
    }
  } catch (error) {
    /*
     * The value is probably comma-separated
     * rather than JSON.
     */
  }

  return trimmedDays
    .split(",")
    .map((day) => day.trim())
    .filter(Boolean);
};

/*
 * Calendar dates are not timestamps. Preserve the
 * YYYY-MM-DD portion without converting through UTC
 * or the browser's local timezone.
 */
const normalizeDateOnly = (value) => {
  if (!value) {
    return "";
  }

  const stringValue = String(value).trim();
  const match = stringValue.match(
    /^(\d{4}-\d{2}-\d{2})/
  );

  return match ? match[1] : "";
};

const parseDateOnly = (value) => {
  const dateOnly = normalizeDateOnly(value);

  if (!dateOnly) {
    return moment.invalid();
  }

  return moment(
    dateOnly,
    "YYYY-MM-DD",
    true
  );
};

const formatDateOnly = (
  value,
  format
) => {
  const parsedDate =
    parseDateOnly(value);

  return parsedDate.isValid()
    ? parsedDate.format(format)
    : "";
};

/*
 * Normalizes backend/database field names so the
 * component works with either snake_case or camelCase.
 */
const normalizeEvent = (event) => {
  if (
    !event ||
    typeof event !== "object"
  ) {
    return null;
  }

  const rawPrice =
    event.price ??
    event.ticket_price ??
    event.ticketPrice ??
    0;

  const parsedPrice =
    Number(rawPrice);

  return {
    ...event,

    id:
      event.id ??
      event.event_id ??
      event.eventId,

    name:
      event.name ??
      event.event_name ??
      event.eventName ??
      event.title ??
      "Untitled event",

    description:
      event.description ??
      event.event_description ??
      event.eventDescription ??
      "",

    startDate: normalizeDateOnly(
      event.startDate ??
      event.start_date ??
      event.date
    ),

    endDate:
      normalizeDateOnly(
        event.endDate ??
        event.end_date
      ) ||
      normalizeDateOnly(
        event.startDate ??
        event.start_date ??
        event.date
      ),

    startTime:
      event.startTime ??
      event.start_time ??
      null,

    endTime:
      event.endTime ??
      event.end_time ??
      null,

    frequency:
      (
        event.frequency ??
        event.event_frequency ??
        "single"
      )
        .toString()
        .trim()
        .toLowerCase(),

    days: normalizeDays(
      event.days ??
      event.event_days ??
      event.selectedDays ??
      event.selected_days
    ),

    isPurchase: normalizeBoolean(
      event.isPurchase ??
      event.is_purchase ??
      event.purchaseRequired ??
      event.purchase_required
    ),

    occurrences: Array.isArray(
      event.occurrences
    )
      ? event.occurrences
          .map((occurrence) => {
            const occurrenceDate =
              normalizeDateOnly(
                occurrence.occurrenceDate ??
                occurrence.occurrence_date ??
                occurrence.date
              );

            if (!occurrenceDate) {
              return null;
            }

            return {
              ...occurrence,
              occurrenceDate,
              isActive: normalizeBoolean(
                occurrence.isActive ??
                occurrence.is_active ??
                true
              ),
              capacity: Number(
                occurrence.capacity ?? 0
              ),
              reservedCount: Number(
                occurrence.reservedCount ??
                occurrence.reserved_count ??
                0
              ),
              soldCount: Number(
                occurrence.soldCount ??
                occurrence.sold_count ??
                0
              ),
            };
          })
          .filter(Boolean)
      : [],

    price:
      Number.isFinite(parsedPrice)
        ? parsedPrice
        : 0,
  };
};

const parseEventDateTime = (
  date,
  time = "00:00"
) => {
  if (!date) {
    return moment.invalid();
  }

  const dateOnly =
    parseDateOnly(date);

  if (!dateOnly.isValid()) {
    return moment.invalid();
  }

  const parsedTime = moment(
    time || "00:00",
    [
      "HH:mm:ss",
      "HH:mm",
      "h:mm A",
      "hh:mm A",
    ],
    true
  );

  const eventDateTime =
    dateOnly.clone();

  if (parsedTime.isValid()) {
    eventDateTime
      .hour(parsedTime.hour())
      .minute(parsedTime.minute())
      .second(parsedTime.second());
  } else {
    eventDateTime.startOf("day");
  }

  return eventDateTime;
};

const formatTime = (time) => {
  if (!time) {
    return "";
  }

  const parsedTime = moment(
    time,
    [
      "HH:mm:ss",
      "HH:mm",
      "h:mm A",
      "hh:mm A",
    ],
    true
  );

  return parsedTime.isValid()
    ? parsedTime.format("h:mm A")
    : time;
};

const formatPrice = (price) => {
  const parsedPrice =
    Number(price);

  return Number.isFinite(parsedPrice)
    ? parsedPrice.toFixed(2)
    : "0.00";
};

/*
 * Expands recurring events into individual calendar
 * occurrences between startDate and endDate.
 */
const buildOccurrences = (event) => {
  if (!event?.startDate) {
    return [];
  }

  /*
   * Prefer the authoritative occurrence rows returned
   * by the backend. Stripe checkout validates against
   * EventOccurrences, so the calendar and checkout
   * must use those exact date strings.
   */
  if (
    Array.isArray(event.occurrences) &&
    event.occurrences.length > 0
  ) {
    return event.occurrences
      .filter(
        (occurrence) =>
          occurrence.isActive !== false
      )
      .map((occurrence) => ({
        ...event,
        occurrenceId:
          occurrence.id ??
          occurrence.occurrenceId ??
          occurrence.occurrence_id,
        occurrenceDate:
          normalizeDateOnly(
            occurrence.occurrenceDate
          ),
        capacity: Number(
          occurrence.capacity ?? 0
        ),
        reservedCount: Number(
          occurrence.reservedCount ?? 0
        ),
        soldCount: Number(
          occurrence.soldCount ?? 0
        ),
      }))
      .filter(
        (occurrence) =>
          occurrence.occurrenceDate
      );
  }

  /*
   * Legacy fallback for API responses that do not yet
   * include nested EventOccurrences.
   */
  const startDate =
    parseDateOnly(event.startDate);

  const endDate =
    parseDateOnly(
      event.endDate ||
      event.startDate
    );

  if (!startDate.isValid()) {
    return [];
  }

  const safeEndDate =
    endDate.isValid()
      ? endDate
      : startDate.clone();

  /*
   * Prevent malformed end dates from causing the
   * recurrence loop to run backward.
   */
  if (
    safeEndDate.isBefore(
      startDate,
      "day"
    )
  ) {
    safeEndDate.set({
      year: startDate.year(),
      month: startDate.month(),
      date: startDate.date(),
    });
  }

  const isSingleEvent =
    event.frequency === "single" ||
    event.frequency === "once" ||
    startDate.isSame(
      safeEndDate,
      "day"
    );

  if (isSingleEvent) {
    return [
      {
        ...event,
        occurrenceDate:
          startDate.format(
            "YYYY-MM-DD"
          ),
      },
    ];
  }

  const selectedDays =
    normalizeDays(event.days)
      .map((day) =>
        day.toLowerCase()
      );

  /*
   * If a repeating event has no days selected,
   * show it on its start date rather than hiding it.
   */
  if (selectedDays.length === 0) {
    return [
      {
        ...event,
        occurrenceDate:
          startDate.format(
            "YYYY-MM-DD"
          ),
      },
    ];
  }

  const occurrences = [];
  const cursor =
    startDate.clone();

  while (
    cursor.isSameOrBefore(
      safeEndDate,
      "day"
    )
  ) {
    const fullDayName = cursor
      .format("dddd")
      .toLowerCase();

    const shortDayName = cursor
      .format("ddd")
      .toLowerCase();

    const matchingDay =
      selectedDays.some(
        (selectedDay) =>
          selectedDay ===
            fullDayName ||
          selectedDay ===
            shortDayName ||
          fullDayName.startsWith(
            selectedDay
          ) ||
          selectedDay.startsWith(
            shortDayName
          )
      );

    if (matchingDay) {
      occurrences.push({
        ...event,
        occurrenceDate:
          cursor.format(
            "YYYY-MM-DD"
          ),
      });
    }

    cursor.add(1, "day");
  }

  return occurrences;
};

const EventCalendar = () => {
  const navigate = useNavigate();

  const [events, setEvents] =
    useState([]);

  const [
    currentMonth,
    setCurrentMonth,
  ] = useState(
    moment().startOf("month")
  );

  const [
    selectedDate,
    setSelectedDate,
  ] = useState(
    moment().format("YYYY-MM-DD")
  );

  const [loading, setLoading] =
    useState(true);

  const [
    fetchError,
    setFetchError,
  ] = useState("");

  const [
    checkoutEventId,
    setCheckoutEventId,
  ] = useState(null);

  const [
    checkoutError,
    setCheckoutError,
  ] = useState("");

  const [
    checkoutModalEvent,
    setCheckoutModalEvent,
  ] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const fetchEvents = async () => {
      try {
        setLoading(true);
        setFetchError("");

        const response =
          await registerApi.get(
            EVENTS_ENDPOINT
          );

        /*
         * Supports any of these response shapes:
         *
         * [event, event]
         * { events: [event, event] }
         * { data: [event, event] }
         */
        const responseEvents =
          Array.isArray(response.data)
            ? response.data
            : Array.isArray(
                  response.data?.events
                )
              ? response.data.events
              : Array.isArray(
                    response.data?.data
                  )
                ? response.data.data
                : [];

        const normalizedEvents =
          responseEvents
            .map(normalizeEvent)
            .filter(Boolean);

        if (isMounted) {
          setEvents(
            normalizedEvents
          );
        }
      } catch (error) {
        console.error(
          "Failed to fetch events:",
          error
        );

        if (isMounted) {
          setFetchError(
            error.response?.data
              ?.message ||
              "We could not load the event calendar."
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchEvents();

    return () => {
      isMounted = false;
    };
  }, []);

  const occurrences = useMemo(
    () => {
      return events
        .flatMap(buildOccurrences)
        .filter(
          (event) =>
            event.occurrenceDate
        )
        .sort(
          (
            firstEvent,
            secondEvent
          ) => {
            const firstDateTime =
              parseEventDateTime(
                firstEvent
                  .occurrenceDate,
                firstEvent.startTime
              );

            const secondDateTime =
              parseEventDateTime(
                secondEvent
                  .occurrenceDate,
                secondEvent.startTime
              );

            return (
              firstDateTime.valueOf() -
              secondDateTime.valueOf()
            );
          }
        );
    },
    [events]
  );

  const eventsByDate = useMemo(
    () => {
      return occurrences.reduce(
        (calendar, event) => {
          const date =
            event.occurrenceDate;

          if (!calendar[date]) {
            calendar[date] = [];
          }

          calendar[date].push(
            event
          );

          return calendar;
        },
        {}
      );
    },
    [occurrences]
  );

  /*
   * Uses the current exact time rather than only the
   * current day. This prevents an event that already
   * started earlier today from being selected as next.
   */
  const upcomingEvents = useMemo(
    () => {
      const now = moment();

      return occurrences.filter(
        (event) => {
          const eventDateTime =
            parseEventDateTime(
              event.occurrenceDate,
              event.startTime
            );

          if (
            !eventDateTime.isValid()
          ) {
            return false;
          }

          /*
           * Events without a start time remain
           * upcoming through the end of the day.
           */
          if (!event.startTime) {
            return parseDateOnly(
              event.occurrenceDate
            )
              .endOf("day")
              .isSameOrAfter(now);
          }

          return eventDateTime
            .isSameOrAfter(now);
        }
      );
    },
    [occurrences]
  );

  const featuredEvent =
    upcomingEvents.length > 0
      ? upcomingEvents[0]
      : null;

  /*
   * Automatically move the calendar and selected-date
   * panel to the nearest upcoming event after loading.
   */
  useEffect(() => {
    if (
      !featuredEvent
        ?.occurrenceDate
    ) {
      return;
    }

    const featuredDate = moment(
      featuredEvent
        .occurrenceDate,
      "YYYY-MM-DD",
      true
    );

    if (
      !featuredDate.isValid()
    ) {
      return;
    }

    setSelectedDate(
      featuredDate.format(
        "YYYY-MM-DD"
      )
    );

    setCurrentMonth(
      featuredDate
        .clone()
        .startOf("month")
    );
  }, [
    featuredEvent?.id,
    featuredEvent?.occurrenceDate,
  ]);

  const selectedEvents =
    eventsByDate[selectedDate] ||
    [];

  const calendarDays = useMemo(
    () => {
      const calendarStart =
        currentMonth
          .clone()
          .startOf("month")
          .startOf("week");

      const calendarEnd =
        currentMonth
          .clone()
          .endOf("month")
          .endOf("week");

      const days = [];
      const cursor =
        calendarStart.clone();

      while (
        cursor.isSameOrBefore(
          calendarEnd,
          "day"
        )
      ) {
        days.push(
          cursor.clone()
        );

        cursor.add(1, "day");
      }

      return days;
    },
    [currentMonth]
  );

  const selectDay = (date) => {
    setSelectedDate(
      date.format(
        "YYYY-MM-DD"
      )
    );

    setCheckoutError("");
  };

  const goToPreviousMonth =
    () => {
      setCurrentMonth(
        (previousMonth) =>
          previousMonth
            .clone()
            .subtract(
              1,
              "month"
            )
      );
    };

  const goToNextMonth = () => {
    setCurrentMonth(
      (previousMonth) =>
        previousMonth
          .clone()
          .add(
            1,
            "month"
          )
    );
  };

  const goToCurrentMonth =
    () => {
      const today = moment();

      setCurrentMonth(
        today
          .clone()
          .startOf("month")
      );

      setSelectedDate(
        today.format(
          "YYYY-MM-DD"
        )
      );

      setCheckoutError("");
    };

  /*
   * Starts Stripe ticket checkout after acceptance
   * has already been confirmed.
   */
  const startTicketCheckout =
    async ({
      eventId,
      selections,
    }) => {
      try {
        setCheckoutError("");
        setCheckoutEventId(
          eventId
        );

        const normalizedSelections =
          Array.isArray(selections)
            ? selections
                .map((selection) => ({
                  ...selection,
                  occurrenceDate:
                    normalizeDateOnly(
                      selection.occurrenceDate
                    ),
                }))
                .filter(
                  (selection) =>
                    selection.occurrenceDate
                )
            : [];

        if (
          normalizedSelections.length === 0
        ) {
          throw new Error(
            "Select at least one available event date."
          );
        }

        const response =
          await registerApi.post(
            CHECKOUT_ENDPOINT,
            {
              eventId,
              selections:
                normalizedSelections,

              metadata: {
                hasAcceptedPrivacy:
                  true,

                hasAcceptedTermsOfService:
                  true,
              },
            }
          );

        const checkoutUrl =
          response.data?.url ||
          response.data
            ?.checkoutUrl ||
          response.data
            ?.checkout_url;

        if (!checkoutUrl) {
          throw new Error(
            "Checkout URL was not returned."
          );
        }

        Cookies.remove(
          "checkoutType",
          {
            path: "/",
          }
        );

        Cookies.remove(
          "pendingTicketCheckout",
          {
            path: "/",
          }
        );

        window.location.assign(
          checkoutUrl
        );
      } catch (error) {
        console.error(
          "Event checkout failed:",
          error
        );

        setCheckoutError(
          error.response?.data
            ?.message ||
            error.message ||
            "Ticket checkout could not be started."
        );
      } finally {
        setCheckoutEventId(
          null
        );
      }
    };

  const continueTicketCheckout =
    async ({
      eventId,
      selections,
    }) => {
      const hasAcceptedPrivacy =
        Cookies.get(
          "hasAcceptedPrivacy"
        ) === "true";

      const hasAcceptedTerms =
        Cookies.get(
          "hasAcceptedTerms"
        ) === "true";

      if (
        hasAcceptedPrivacy &&
        hasAcceptedTerms
      ) {
        await startTicketCheckout({
          eventId,
          selections,
        });

        return;
      }

      Cookies.set(
        "checkoutType",
        "ticket",
        cookieOptions
      );

      Cookies.set(
        "pendingTicketCheckout",
        JSON.stringify({
          eventId,
          selections,
        }),
        cookieOptions
      );

      Cookies.remove(
        "shippingDetails",
        {
          path: "/",
        }
      );

      navigate(
        "/accept-privacy-terms"
      );
    };

  const beginCheckout =
    (event) => {
      if (!event?.id) {
        setCheckoutError(
          "This event cannot currently be purchased."
        );

        return;
      }

      setCheckoutError("");
      setCheckoutModalEvent(event);
    };

  const renderPurchaseButton = (
    event,
    className = ""
  ) => {
    if (!event) {
      return null;
    }

    const isPurchase =
      normalizeBoolean(
        event.isPurchase
      );

    if (!isPurchase) {
      return (
        <span className="customer-event-free">
          Free event
        </span>
      );
    }

    return (
      <button
        type="button"
        className={[
          "customer-event-purchase-button",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={
          checkoutEventId ===
          event.id
        }
        onClick={() =>
          beginCheckout(event)
        }
      >
        {checkoutEventId ===
        event.id
          ? "Opening checkout..."
          : `Buy tickets — $${formatPrice(
              event.price
            )}`}
      </button>
    );
  };

  return (
    <main className="customer-events-page">
      <div className="customer-events-shell">
        <header className="customer-events-heading">
          <div>
            <span className="customer-events-eyebrow">
              BakersBurns Events
            </span>

            <h1>
              Upcoming Events
            </h1>

            <p>
              Explore upcoming events,
              select a date, and
              purchase tickets securely
              online.
            </p>
          </div>
        </header>

        {fetchError && (
          <div
            className="customer-events-alert"
            role="alert"
          >
            {fetchError}
          </div>
        )}

        {checkoutError && (
          <div
            className="customer-events-alert"
            role="alert"
          >
            {checkoutError}
          </div>
        )}

        {loading && (
          <div className="customer-events-empty">
            Loading upcoming
            events...
          </div>
        )}

        {!loading &&
          featuredEvent && (
            <section className="featured-event">
              <div className="featured-event-date">
                <span className="featured-event-month">
                  {formatDateOnly(
                    featuredEvent
                      .occurrenceDate,
                    "MMM"
                  )}
                </span>

                <strong>
                  {formatDateOnly(
                    featuredEvent
                      .occurrenceDate,
                    "D"
                  )}
                </strong>

                <span>
                  {formatDateOnly(
                    featuredEvent
                      .occurrenceDate,
                    "YYYY"
                  )}
                </span>
              </div>

              <div className="featured-event-content">
                <span className="featured-event-label">
                  Next event
                </span>

                <h2>
                  {featuredEvent.name}
                </h2>

                {featuredEvent
                  .description && (
                  <p>
                    {
                      featuredEvent
                        .description
                    }
                  </p>
                )}

                <div className="featured-event-meta">
                  <span>
                    {formatDateOnly(
                      featuredEvent
                        .occurrenceDate,
                      "dddd, MMMM D, YYYY"
                    )}
                  </span>

                  {featuredEvent
                    .startTime && (
                    <span>
                      {formatTime(
                        featuredEvent
                          .startTime
                      )}

                      {featuredEvent
                        .endTime
                        ? ` – ${formatTime(
                            featuredEvent
                              .endTime
                          )}`
                        : ""}
                    </span>
                  )}
                </div>
              </div>

              <div className="featured-event-action">
                {renderPurchaseButton(
                  featuredEvent,
                  "customer-event-purchase-button--featured"
                )}
              </div>
            </section>
          )}

        <div className="customer-events-layout">
          <section className="customer-calendar-card">
            <div className="customer-calendar-toolbar">
              <div>
                <span>
                  Event calendar
                </span>

                <h2>
                  {currentMonth.format(
                    "MMMM YYYY"
                  )}
                </h2>
              </div>

              <div className="customer-calendar-controls">
                <button
                  type="button"
                  onClick={
                    goToCurrentMonth
                  }
                >
                  Today
                </button>

                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={
                    goToPreviousMonth
                  }
                >
                  ‹
                </button>

                <button
                  type="button"
                  aria-label="Next month"
                  onClick={
                    goToNextMonth
                  }
                >
                  ›
                </button>
              </div>
            </div>

            <div className="customer-calendar-grid">
              {[
                "Sun",
                "Mon",
                "Tue",
                "Wed",
                "Thu",
                "Fri",
                "Sat",
              ].map((day) => (
                <div
                  key={day}
                  className="customer-calendar-weekday"
                >
                  {day}
                </div>
              ))}

              {calendarDays.map(
                (date) => {
                  const dateString =
                    date.format(
                      "YYYY-MM-DD"
                    );

                  const dateEvents =
                    eventsByDate[
                      dateString
                    ] || [];

                  const isSelected =
                    dateString ===
                    selectedDate;

                  const isToday =
                    date.isSame(
                      moment(),
                      "day"
                    );

                  const isCurrentMonth =
                    date.isSame(
                      currentMonth,
                      "month"
                    );

                  const cellClassName =
                    [
                      "customer-calendar-day",

                      isSelected
                        ? "customer-calendar-day--selected"
                        : "",

                      isToday
                        ? "customer-calendar-day--today"
                        : "",

                      !isCurrentMonth
                        ? "customer-calendar-day--outside"
                        : "",

                      dateEvents.length >
                      0
                        ? "customer-calendar-day--has-event"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ");

                  return (
                    <button
                      type="button"
                      key={dateString}
                      className={
                        cellClassName
                      }
                      onClick={() =>
                        selectDay(date)
                      }
                      aria-pressed={
                        isSelected
                      }
                    >
                      <span className="customer-calendar-day-number">
                        {date.date()}
                      </span>

                      {dateEvents.length >
                        0 && (
                        <span className="customer-calendar-event-count">
                          {
                            dateEvents.length
                          }
                        </span>
                      )}

                      <span className="customer-calendar-event-dots">
                        {dateEvents
                          .slice(0, 3)
                          .map(
                            (
                              event,
                              index
                            ) => (
                              <span
                                key={`${event.id}-${event.occurrenceDate}-${index}`}
                              />
                            )
                          )}
                      </span>
                    </button>
                  );
                }
              )}
            </div>
          </section>

          <aside className="selected-events-panel">
            <div className="selected-events-header">
              <span>
                Selected date
              </span>

              <h2>
                {formatDateOnly(
                  selectedDate,
                  "MMMM D, YYYY"
                )}
              </h2>
            </div>

            {loading ? (
              <div className="customer-events-empty">
                Loading events...
              </div>
            ) : selectedEvents.length ===
              0 ? (
              <div className="customer-events-empty">
                <h3>
                  No events scheduled
                </h3>

                <p>
                  Choose another
                  highlighted date to
                  view upcoming events.
                </p>
              </div>
            ) : (
              <div className="selected-events-list">
                {selectedEvents.map(
                  (
                    event,
                    index
                  ) => (
                    <article
                      className="customer-event-card"
                      key={`${event.id}-${event.occurrenceDate}-${index}`}
                    >
                      <div className="customer-event-card-heading">
                        <div>
                          {event.startTime && (
                            <span>
                              {formatTime(
                                event.startTime
                              )}

                              {event.endTime
                                ? ` – ${formatTime(
                                    event.endTime
                                  )}`
                                : ""}
                            </span>
                          )}

                          <h3>
                            {event.name}
                          </h3>
                        </div>

                        {normalizeBoolean(
                          event.isPurchase
                        ) && (
                          <strong>
                            $
                            {formatPrice(
                              event.price
                            )}
                          </strong>
                        )}
                      </div>

                      {event.description && (
                        <p>
                          {
                            event.description
                          }
                        </p>
                      )}

                      <div className="customer-event-card-action">
                        {renderPurchaseButton(
                          event
                        )}
                      </div>
                    </article>
                  )
                )}
              </div>
            )}
          </aside>
        </div>

        {!loading &&
          upcomingEvents.length ===
            0 &&
          !fetchError && (
            <div className="customer-events-no-upcoming">
              <h2>
                No upcoming events
                yet
              </h2>

              <p>
                New events will appear
                here once they are
                scheduled.
              </p>
            </div>
          )}
      </div>

        <TicketQuantityModal
          isOpen={Boolean(
            checkoutModalEvent
          )}
          event={checkoutModalEvent}
          occurrences={occurrences}
          isSubmitting={
            checkoutModalEvent
              ? checkoutEventId ===
                checkoutModalEvent.id
              : false
          }
          error={checkoutError}
          onClose={() => {
            if (!checkoutEventId) {
              setCheckoutModalEvent(
                null
              );
              setCheckoutError("");
            }
          }}
          onConfirm={
            continueTicketCheckout
          }
        />
    </main>
  );
};

export default EventCalendar;