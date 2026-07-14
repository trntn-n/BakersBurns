import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';
import moment from 'moment';

import { registerApi } from '../../config/axios';
import './Event.css';

const CHECKOUT_ENDPOINT =
  '/register-events/checkout';

const normalizeBoolean = (value) => {
  if (
    value === true ||
    value === 1 ||
    value === '1'
  ) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }

  return false;
};

const normalizeDays = (days) => {
  if (Array.isArray(days)) {
    return days
      .map((day) => String(day).trim())
      .filter(Boolean);
  }

  if (typeof days === 'string') {
    return days
      .split(',')
      .map((day) => day.trim())
      .filter(Boolean);
  }

  return [];
};

const formatTime = (time) => {
  if (!time) {
    return '';
  }

  const parsed = moment(
    time,
    [
      'HH:mm:ss',
      'HH:mm',
      'h:mm A',
    ],
    true
  );

  return parsed.isValid()
    ? parsed.format('h:mm A')
    : time;
};

const formatPrice = (price) => {
  const parsedPrice = Number(price);

  return Number.isFinite(parsedPrice)
    ? parsedPrice.toFixed(2)
    : '0.00';
};

const buildOccurrences = (event) => {
  if (!event?.startDate) {
    return [];
  }

  const start = moment(
    event.startDate,
    'YYYY-MM-DD',
    true
  );

  const end = moment(
    event.endDate || event.startDate,
    'YYYY-MM-DD',
    true
  );

  if (!start.isValid()) {
    return [];
  }

  const safeEnd = end.isValid()
    ? end
    : start.clone();

  const isSingleEvent =
    event.frequency === 'single' ||
    start.isSame(safeEnd, 'day');

  if (isSingleEvent) {
    return [
      {
        ...event,
        occurrenceDate:
          start.format('YYYY-MM-DD'),
      },
    ];
  }

  const selectedDays = normalizeDays(event.days);

  if (selectedDays.length === 0) {
    return [
      {
        ...event,
        occurrenceDate:
          start.format('YYYY-MM-DD'),
      },
    ];
  }

  const occurrences = [];
  const cursor = start.clone();

  while (cursor.isSameOrBefore(safeEnd, 'day')) {
    const dayName = cursor.format('dddd');

    if (selectedDays.includes(dayName)) {
      occurrences.push({
        ...event,
        occurrenceDate:
          cursor.format('YYYY-MM-DD'),
      });
    }

    cursor.add(1, 'day');
  }

  return occurrences;
};

