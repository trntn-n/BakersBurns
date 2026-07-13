
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import moment from 'moment';
import { adminApi } from '../config/axios';
import '../Pagecss/events.css';

const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const emptyEvent = {
  name: '',
  description: '',
  frequency: 'single',
  startDate: '',
  endDate: '',
  startTime: '',
  endTime: '',
  days: [],
  isPurchase: false,
  price: '',
};

const Events = () => {
  const [events, setEvents] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showAddEventForm, setShowAddEventForm] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [editEventId, setEditEventId] = useState(null);

  const [currentDate, setCurrentDate] = useState(moment());

  const [newEvent, setNewEvent] = useState({
    ...emptyEvent,
  });

  const normalizePurchaseValue = (value) => {
    if (value === true || value === 1 || value === '1') {
      return true;
    }

    if (typeof value === 'string') {
      return value.trim().toLowerCase() === 'true';
    }

    return false;
  };

  const getDayNameFromDate = (date) => {
    if (!date || !moment(date, 'YYYY-MM-DD', true).isValid()) {
      return '';
    }

    return moment(date).format('dddd');
  };

  const isSingleEvent = newEvent.frequency === 'single';

  const resetForm = () => {
    setNewEvent({
      ...emptyEvent,
    });

    setEditEventId(null);
    setValidationError('');
  };

  const closeEventForm = () => {
    setShowAddEventForm(false);
    resetForm();
  };

  const openBlankEventForm = () => {
    resetForm();
    setShowAddEventForm(true);
  };

  const openEventFormForDate = (selectedDate) => {
    const formattedDate = moment(selectedDate).format('YYYY-MM-DD');
    const selectedDay = getDayNameFromDate(formattedDate);

    setNewEvent({
      ...emptyEvent,
      frequency: 'single',
      startDate: formattedDate,
      endDate: formattedDate,
      days: selectedDay ? [selectedDay] : [],
    });

    setEditEventId(null);
    setValidationError('');
    setShowAddEventForm(true);
  };

  const handleEventChange = (event) => {
    const {
      name,
      value,
      type,
      checked,
    } = event.target;

    if (name === 'isPurchase') {
      setNewEvent((previousEvent) => ({
        ...previousEvent,
        isPurchase: checked,
        price: checked ? previousEvent.price : '',
      }));

      return;
    }

    if (name === 'frequency') {
      setNewEvent((previousEvent) => {
        if (value === 'single') {
          const selectedDate = previousEvent.startDate;
          const selectedDay = getDayNameFromDate(selectedDate);

          return {
            ...previousEvent,
            frequency: value,
            endDate: selectedDate,
            days: selectedDay ? [selectedDay] : [],
          };
        }

        return {
          ...previousEvent,
          frequency: value,
          endDate:
            previousEvent.endDate || previousEvent.startDate,
          days:
            previousEvent.days.length > 0
              ? previousEvent.days
              : previousEvent.startDate
                ? [getDayNameFromDate(previousEvent.startDate)]
                : [],
        };
      });

      return;
    }

    if (name === 'startDate') {
      setNewEvent((previousEvent) => {
        if (previousEvent.frequency === 'single') {
          const selectedDay = getDayNameFromDate(value);

          return {
            ...previousEvent,
            startDate: value,
            endDate: value,
            days: selectedDay ? [selectedDay] : [],
          };
        }

        return {
          ...previousEvent,
          startDate: value,
        };
      });

      return;
    }

    if (type === 'checkbox' && name === 'days') {
      setNewEvent((previousEvent) => ({
        ...previousEvent,
        days: checked
          ? [...previousEvent.days, value]
          : previousEvent.days.filter(
              (selectedDay) => selectedDay !== value
            ),
      }));

      return;
    }

    setNewEvent((previousEvent) => ({
      ...previousEvent,
      [name]: value,
    }));
  };

  const handleDayChange = (day) => {
    if (isSingleEvent) {
      return;
    }

    setNewEvent((previousEvent) => ({
      ...previousEvent,
      days: previousEvent.days.includes(day)
        ? previousEvent.days.filter(
            (selectedDay) => selectedDay !== day
          )
        : [...previousEvent.days, day],
    }));
  };

  const handleEditEvent = (event) => {
    const parsedDays = Array.isArray(event.days)
      ? event.days
      : typeof event.days === 'string'
        ? event.days
            .split(',')
            .map((day) => day.trim())
            .filter(Boolean)
        : [];

    const startDate = event.startDate
      ? moment(event.startDate).format('YYYY-MM-DD')
      : '';

    const endDate = event.endDate
      ? moment(event.endDate).format('YYYY-MM-DD')
      : startDate;

    const inferredSingleEvent =
      event.frequency === 'single' ||
      (
        startDate &&
        endDate &&
        moment(startDate).isSame(endDate, 'day') &&
        parsedDays.length <= 1
      );

    const frequency = inferredSingleEvent
      ? 'single'
      : event.frequency || 'weekly';

    const isPurchase = normalizePurchaseValue(
      event.isPurchase
    );

    const normalizedDays = inferredSingleEvent
      ? [getDayNameFromDate(startDate)].filter(Boolean)
      : parsedDays;

    setNewEvent({
      name: event.name || '',
      description: event.description || '',
      frequency,
      startDate,
      endDate: inferredSingleEvent ? startDate : endDate,
      startTime: event.startTime || '',
      endTime: event.endTime || '',
      days: normalizedDays,
      isPurchase,
      price:
        isPurchase && Number(event.price) > 0
          ? String(event.price)
          : '',
    });

    setEditEventId(event.id);
    setValidationError('');
    setShowAddEventForm(true);
  };

  const validateForm = () => {
    const {
      name,
      description,
      frequency,
      startDate,
      endDate,
      startTime,
      endTime,
      days,
      isPurchase,
      price,
    } = newEvent;

    if (!String(name).trim()) {
      setValidationError('Enter an event name.');
      return false;
    }

    if (!String(description).trim()) {
      setValidationError('Enter an event description.');
      return false;
    }

    if (!frequency) {
      setValidationError('Select an event frequency.');
      return false;
    }

    if (!startDate) {
      setValidationError(
        isSingleEvent
          ? 'Select an event date.'
          : 'Select a start date.'
      );

      return false;
    }

    if (!isSingleEvent && !endDate) {
      setValidationError('Select an end date.');
      return false;
    }

    if (!startTime || !endTime) {
      setValidationError(
        'Select both a start time and an end time.'
      );

      return false;
    }

    if (
      !isSingleEvent &&
      (
        !Array.isArray(days) ||
        days.length === 0
      )
    ) {
      setValidationError(
        'Select at least one day of the week.'
      );

      return false;
    }

    if (
      !isSingleEvent &&
      moment(endDate).isBefore(moment(startDate), 'day')
    ) {
      setValidationError(
        'The end date cannot be before the start date.'
      );

      return false;
    }

    const startsAt = moment(
      `${startDate} ${startTime}`,
      'YYYY-MM-DD HH:mm'
    );

    const endsAt = moment(
      `${isSingleEvent ? startDate : endDate} ${endTime}`,
      'YYYY-MM-DD HH:mm'
    );

    if (
      isSingleEvent &&
      endsAt.isSameOrBefore(startsAt)
    ) {
      setValidationError(
        'The end time must be after the start time.'
      );

      return false;
    }

    if (isPurchase) {
      const parsedPrice = Number(price);

      if (
        !Number.isFinite(parsedPrice) ||
        parsedPrice <= 0
      ) {
        setValidationError(
          'Enter a valid price greater than $0.'
        );

        return false;
      }
    }

    setValidationError('');
    return true;
  };

  const buildEventPayload = () => {
    const singleEvent =
      newEvent.frequency === 'single';

    const payloadStartDate = moment(
      newEvent.startDate
    ).format('YYYY-MM-DD');

    const payloadEndDate = singleEvent
      ? payloadStartDate
      : moment(newEvent.endDate).format('YYYY-MM-DD');

    const payloadDays = singleEvent
      ? [getDayNameFromDate(payloadStartDate)]
      : newEvent.days;

    const isPurchase =
      newEvent.isPurchase === true;

    const parsedPrice = Number(newEvent.price);

    return {
      name: newEvent.name.trim(),
      description: newEvent.description.trim(),
      frequency: newEvent.frequency,
      startDate: payloadStartDate,
      endDate: payloadEndDate,
      startTime: newEvent.startTime,
      endTime: newEvent.endTime,
      days: payloadDays.filter(Boolean).join(','),
      isPurchase,
      price:
        isPurchase &&
        Number.isFinite(parsedPrice) &&
        parsedPrice > 0
          ? parsedPrice
          : 0,
    };
  };

  const generateEventOccurrences = (event) => {
    const normalizedDays = Array.isArray(event.days)
      ? event.days
      : typeof event.days === 'string'
        ? event.days
            .split(',')
            .map((day) => day.trim())
            .filter(Boolean)
        : [];

    const eventStartDate = moment(event.startDate);
    const eventEndDate = moment(
      event.endDate || event.startDate
    );

    if (
      event.frequency === 'single' ||
      eventStartDate.isSame(eventEndDate, 'day')
    ) {
      return [
        {
          id: event.id,
          title: event.name,
          description: event.description,
          startTime: event.startTime,
          endTime: event.endTime,
          isPurchase: event.isPurchase,
          price: event.price,
          date: eventStartDate.format('YYYY-MM-DD'),
        },
      ];
    }

    const occurrences = [];
    const cursor = eventStartDate.clone();

    while (cursor.isSameOrBefore(eventEndDate, 'day')) {
      const dayName = cursor.format('dddd');

      if (normalizedDays.includes(dayName)) {
        occurrences.push({
          id: event.id,
          title: event.name,
          description: event.description,
          startTime: event.startTime,
          endTime: event.endTime,
          isPurchase: event.isPurchase,
          price: event.price,
          date: cursor.format('YYYY-MM-DD'),
        });
      }

      cursor.add(1, 'day');
    }

    return occurrences;
  };

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await adminApi.get(
        '/admin-event/events'
      );

      const rawEvents = Array.isArray(response.data)
        ? response.data
        : [];

      setEvents(rawEvents);

      const occurrences = rawEvents.flatMap(
        generateEventOccurrences
      );

      setCalendarEvents(occurrences);
    } catch (fetchError) {
      console.error('Fetch error:', fetchError);
      setError('Unable to load events.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const saveEvent = async () => {
    if (!validateForm()) {
      return;
    }

    const formattedEvent = buildEventPayload();

    try {
      if (editEventId) {
        await adminApi.put(
          `/admin-event/events/${editEventId}`,
          formattedEvent
        );
      } else {
        await adminApi.post(
          '/admin-event/events',
          formattedEvent
        );
      }

      closeEventForm();
      await fetchEvents();
    } catch (saveError) {
      console.error('Error saving event:', saveError);

      setValidationError(
        saveError.response?.data?.message ||
        'Unable to save the event.'
      );
    }
  };

  const handleDeleteEvent = async (eventId) => {
    try {
      await adminApi.delete(
        `/admin-event/events/${eventId}`
      );

      if (editEventId === eventId) {
        closeEventForm();
      }

      await fetchEvents();
    } catch (deleteError) {
      console.error(
        'Error deleting event:',
        deleteError
      );

      setValidationError(
        deleteError.response?.data?.message ||
        'Unable to delete the event.'
      );
    }
  };

  const handlePrevMonth = () => {
    setCurrentDate((previousDate) =>
      previousDate.clone().subtract(1, 'month')
    );
  };

  const handleNextMonth = () => {
    setCurrentDate((previousDate) =>
      previousDate.clone().add(1, 'month')
    );
  };

  const handleCurrentMonth = () => {
    setCurrentDate(moment());
  };

  const renderCalendarDays = () => {
    const startOfCalendar = currentDate
      .clone()
      .startOf('month')
      .startOf('week');

    const endOfCalendar = currentDate
      .clone()
      .endOf('month')
      .endOf('week');

    const days = [];
    const cursor = startOfCalendar.clone();

    while (cursor.isSameOrBefore(endOfCalendar, 'day')) {
      const currentDay = cursor.clone();
      const dateKey = currentDay.format('YYYY-MM-DD');

      const isToday = currentDay.isSame(moment(), 'day');
      const isCurrentMonth = currentDay.isSame(
        currentDate,
        'month'
      );

      const eventsForDay = calendarEvents.filter(
        (event) => event.date === dateKey
      );

      days.push(
        <button
          type="button"
          key={dateKey}
          className={[
            'calendar-day',
            isCurrentMonth
              ? 'calendar-day--current'
              : 'calendar-day--outside',
            isToday ? 'calendar-day--today' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() =>
            openEventFormForDate(currentDay)
          }
          aria-label={`Add event on ${currentDay.format(
            'MMMM D, YYYY'
          )}`}
        >
          <span className="calendar-day__number">
            {currentDay.date()}
          </span>

          <div className="calendar-day__events">
            {eventsForDay.slice(0, 3).map(
              (event, index) => (
                <div
                  key={`${event.id}-${event.date}-${index}`}
                  className="calendar-event"
                >
                  <span className="calendar-event__title">
                    {event.title}
                  </span>

                  <span className="calendar-event__time">
                    {event.startTime}
                  </span>
                </div>
              )
            )}

            {eventsForDay.length > 3 && (
              <span className="calendar-event__more">
                +{eventsForDay.length - 3} more
              </span>
            )}
          </div>
        </button>
      );

      cursor.add(1, 'day');
    }

    return days;
  };

  const renderPurchaseFields = () => (
    <section className="event-form__panel">
      <label
        className="toggle-field"
        htmlFor="isPurchase"
      >
        <span className="toggle-field__text">
          <span className="toggle-field__title">
            Require payment
          </span>

          <span className="toggle-field__description">
            Enable this when attendees must purchase
            access.
          </span>
        </span>

        <span className="toggle">
          <input
            id="isPurchase"
            name="isPurchase"
            type="checkbox"
            checked={newEvent.isPurchase}
            onChange={handleEventChange}
          />

          <span className="toggle__track">
            <span className="toggle__thumb" />
          </span>
        </span>
      </label>

      {newEvent.isPurchase && (
        <div className="form-field form-field--price">
          <label htmlFor="eventPrice">
            Event price
          </label>

          <div className="price-input">
            <span className="price-input__symbol">
              $
            </span>

            <input
              id="eventPrice"
              name="price"
              type="number"
              min="0.01"
              step="0.01"
              value={newEvent.price}
              onChange={handleEventChange}
              placeholder="0.00"
            />
          </div>
        </div>
      )}
    </section>
  );

  const renderDaySelection = () => {
    if (isSingleEvent) {
      return null;
    }

    return (
      <section className="event-form__panel">
        <div className="event-form__panel-heading">
          <h3>Days of the week</h3>
          <p>
            Choose the days on which this event occurs.
          </p>
        </div>

        <div className="day-selector">
          {DAYS_OF_WEEK.map((day) => {
            const selected =
              newEvent.days.includes(day);

            return (
              <label
                key={day}
                className={`day-selector__item ${
                  selected
                    ? 'day-selector__item--selected'
                    : ''
                }`}
              >
                <input
                  type="checkbox"
                  name="days"
                  value={day}
                  checked={selected}
                  onChange={() =>
                    handleDayChange(day)
                  }
                />

                <span>{day.slice(0, 3)}</span>
              </label>
            );
          })}
        </div>
      </section>
    );
  };

  const renderEventForm = () => (
    <AnimatePresence>
      {showAddEventForm && (
        <motion.div
          className="event-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={closeEventForm}
        >
          <motion.div
            className="event-modal__dialog"
            initial={{
              opacity: 0,
              y: 24,
              scale: 0.98,
            }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
            }}
            exit={{
              opacity: 0,
              y: 16,
              scale: 0.98,
            }}
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <div className="event-modal__header">
              <div>
                <span className="event-modal__eyebrow">
                  Event management
                </span>

                <h2>
                  {editEventId
                    ? 'Edit event'
                    : 'Create event'}
                </h2>
              </div>

              <button
                type="button"
                className="event-modal__close"
                onClick={closeEventForm}
                aria-label="Close event form"
              >
                ×
              </button>
            </div>

            <div className="event-modal__content">
              {validationError && (
                <div className="event-alert event-alert--error">
                  {validationError}
                </div>
              )}

              <div className="event-form__grid">
                <div className="form-field">
                  <label htmlFor="eventName">
                    Event name
                  </label>

                  <input
                    id="eventName"
                    type="text"
                    name="name"
                    value={newEvent.name}
                    onChange={handleEventChange}
                    placeholder="Enter the event name"
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="eventFrequency">
                    Event type
                  </label>

                  <select
                    id="eventFrequency"
                    name="frequency"
                    value={newEvent.frequency}
                    onChange={handleEventChange}
                  >
                    <option value="single">
                      Single event
                    </option>

                    <option value="weekly">
                      Weekly
                    </option>

                    <option value="bi-weekly">
                      Bi-weekly
                    </option>

                    <option value="monthly">
                      Monthly
                    </option>

                    <option value="yearly">
                      Yearly
                    </option>
                  </select>
                </div>

                <div className="form-field form-field--full">
                  <label htmlFor="eventDescription">
                    Description
                  </label>

                  <textarea
                    id="eventDescription"
                    name="description"
                    value={newEvent.description}
                    onChange={handleEventChange}
                    placeholder="Describe the event"
                    rows="4"
                  />
                </div>

                {isSingleEvent ? (
                  <div className="form-field form-field--full">
                    <label htmlFor="eventDate">
                      Event date
                    </label>

                    <input
                      id="eventDate"
                      type="date"
                      name="startDate"
                      value={newEvent.startDate}
                      onChange={handleEventChange}
                    />

                    {newEvent.startDate && (
                      <span className="form-field__hint">
                        {moment(
                          newEvent.startDate
                        ).format('dddd, MMMM D, YYYY')}
                      </span>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="form-field">
                      <label htmlFor="startDate">
                        Start date
                      </label>

                      <input
                        id="startDate"
                        type="date"
                        name="startDate"
                        value={newEvent.startDate}
                        onChange={handleEventChange}
                      />
                    </div>

                    <div className="form-field">
                      <label htmlFor="endDate">
                        End date
                      </label>

                      <input
                        id="endDate"
                        type="date"
                        name="endDate"
                        min={newEvent.startDate}
                        value={newEvent.endDate}
                        onChange={handleEventChange}
                      />
                    </div>
                  </>
                )}

                <div className="form-field">
                  <label htmlFor="startTime">
                    Start time
                  </label>

                  <input
                    id="startTime"
                    type="time"
                    name="startTime"
                    value={newEvent.startTime}
                    onChange={handleEventChange}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="endTime">
                    End time
                  </label>

                  <input
                    id="endTime"
                    type="time"
                    name="endTime"
                    value={newEvent.endTime}
                    onChange={handleEventChange}
                  />
                </div>
              </div>

              {renderDaySelection()}
              {renderPurchaseFields()}
            </div>

            <div className="event-modal__footer">
              <button
                type="button"
                className="button button--secondary"
                onClick={closeEventForm}
              >
                Cancel
              </button>

              <button
                type="button"
                className="button button--primary"
                onClick={saveEvent}
              >
                {editEventId
                  ? 'Save changes'
                  : 'Create event'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const renderEventPreview = (event) => {
    const eventIsPurchase =
      normalizePurchaseValue(event.isPurchase);

    const startDate = moment(event.startDate);
    const endDate = moment(
      event.endDate || event.startDate
    );

    const singleEvent =
      event.frequency === 'single' ||
      startDate.isSame(endDate, 'day');

    return (
      <article className="event-card">
        <div className="event-card__content">
          <div className="event-card__heading">
            <div>
              <span className="event-card__type">
                {singleEvent
                  ? 'Single event'
                  : event.frequency || 'Recurring'}
              </span>

              <h3>{event.name}</h3>
            </div>

            <span
              className={`event-card__payment ${
                eventIsPurchase
                  ? 'event-card__payment--paid'
                  : 'event-card__payment--free'
              }`}
            >
              {eventIsPurchase
                ? `$${Number(
                    event.price || 0
                  ).toFixed(2)}`
                : 'Free'}
            </span>
          </div>

          <p className="event-card__description">
            {event.description}
          </p>

          <div className="event-card__details">
            <div className="event-card__detail">
              <span>Date</span>

              <strong>
                {singleEvent
                  ? startDate.format('MMMM D, YYYY')
                  : `${startDate.format(
                      'MMM D, YYYY'
                    )} – ${endDate.format(
                      'MMM D, YYYY'
                    )}`}
              </strong>
            </div>

            <div className="event-card__detail">
              <span>Time</span>

              <strong>
                {event.startTime} – {event.endTime}
              </strong>
            </div>
          </div>
        </div>

        <div className="event-card__actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={() => handleEditEvent(event)}
          >
            Edit
          </button>

          <button
            type="button"
            className="button button--danger"
            onClick={() =>
              handleDeleteEvent(event.id)
            }
          >
            Delete
          </button>
        </div>
      </article>
    );
  };

  return (
    <main className="events-page">
      <section className="events-page__shell">
        <header className="events-page__header">
          <div>
            <span className="events-page__eyebrow">
              Administration
            </span>

            <h1>Events</h1>

            <p>
              Create, schedule, and manage upcoming
              events.
            </p>
          </div>

          <motion.button
            type="button"
            className="button button--primary button--large"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={openBlankEventForm}
          >
            Add event
          </motion.button>
        </header>

        {validationError && !showAddEventForm && (
          <div className="event-alert event-alert--error">
            {validationError}
          </div>
        )}

        {error && (
          <div className="event-alert event-alert--error">
            {error}
          </div>
        )}

        <section className="calendar-card">
          <div className="calendar-toolbar">
            <div>
              <span className="calendar-toolbar__label">
                Calendar
              </span>

              <h2>
                {currentDate.format('MMMM YYYY')}
              </h2>
            </div>

            <div className="calendar-toolbar__actions">
              <button
                type="button"
                className="calendar-toolbar__today"
                onClick={handleCurrentMonth}
              >
                Today
              </button>

              <button
                type="button"
                className="calendar-toolbar__arrow"
                onClick={handlePrevMonth}
                aria-label="Previous month"
              >
                ‹
              </button>

              <button
                type="button"
                className="calendar-toolbar__arrow"
                onClick={handleNextMonth}
                aria-label="Next month"
              >
                ›
              </button>
            </div>
          </div>

          <div className="calendar-grid">
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
                className="calendar-day-header"
              >
                {day}
              </div>
            ))}

            {renderCalendarDays()}
          </div>
        </section>

        <section className="event-list-section">
          <div className="event-list-section__header">
            <div>
              <span className="events-page__eyebrow">
                Event directory
              </span>

              <h2>Scheduled events</h2>
            </div>

            <span className="event-list-section__count">
              {events.length}{' '}
              {events.length === 1 ? 'event' : 'events'}
            </span>
          </div>

          {loading ? (
            <div className="event-empty-state">
              Loading events...
            </div>
          ) : events.length === 0 ? (
            <div className="event-empty-state">
              <h3>No events scheduled</h3>

              <p>
                Click a calendar date or use the Add
                event button to create one.
              </p>
            </div>
          ) : (
            <div className="event-list">
              {events.map((event) => (
                <React.Fragment key={event.id}>
                  {renderEventPreview(event)}
                </React.Fragment>
              ))}
            </div>
          )}
        </section>
      </section>

      {renderEventForm()}
    </main>
  );
};

export default Events;

