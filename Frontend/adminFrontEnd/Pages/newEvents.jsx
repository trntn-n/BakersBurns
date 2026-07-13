import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import moment from 'moment';
import { adminApi } from '../config/axios';
import '../Pagecss/events.css';

const emptyEvent = {
  name: '',
  description: '',
  frequency: 'weekly',
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
  const [isMobileView, setIsMobileView] = useState(
    window.innerWidth <= 768
  );

  const [newEvent, setNewEvent] = useState({
    ...emptyEvent,
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const normalizePurchaseValue = (value) => {
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

  const resetForm = () => {
    setNewEvent({
      ...emptyEvent,
    });

    setEditEventId(null);
    setValidationError('');
  };

  const closeAddEventForm = () => {
    setShowAddEventForm(false);
    resetForm();
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
        price: checked
          ? previousEvent.price
          : '',
      }));

      return;
    }

    if (
      type === 'checkbox' &&
      name === 'days'
    ) {
      setNewEvent((previousEvent) => ({
        ...previousEvent,
        days: checked
          ? [...previousEvent.days, value]
          : previousEvent.days.filter(
              (day) => day !== value
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

    const isPurchase = normalizePurchaseValue(
      event.isPurchase
    );

    setNewEvent({
      name: event.name || '',
      description: event.description || '',
      frequency: event.frequency || 'weekly',
      startDate: event.startDate
        ? moment(event.startDate).format('YYYY-MM-DD')
        : '',
      endDate: event.endDate
        ? moment(event.endDate).format('YYYY-MM-DD')
        : '',
      startTime: event.startTime || '',
      endTime: event.endTime || '',
      days: parsedDays,
      isPurchase,
      price:
        isPurchase && Number(event.price) > 0
          ? String(event.price)
          : '',
    });

    setEditEventId(event.id);
    setValidationError('');
  };

  const cancelEditEvent = () => {
    resetForm();
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

    if (
      !String(name).trim() ||
      !String(description).trim() ||
      !frequency ||
      !startDate ||
      !endDate ||
      !startTime ||
      !endTime ||
      !Array.isArray(days) ||
      days.length === 0
    ) {
      setValidationError(
        'All event fields must be completed and at least one day must be selected.'
      );

      return false;
    }

    if (
      moment(endDate).isBefore(
        moment(startDate),
        'day'
      )
    ) {
      setValidationError(
        'The end date cannot be before the start date.'
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
          'Enter a valid price greater than $0 for a purchasable event.'
        );

        return false;
      }
    }

    setValidationError('');
    return true;
  };

  const buildEventPayload = () => {
    const isPurchase = newEvent.isPurchase === true;
    const parsedPrice = Number(newEvent.price);

    return {
      name: newEvent.name,
      description: newEvent.description,
      frequency: newEvent.frequency,
      startDate: moment(
        newEvent.startDate
      ).format('YYYY-MM-DD'),
      endDate: moment(
        newEvent.endDate
      ).format('YYYY-MM-DD'),
      startTime: newEvent.startTime,
      endTime: newEvent.endTime,
      days: Array.isArray(newEvent.days)
        ? newEvent.days.join(',')
        : newEvent.days,
      isPurchase,
      price:
        isPurchase &&
        Number.isFinite(parsedPrice) &&
        parsedPrice > 0
          ? parsedPrice
          : 0,
    };
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

      const allOccurrences = rawEvents.flatMap(
        (event) =>
          generateRecurringEvents(
            event.days,
            event.startDate,
            event.endDate,
            {
              id: event.id,
              name: event.name,
              description: event.description,
              startTime: event.startTime,
              endTime: event.endTime,
              isPurchase: event.isPurchase,
              price: event.price,
            }
          )
      );

      setCalendarEvents(allOccurrences);
    } catch (fetchError) {
      console.error('Fetch error:', fetchError);
      setError('Error fetching events');
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

      setShowAddEventForm(false);
      resetForm();
      await fetchEvents();
    } catch (saveError) {
      console.error('Error saving event:', saveError);

      const backendMessage =
        saveError.response?.data?.message;

      setValidationError(
        backendMessage || 'Error saving event'
      );
    }
  };

  const handleAddEvent = async () => {
    await saveEvent();
  };

  const handleSaveEvent = async () => {
    await saveEvent();
  };

  const handleDeleteEvent = async (eventId) => {
    try {
      await adminApi.delete(
        `/admin-event/events/${eventId}`
      );

      if (editEventId === eventId) {
        resetForm();
      }

      await fetchEvents();
    } catch (deleteError) {
      console.error(
        'Error deleting event:',
        deleteError
      );

      const backendMessage =
        deleteError.response?.data?.message;

      setValidationError(
        backendMessage || 'Error deleting event'
      );
    }
  };

  const generateRecurringEvents = (
    daysOfWeek,
    startDate,
    endDate,
    eventData
  ) => {
    const start = moment(startDate);
    const end = moment(endDate);
    const eventDays = [];

    const normalizedDays = Array.isArray(daysOfWeek)
      ? daysOfWeek
      : typeof daysOfWeek === 'string'
        ? daysOfWeek
            .split(',')
            .map((day) => day.trim())
            .filter(Boolean)
        : [];

    const daysMap = {
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
      Sunday: 0,
    };

    while (
      start.isSameOrBefore(end, 'day')
    ) {
      const dayOfWeek = start.day();

      const dayName = Object.keys(daysMap).find(
        (day) => daysMap[day] === dayOfWeek
      );

      if (normalizedDays.includes(dayName)) {
        eventDays.push({
          id: eventData.id,
          title: eventData.name,
          description: eventData.description,
          startTime: eventData.startTime,
          endTime: eventData.endTime,
          isPurchase: eventData.isPurchase,
          price: eventData.price,
          date: start.format('YYYY-MM-DD'),
        });
      }

      start.add(1, 'day');
    }

    return eventDays;
  };

  const handlePrevMonth = () => {
    setCurrentDate(
      currentDate.clone().subtract(1, 'months')
    );
  };

  const handleNextMonth = () => {
    setCurrentDate(
      currentDate.clone().add(1, 'months')
    );
  };

  const renderCalendarDaysMobile = () => {
    const startOfMonth = currentDate
      .clone()
      .startOf('month');

    const endOfMonth = currentDate
      .clone()
      .endOf('month');

    const startDay = startOfMonth
      .clone()
      .startOf('week');

    const endDay = endOfMonth
      .clone()
      .endOf('week');

    const days = [];
    const day = startDay.clone();

    while (
      day.isBefore(endDay, 'day') ||
      day.isSame(endDay, 'day')
    ) {
      const currentDay = day.clone();

      const isToday = currentDay.isSame(
        moment(),
        'day'
      );

      const isCurrentMonth = currentDay.isSame(
        currentDate,
        'month'
      );

      const eventsForDay = calendarEvents.filter(
        (event) =>
          event.date ===
          currentDay.format('YYYY-MM-DD')
      );

      days.push(
        <div
          key={currentDay.format('YYYY-MM-DD')}
          className={`calendar-day ${
            isCurrentMonth
              ? 'current-month'
              : 'other-month'
          } ${isToday ? 'today' : ''}`}
        >
          <span className="date-label">
            {currentDay.date()}
          </span>

          {eventsForDay.map((event, index) => (
            <div
              key={`${event.id}-${event.date}-${index}`}
              className="event-item"
              style={{
                backgroundColor: 'blue',
              }}
            />
          ))}
        </div>
      );

      day.add(1, 'day');
    }

    return days;
  };

  const renderCalendarDaysDesktop = () => {
    const startOfMonth = currentDate
      .clone()
      .startOf('month');

    const endOfMonth = currentDate
      .clone()
      .endOf('month');

    const startDay = startOfMonth
      .clone()
      .startOf('week');

    const endDay = endOfMonth
      .clone()
      .endOf('week');

    const days = [];
    const day = startDay.clone();

    while (
      day.isBefore(endDay, 'day') ||
      day.isSame(endDay, 'day')
    ) {
      const currentDay = day.clone();

      const isToday = currentDay.isSame(
        moment(),
        'day'
      );

      const isCurrentMonth = currentDay.isSame(
        currentDate,
        'month'
      );

      const eventsForDay = calendarEvents.filter(
        (event) =>
          event.date ===
          currentDay.format('YYYY-MM-DD')
      );

      days.push(
        <div
          key={currentDay.format('YYYY-MM-DD')}
          className={`calendar-day ${
            isCurrentMonth
              ? 'current-month'
              : 'other-month'
          } ${isToday ? 'today' : ''}`}
        >
          <span className="date-label">
            {currentDay.date()}
          </span>

          {eventsForDay.map((event, index) => (
            <div
              key={`${event.id}-${event.date}-${index}`}
              className="event-item"
            >
              <p className="event-title">
                {event.title}
              </p>

              <p className="event-time">
                {event.startTime} - {event.endTime}
              </p>

              {normalizePurchaseValue(
                event.isPurchase
              ) && (
                <p className="event-price">
                  $
                  {Number(
                    event.price || 0
                  ).toFixed(2)}
                </p>
              )}
            </div>
          ))}
        </div>
      );

      day.add(1, 'day');
    }

    return days;
  };

  const renderPurchaseFields = () => (
    <div
      className="mb-4"
      style={{
        boxShadow:
          '0px 4px 10px rgba(0, 0, 0, 0.3)',
        margin: '5px',
        padding: '10px',
        borderRadius: '8px',
      }}
    >
      <label
        className="form-label"
        htmlFor="isPurchase"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer',
        }}
      >
        <input
          id="isPurchase"
          name="isPurchase"
          type="checkbox"
          checked={newEvent.isPurchase}
          onChange={handleEventChange}
          style={{
            width: '20px',
            height: '20px',
            cursor: 'pointer',
          }}
        />

        Require payment for this event
      </label>

      {newEvent.isPurchase && (
        <div
          style={{
            marginTop: '15px',
          }}
        >
          <label
            htmlFor="eventPrice"
            className="form-label"
          >
            Event Price
          </label>

          <input
            id="eventPrice"
            name="price"
            type="number"
            min="0.01"
            step="0.01"
            value={newEvent.price}
            onChange={handleEventChange}
            className="form-input"
            placeholder="0.00"
            required
          />
        </div>
      )}
    </div>
  );

  const renderDaySelection = () => (
    <div
      className="mb-4"
      style={{
        boxShadow:
          '0px 4px 10px rgba(0, 0, 0, 0.3)',
        margin: '5px',
        padding: '10px',
      }}
    >
      <label
        className="form-label"
        style={{
          fontWeight: 'bold',
          marginBottom: '10px',
          display: 'block',
          textAlign: 'center',
        }}
      >
        Select Days of the Week
      </label>

      <div className="grid">
        {[
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday',
        ].map((day) => (
          <label
            key={day}
            className="day-item"
            style={{
              boxShadow:
                '0px 4px 10px rgba(0, 0, 0, 0.3)',
              padding: '10px',
              borderRadius: '8px',
              backgroundColor: '#f9f9f9',
              textAlign: 'center',
            }}
          >
            <input
              type="checkbox"
              name="days"
              value={day}
              checked={newEvent.days.includes(day)}
              onChange={() => handleDayChange(day)}
              className="checkbox"
              style={{
                width: '20px',
                height: '20px',
                cursor: 'pointer',
                marginBottom: '5px',
              }}
            />

            <span
              style={{
                fontSize: '14px',
                fontWeight: '500',
                color: '#333',
              }}
            >
              {day}
            </span>
          </label>
        ))}
      </div>
    </div>
  );

  const renderEventPreview = (event) => {
    if (editEventId === event.id) {
      return (
        <div className="event-preview-tile p-4 mb-2 border rounded-lg flex flex-col">
          <input
            type="text"
            name="name"
            value={newEvent.name}
            onChange={handleEventChange}
            className="form-input mb-2"
            placeholder="Event Name"
          />

          <textarea
            name="description"
            value={newEvent.description}
            onChange={handleEventChange}
            className="form-input mb-2"
            placeholder="Description"
          />

          <div className="form-section">
            <label>Frequency:</label>

            <select
              name="frequency"
              value={newEvent.frequency}
              onChange={handleEventChange}
              className="form-input"
            >
              <option value="weekly">
                Weekly
              </option>

              <option value="bi-weekly">
                Bi-Weekly
              </option>

              <option value="monthly">
                Monthly
              </option>

              <option value="yearly">
                Yearly
              </option>
            </select>
          </div>

          <div className="form-section">
            <label>Start Date:</label>

            <input
              type="date"
              name="startDate"
              value={newEvent.startDate}
              onChange={handleEventChange}
            />
          </div>

          <div className="form-section">
            <label>End Date:</label>

            <input
              type="date"
              name="endDate"
              value={newEvent.endDate}
              onChange={handleEventChange}
            />
          </div>

          <div className="form-section">
            <label>Start Time:</label>

            <input
              type="time"
              name="startTime"
              value={newEvent.startTime}
              onChange={handleEventChange}
              className="form-input mb-2"
            />
          </div>

          <div className="form-section">
            <label>End Time:</label>

            <input
              type="time"
              name="endTime"
              value={newEvent.endTime}
              onChange={handleEventChange}
              className="form-input mb-2"
            />
          </div>

          {renderPurchaseFields()}
          {renderDaySelection()}

          <div className="flex gap-2">
            <button
              className="text-green-500"
              onClick={handleSaveEvent}
            >
              Save
            </button>

            <button
              className="text-gray-500"
              onClick={cancelEditEvent}
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    const eventIsPurchase =
      normalizePurchaseValue(event.isPurchase);

    return (
      <div className="event-preview-tile p-4 mb-2 border rounded-lg flex flex-col">
        <div>
          <p className="event-title font-semibold">
            {event.name}
          </p>

          <p className="event-description text-gray-700">
            {event.description}
          </p>

          <p className="event-date text-sm text-gray-600">
            {moment(event.startDate).format(
              'MMMM Do YYYY'
            )}{' '}
            -{' '}
            {moment(event.endDate).format(
              'MMMM Do YYYY'
            )}
          </p>

          <p className="event-time text-sm text-gray-600">
            {event.startTime} - {event.endTime}
          </p>

          {eventIsPurchase ? (
            <p
              className="event-price text-sm"
              style={{
                fontWeight: 'bold',
                marginTop: '8px',
              }}
            >
              Paid event: $
              {Number(event.price || 0).toFixed(2)}
            </p>
          ) : (
            <p
              className="event-price text-sm"
              style={{
                marginTop: '8px',
              }}
            >
              Free event
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            className="text-blue-500"
            style={{
              margin: '20px',
            }}
            onClick={() => handleEditEvent(event)}
          >
            Edit
          </button>

          <button
            className="text-red-500"
            style={{
              margin: '20px',
            }}
            onClick={() =>
              handleDeleteEvent(event.id)
            }
          >
            🗑️
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="events-body">
      <div className="min-h-screen bg-gray-100 p-6">
        <h1
          className="event-header"
          style={{
            color: 'black',
            marginTop: '20%',
            letterSpacing: '.1em',
          }}
        >
          Events
        </h1>

        {validationError && (
          <p className="text-center text-red-500">
            {validationError}
          </p>
        )}

        {loading && (
          <p className="text-center">Loading...</p>
        )}

        {error && (
          <p className="text-center text-red-500">
            {error}
          </p>
        )}

        <div className="flex justify-center mb-8">
          <motion.button
            className="bg-blue-500 text-white px-6 py-3 rounded-lg shadow-md hover:bg-blue-600"
            whileHover={{
              scale: 1.05,
            }}
            whileTap={{
              scale: 0.95,
            }}
            onClick={() => {
              resetForm();
              setShowAddEventForm(true);
            }}
            style={{
              margin: '20px',
            }}
          >
            Add Event
          </motion.button>
        </div>

        {showAddEventForm && (
          <motion.div
            className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center"
            initial={{
              opacity: 0,
            }}
            animate={{
              opacity: 1,
            }}
            exit={{
              opacity: 0,
            }}
            style={{
              boxShadow:
                '0px 4px 10px rgba(0, 0, 0, 0.3)',
              margin: '5%',
              padding: '5%',
            }}
          >
            <div className="bg-white p-6 rounded-lg shadow-lg w-80 max-w-md">
              <button
                className="absolute top-2 right-2 text-gray-500"
                onClick={closeAddEventForm}
                style={{
                  padding: '5px',
                  margin: '10px',
                }}
              >
                Close
              </button>

              <h2 className="text-2xl font-bold mb-4">
                Add New Event
              </h2>

              <div className="mb-4">
                <label className="form-label">
                  Event Name
                </label>

                <input
                  type="text"
                  name="name"
                  value={newEvent.name}
                  onChange={handleEventChange}
                  className="form-input"
                />
              </div>

              <div className="mb-4">
                <label className="form-label">
                  Description
                </label>

                <textarea
                  name="description"
                  value={newEvent.description}
                  onChange={handleEventChange}
                  className="form-input"
                />
              </div>

              <div className="mb-4">
                <label className="form-label">
                  Frequency
                </label>

                <select
                  name="frequency"
                  value={newEvent.frequency}
                  onChange={handleEventChange}
                  className="form-input"
                >
                  <option value="weekly">
                    Weekly
                  </option>

                  <option value="bi-weekly">
                    Bi-Weekly
                  </option>

                  <option value="monthly">
                    Monthly
                  </option>

                  <option value="yearly">
                    Yearly
                  </option>
                </select>
              </div>

              <div className="form-section">
                <label>Start Date:</label>

                <input
                  type="date"
                  name="startDate"
                  value={newEvent.startDate}
                  onChange={handleEventChange}
                />
              </div>

              <div className="form-section">
                <label>End Date:</label>

                <input
                  type="date"
                  name="endDate"
                  value={newEvent.endDate}
                  onChange={handleEventChange}
                />
              </div>

              <label>
                Start Time:

                <input
                  type="time"
                  name="startTime"
                  value={newEvent.startTime}
                  onChange={handleEventChange}
                  required
                />
              </label>

              <label>
                End Time:

                <input
                  type="time"
                  name="endTime"
                  value={newEvent.endTime}
                  onChange={handleEventChange}
                  required
                />
              </label>

              {renderPurchaseFields()}
              {renderDaySelection()}

              <div className="flex justify-end">
                <button
                  className="bg-blue-500 text-white px-4 py-2 rounded-md"
                  onClick={handleAddEvent}
                  style={{
                    margin: '20px',
                  }}
                >
                  Add Event
                </button>
              </div>
            </div>
          </motion.div>
        )}

        <div className="calendar-container">
          <div className="calendar-header">
            <button onClick={handlePrevMonth}>
              &lt;
            </button>

            <h2
              style={{
                letterSpacing: '.1em',
              }}
            >
              {currentDate.format('MMMM YYYY')}
            </h2>

            <button onClick={handleNextMonth}>
              &gt;
            </button>
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

            {isMobileView
              ? renderCalendarDaysMobile()
              : renderCalendarDaysDesktop()}
          </div>
        </div>

        <div
          className="event-preview-section bg-white p-6 shadow-md rounded-lg mb-8"
          style={{
            backgroundColor: 'black',
            borderRadius: '20px',
          }}
        >
          <h2
            style={{
              fontFamily: 'Dancing Script',
              fontSize: '2rem',
              color: 'white',
              letterSpacing: '.1em',
            }}
          >
            Event Previews
          </h2>

          {validationError && (
            <p className="text-center text-red-500">
              {validationError}
            </p>
          )}

          {events.length === 0 && (
            <p>No events to display</p>
          )}

          {events.map((event) => (
            <div
              key={event.id}
              style={{
                letterSpacing: '.1em',
              }}
            >
              {renderEventPreview(event)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Events;