const EventCalendar = () => {
  const [events, setEvents] = useState([]);
  const [currentMonth, setCurrentMonth] =
    useState(moment().startOf('month'));

  const [selectedDate, setSelectedDate] =
    useState(moment().format('YYYY-MM-DD'));

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] =
    useState('');

  const [checkoutEventId, setCheckoutEventId] =
    useState(null);

  const [checkoutError, setCheckoutError] =
    useState('');

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true);
        setFetchError('');

        const response = await registerApi.get(
          '/register-events/all'
        );

        const receivedEvents = Array.isArray(
          response.data
        )
          ? response.data
          : [];

        setEvents(receivedEvents);
      } catch (error) {
        console.error(
          'Failed to fetch events:',
          error
        );

        setFetchError(
          error.response?.data?.message ||
          'We could not load the event calendar.'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);

  const occurrences = useMemo(() => {
    return events
      .flatMap(buildOccurrences)
      .sort((first, second) => {
        const firstDate = moment(
          `${first.occurrenceDate} ${
            first.startTime || '00:00'
          }`
        );

        const secondDate = moment(
          `${second.occurrenceDate} ${
            second.startTime || '00:00'
          }`
        );

        return firstDate.valueOf() -
          secondDate.valueOf();
      });
  }, [events]);

  const eventsByDate = useMemo(() => {
    return occurrences.reduce(
      (calendar, event) => {
        const date = event.occurrenceDate;

        if (!calendar[date]) {
          calendar[date] = [];
        }

        calendar[date].push(event);

        return calendar;
      },
      {}
    );
  }, [occurrences]);

  const upcomingEvents = useMemo(() => {
    const today = moment().startOf('day');

    return occurrences.filter((event) => {
      return moment(
        event.occurrenceDate,
        'YYYY-MM-DD'
      ).isSameOrAfter(today, 'day');
    });
  }, [occurrences]);

  const featuredEvent =
    upcomingEvents.length > 0
      ? upcomingEvents[0]
      : null;

  const selectedEvents =
    eventsByDate[selectedDate] || [];

  const calendarDays = useMemo(() => {
    const start = currentMonth
      .clone()
      .startOf('month')
      .startOf('week');

    const end = currentMonth
      .clone()
      .endOf('month')
      .endOf('week');

    const days = [];
    const cursor = start.clone();

    while (cursor.isSameOrBefore(end, 'day')) {
      days.push(cursor.clone());
      cursor.add(1, 'day');
    }

    return days;
  }, [currentMonth]);

  const selectDay = (date) => {
    const formattedDate =
      date.format('YYYY-MM-DD');

    setSelectedDate(formattedDate);
    setCheckoutError('');
  };

  const goToPreviousMonth = () => {
    setCurrentMonth((previousMonth) =>
      previousMonth
        .clone()
        .subtract(1, 'month')
    );
  };

  const goToNextMonth = () => {
    setCurrentMonth((previousMonth) =>
      previousMonth
        .clone()
        .add(1, 'month')
    );
  };

  const goToCurrentMonth = () => {
    const today = moment();

    setCurrentMonth(today.clone().startOf('month'));
    setSelectedDate(today.format('YYYY-MM-DD'));
  };

  const beginCheckout = async (event) => {
    if (!event?.id) {
      setCheckoutError(
        'This event cannot currently be purchased.'
      );

      return;
    }

    try {
      setCheckoutError('');
      setCheckoutEventId(event.id);

      const response = await registerApi.post(
        CHECKOUT_ENDPOINT,
        {
          eventId: event.id,
          occurrenceDate:
            event.occurrenceDate ||
            event.startDate,
        }
      );

      const checkoutUrl =
        response.data?.url ||
        response.data?.checkoutUrl;

      if (!checkoutUrl) {
        throw new Error(
          'Checkout URL was not returned.'
        );
      }

      window.location.assign(checkoutUrl);
    } catch (error) {
      console.error(
        'Event checkout failed:',
        error
      );

      setCheckoutError(
        error.response?.data?.message ||
        'Ticket checkout could not be started.'
      );
    } finally {
      setCheckoutEventId(null);
    }
  };

  const renderPurchaseButton = (
    event,
    className = ''
  ) => {
    const isPurchase = normalizeBoolean(
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
        className={`customer-event-purchase-button ${className}`}
        disabled={checkoutEventId === event.id}
        onClick={() => beginCheckout(event)}
      >
        {checkoutEventId === event.id
          ? 'Opening checkout...'
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

            <h1>Upcoming Events</h1>

            <p>
              Explore upcoming events, select a date,
              and purchase tickets securely online.
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

        {featuredEvent && (
          <section className="featured-event">
            <div className="featured-event-date">
              <span className="featured-event-month">
                {moment(
                  featuredEvent.occurrenceDate
                ).format('MMM')}
              </span>

              <strong>
                {moment(
                  featuredEvent.occurrenceDate
                ).format('D')}
              </strong>

              <span>
                {moment(
                  featuredEvent.occurrenceDate
                ).format('YYYY')}
              </span>
            </div>

            <div className="featured-event-content">
              <span className="featured-event-label">
                Next event
              </span>

              <h2>{featuredEvent.name}</h2>

              <p>
                {featuredEvent.description}
              </p>

              <div className="featured-event-meta">
                <span>
                  {moment(
                    featuredEvent.occurrenceDate
                  ).format(
                    'dddd, MMMM D, YYYY'
                  )}
                </span>

                {featuredEvent.startTime && (
                  <span>
                    {formatTime(
                      featuredEvent.startTime
                    )}

                    {featuredEvent.endTime
                      ? ` – ${formatTime(
                          featuredEvent.endTime
                        )}`
                      : ''}
                  </span>
                )}
              </div>
            </div>

            <div className="featured-event-action">
              {renderPurchaseButton(
                featuredEvent,
                'customer-event-purchase-button--featured'
              )}
            </div>
          </section>
        )}

        <div className="customer-events-layout">
          <section className="customer-calendar-card">
            <div className="customer-calendar-toolbar">
              <div>
                <span>Event calendar</span>

                <h2>
                  {currentMonth.format(
                    'MMMM YYYY'
                  )}
                </h2>
              </div>

              <div className="customer-calendar-controls">
                <button
                  type="button"
                  onClick={goToCurrentMonth}
                >
                  Today
                </button>

                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={goToPreviousMonth}
                >
                  ‹
                </button>

                <button
                  type="button"
                  aria-label="Next month"
                  onClick={goToNextMonth}
                >
                  ›
                </button>
              </div>
            </div>

            <div className="customer-calendar-grid">
              {[
                'Sun',
                'Mon',
                'Tue',
                'Wed',
                'Thu',
                'Fri',
                'Sat',
              ].map((day) => (
                <div
                  key={day}
                  className="customer-calendar-weekday"
                >
                  {day}
                </div>
              ))}

              {calendarDays.map((date) => {
                const dateString =
                  date.format('YYYY-MM-DD');

                const dateEvents =
                  eventsByDate[dateString] || [];

                const isSelected =
                  dateString === selectedDate;

                const isToday = date.isSame(
                  moment(),
                  'day'
                );

                const isCurrentMonth =
                  date.isSame(
                    currentMonth,
                    'month'
                  );

                const cellClassName = [
                  'customer-calendar-day',
                  isSelected
                    ? 'customer-calendar-day--selected'
                    : '',
                  isToday
                    ? 'customer-calendar-day--today'
                    : '',
                  !isCurrentMonth
                    ? 'customer-calendar-day--outside'
                    : '',
                  dateEvents.length > 0
                    ? 'customer-calendar-day--has-event'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <button
                    type="button"
                    key={dateString}
                    className={cellClassName}
                    onClick={() =>
                      selectDay(date)
                    }
                    aria-pressed={isSelected}
                  >
                    <span className="customer-calendar-day-number">
                      {date.date()}
                    </span>

                    {dateEvents.length > 0 && (
                      <span className="customer-calendar-event-count">
                        {dateEvents.length}
                      </span>
                    )}

                    <span className="customer-calendar-event-dots">
                      {dateEvents
                        .slice(0, 3)
                        .map((event, index) => (
                          <span
                            key={`${event.id}-${index}`}
                          />
                        ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="selected-events-panel">
            <div className="selected-events-header">
              <span>Selected date</span>

              <h2>
                {moment(selectedDate).format(
                  'MMMM D, YYYY'
                )}
              </h2>
            </div>

            {loading ? (
              <div className="customer-events-empty">
                Loading events...
              </div>
            ) : selectedEvents.length === 0 ? (
              <div className="customer-events-empty">
                <h3>No events scheduled</h3>

                <p>
                  Choose another highlighted date to
                  view upcoming events.
                </p>
              </div>
            ) : (
              <div className="selected-events-list">
                {selectedEvents.map(
                  (event, index) => (
                    <article
                      className="customer-event-card"
                      key={`${event.id}-${event.occurrenceDate}-${index}`}
                    >
                      <div className="customer-event-card-heading">
                        <div>
                          <span>
                            {formatTime(
                              event.startTime
                            )}

                            {event.endTime
                              ? ` – ${formatTime(
                                  event.endTime
                                )}`
                              : ''}
                          </span>

                          <h3>{event.name}</h3>
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

                      <p>
                        {event.description}
                      </p>

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
          upcomingEvents.length === 0 &&
          !fetchError && (
            <div className="customer-events-no-upcoming">
              <h2>No upcoming events yet</h2>

              <p>
                New events will appear here once they
                are scheduled.
              </p>
            </div>
          )}
      </div>
    </main>
  );
};

export default EventCalendar;