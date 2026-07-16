/* admin/newEvents.jsx */
import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  motion,
  AnimatePresence,
} from 'framer-motion';

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
  maxTicketQuantity: '',
};

const Events = () => {
  const [events, setEvents] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showAddEventForm, setShowAddEventForm] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [editEventId, setEditEventId] = useState(null);

  const [currentDate, setCurrentDate] = useState(
    moment().startOf('month')
  );

  const [selectedDate, setSelectedDate] = useState(
    moment().format('YYYY-MM-DD')
  );

  const [newEvent, setNewEvent] = useState({
    ...emptyEvent,
  });

  const normalizePurchaseValue = (value) => {
    if (
      value === true ||
      value === 1 ||
      value === '1'
    ) {
      return true;
    }

    if (
      value === false ||
      value === 0 ||
      value === '0' ||
      value === null ||
      value === undefined ||
      value === ''
    ) {
      return false;
    }

    if (typeof value === 'string') {
      const normalizedValue = value.trim().toLowerCase();

      return [
        'true',
        'yes',
        'y',
        'on',
      ].includes(normalizedValue);
    }

    return false;
  };

  const normalizeNumberValue = (
    value,
    fallback = 0
  ) => {
    const parsedValue = Number(value);

    return Number.isFinite(parsedValue)
      ? parsedValue
      : fallback;
  };

  const normalizeIntegerValue = (
    value,
    fallback = 0
  ) => {
    if (
      value === null ||
      value === undefined ||
      value === ''
    ) {
      return fallback;
    }

    const parsedValue = Number(value);

    return Number.isInteger(parsedValue)
      ? parsedValue
      : fallback;
  };

  const normalizeDateOnly = (value) => {
    if (!value) {
      return '';
    }

    if (moment.isMoment(value)) {
      return value.format('YYYY-MM-DD');
    }

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        return '';
      }

      const year = value.getFullYear();
      const month = String(
        value.getMonth() + 1
      ).padStart(2, '0');
      const day = String(
        value.getDate()
      ).padStart(2, '0');

      return `${year}-${month}-${day}`;
    }

    const stringValue = String(value).trim();
    const dateMatch = stringValue.match(
      /^(\d{4}-\d{2}-\d{2})/
    );

    return dateMatch ? dateMatch[1] : '';
  };

  const parseDateOnly = (value) => {
    const normalizedDate =
      normalizeDateOnly(value);

    return normalizedDate
      ? moment(
          normalizedDate,
          'YYYY-MM-DD',
          true
        )
      : moment.invalid();
  };

  const normalizeDays = (days) => {
    if (Array.isArray(days)) {
      return days
        .map((day) => String(day).trim())
        .filter(Boolean);
    }

    if (typeof days !== 'string') {
      return [];
    }

    const trimmedDays = days.trim();

    if (!trimmedDays) {
      return [];
    }

    try {
      const parsedDays = JSON.parse(trimmedDays);

      if (Array.isArray(parsedDays)) {
        return parsedDays
          .map((day) => String(day).trim())
          .filter(Boolean);
      }
    } catch (parseError) {
      /*
       * Probably comma-separated instead of JSON.
       */
    }

    return trimmedDays
      .split(',')
      .map((day) => day.trim())
      .filter(Boolean);
  };

  const getDayNameFromDate = (date) => {
    if (
      !date ||
      !moment(date, 'YYYY-MM-DD', true).isValid()
    ) {
      return '';
    }

    return moment(
      date,
      'YYYY-MM-DD',
      true
    ).format('dddd');
  };

  const formatTime = (time) => {
    if (!time) {
      return '—';
    }

    const parsedTime = moment(
      time,
      [
        'HH:mm:ss',
        'HH:mm',
        'h:mm A',
        'hh:mm A',
      ],
      true
    );

    return parsedTime.isValid()
      ? parsedTime.format('h:mm A')
      : time;
  };

  const parseEventDateTime = (
    date,
    time = '23:59'
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
      time || '23:59',
      [
        'HH:mm:ss',
        'HH:mm',
        'h:mm A',
        'hh:mm A',
      ],
      true
    );

    const eventDateTime = dateOnly.clone();

    if (parsedTime.isValid()) {
      eventDateTime
        .hour(parsedTime.hour())
        .minute(parsedTime.minute())
        .second(parsedTime.second());
    } else {
      eventDateTime.endOf('day');
    }

    return eventDateTime;
  };

  const normalizeEventRecord = (event) => {
    if (
      !event ||
      typeof event !== 'object'
    ) {
      return null;
    }
  
    const rawStartDate =
      event.startDate ??
      event.start_date ??
      event.date ??
      '';
  
    const rawEndDate =
      event.endDate ??
      event.end_date ??
      rawStartDate;
  
    const parsedPrice =
      normalizeNumberValue(
        event.price ??
          event.event_price ??
          event.ticketPrice ??
          event.ticket_price,
        0
      );
  
    const maxTicketQuantity =
      normalizeIntegerValue(
        event.maxTicketQuantity ??
          event.max_ticket_quantity ??
          event.ticketLimit ??
          event.ticket_limit,
        0
      );
  
    /*
     * Normalize the authoritative occurrence rows
     * returned by the backend.
     *
     * Ticket sales are stored on EventOccurrences,
     * not directly on the Events table.
     */
    const normalizedOccurrences =
      Array.isArray(event.occurrences)
        ? event.occurrences
            .map((occurrence) => {
              if (
                !occurrence ||
                typeof occurrence !==
                  'object'
              ) {
                return null;
              }
  
              const occurrenceDate =
                normalizeDateOnly(
                  occurrence.occurrenceDate ??
                    occurrence.occurrence_date ??
                    occurrence.date
                );
  
              if (!occurrenceDate) {
                return null;
              }
  
              const rawIsActive =
                occurrence.isActive ??
                occurrence.is_active;
  
              const isActive =
                rawIsActive === undefined ||
                rawIsActive === null
                  ? true
                  : normalizePurchaseValue(
                      rawIsActive
                    );
  
              return {
                ...occurrence,
  
                id:
                  occurrence.id ??
                  occurrence.occurrenceId ??
                  occurrence.occurrence_id,
  
                eventId:
                  occurrence.eventId ??
                  occurrence.event_id ??
                  event.id ??
                  event.eventId ??
                  event.event_id,
  
                occurrenceDate,
  
                capacity:
                  normalizeIntegerValue(
                    occurrence.capacity,
                    maxTicketQuantity
                  ),
  
                reservedCount:
                  normalizeIntegerValue(
                    occurrence.reservedCount ??
                      occurrence.reserved_count,
                    0
                  ),
  
                soldCount:
                  normalizeIntegerValue(
                    occurrence.soldCount ??
                      occurrence.sold_count,
                    0
                  ),
  
                isActive,
              };
            })
            .filter(Boolean)
        : [];
  
    /*
     * Event-level ticket totals are retained only as
     * legacy fallbacks. The occurrence rows above are
     * the primary source of truth.
     */
    const fallbackTicketsSold =
      normalizeIntegerValue(
        event.ticketsSold ??
          event.tickets_sold ??
          event.quantitySold ??
          event.quantity_sold,
        0
      );
  
    /*
     * This total is useful for summaries, but individual
     * calendar dates must still use occurrence.soldCount.
     */
    const ticketsSold =
      normalizedOccurrences.length > 0
        ? normalizedOccurrences.reduce(
            (total, occurrence) =>
              total +
              normalizeIntegerValue(
                occurrence.soldCount,
                0
              ),
            0
          )
        : fallbackTicketsSold;
  
    return {
      ...event,
  
      id:
        event.id ??
        event.eventId ??
        event.event_id,
  
      name:
        event.name ??
        event.eventName ??
        event.event_name ??
        event.title ??
        'Untitled event',
  
      description:
        event.description ??
        event.eventDescription ??
        event.event_description ??
        '',
  
      frequency:
        (
          event.frequency ??
          event.event_frequency ??
          'single'
        )
          .toString()
          .trim()
          .toLowerCase(),
  
      startDate:
        normalizeDateOnly(
          rawStartDate
        ),
  
      endDate:
        normalizeDateOnly(
          rawEndDate
        ) ||
        normalizeDateOnly(
          rawStartDate
        ),
  
      startTime:
        event.startTime ??
        event.start_time ??
        '',
  
      endTime:
        event.endTime ??
        event.end_time ??
        '',
  
      days:
        normalizeDays(
          event.days ??
            event.event_days ??
            event.selectedDays ??
            event.selected_days
        ),
  
      isPurchase:
        normalizePurchaseValue(
          event.isPurchase ??
            event.is_purchase ??
            event.purchaseRequired ??
            event.purchase_required
        ),
  
      price:
        parsedPrice,
  
      maxTicketQuantity,
  
      /*
       * Total sold across all occurrences.
       *
       * The generated calendar occurrence below will
       * override this with the correct per-date count.
       */
      ticketsSold,
  
      occurrences:
        normalizedOccurrences,
    };
  };

  const isEventSingleOccurrence = (event) => {
    const startDate = moment(
      event.startDate,
      'YYYY-MM-DD',
      true
    );

    const endDate = moment(
      event.endDate || event.startDate,
      'YYYY-MM-DD',
      true
    );

    return (
      event.frequency === 'single' ||
      event.frequency === 'once' ||
      (
        startDate.isValid() &&
        endDate.isValid() &&
        startDate.isSame(endDate, 'day')
      )
    );
  };

  const getTicketsSoldForDate = (
    event,
    dateKey
  ) => {
    const salesByDate =
      event.ticketsSoldByDate ??
      event.tickets_sold_by_date ??
      event.ticketSalesByDate ??
      event.ticket_sales_by_date ??
      event.reservationsByDate ??
      event.reservations_by_date ??
      {};

    const dateSpecificValue =
      salesByDate?.[dateKey] ??
      salesByDate?.[
        normalizeDateOnly(dateKey)
      ];

    if (
      dateSpecificValue !== null &&
      dateSpecificValue !== undefined
    ) {
      return normalizeIntegerValue(
        dateSpecificValue,
        0
      );
    }

    /*
     * For a single event, using the total sold count is safe.
     * For recurring events, do not spread total sales across
     * every occurrence. Recurring availability should come
     * from a backend per-date count.
     */
    if (isEventSingleOccurrence(event)) {
      return normalizeIntegerValue(
        event.ticketsSold ??
          event.tickets_sold ??
          event.quantitySold ??
          event.quantity_sold,
        0
      );
    }

    return 0;
  };

  const isSingleEvent =
    newEvent.frequency === 'single';

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

  const openEventFormForDate = (selectedDateValue) => {
    const formattedDate =
      normalizeDateOnly(selectedDateValue);

    const selectedDay =
      getDayNameFromDate(formattedDate);

    setNewEvent({
      ...emptyEvent,
      frequency: 'single',
      startDate: formattedDate,
      endDate: formattedDate,
      days: selectedDay
        ? [selectedDay]
        : [],
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
        price: checked
          ? previousEvent.price
          : '',
        maxTicketQuantity: checked
          ? previousEvent.maxTicketQuantity
          : '',
      }));

      return;
    }

    if (name === 'frequency') {
      setNewEvent((previousEvent) => {
        if (value === 'single') {
          const selectedDateValue =
            previousEvent.startDate;

          const selectedDay =
            getDayNameFromDate(selectedDateValue);

          return {
            ...previousEvent,
            frequency: value,
            endDate: selectedDateValue,
            days: selectedDay
              ? [selectedDay]
              : [],
          };
        }

        return {
          ...previousEvent,
          frequency: value,
          endDate:
            previousEvent.endDate ||
            previousEvent.startDate,
          days:
            previousEvent.days.length > 0
              ? previousEvent.days
              : previousEvent.startDate
                ? [
                    getDayNameFromDate(
                      previousEvent.startDate
                    ),
                  ].filter(Boolean)
                : [],
        };
      });

      return;
    }

    if (name === 'startDate') {
      setNewEvent((previousEvent) => {
        if (
          previousEvent.frequency === 'single'
        ) {
          const selectedDay =
            getDayNameFromDate(value);

          return {
            ...previousEvent,
            startDate: value,
            endDate: value,
            days: selectedDay
              ? [selectedDay]
              : [],
          };
        }

        return {
          ...previousEvent,
          startDate: value,
        };
      });

      return;
    }

    if (
      type === 'checkbox' &&
      name === 'days'
    ) {
      setNewEvent((previousEvent) => ({
        ...previousEvent,
        days: checked
          ? [
              ...previousEvent.days,
              value,
            ]
          : previousEvent.days.filter(
              (selectedDay) =>
                selectedDay !== value
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
            (selectedDay) =>
              selectedDay !== day
          )
        : [
            ...previousEvent.days,
            day,
          ],
    }));
  };

  const handleEditEvent = (event) => {
    const normalizedEvent =
      normalizeEventRecord(event);

    if (!normalizedEvent) {
      return;
    }

    const parsedDays =
      normalizeDays(normalizedEvent.days);

    const startDate =
      normalizeDateOnly(
        normalizedEvent.startDate
      );

    const endDate =
      normalizeDateOnly(
        normalizedEvent.endDate
      ) || startDate;

    const inferredSingleEvent =
      normalizedEvent.frequency ===
        'single' ||
      (
        startDate &&
        endDate &&
        parseDateOnly(startDate).isSame(
          parseDateOnly(endDate),
          'day'
        ) &&
        parsedDays.length <= 1
      );

    const frequency =
      inferredSingleEvent
        ? 'single'
        : normalizedEvent.frequency ||
          'weekly';

    const isPurchase =
      normalizePurchaseValue(
        normalizedEvent.isPurchase
      );

    const normalizedDays =
      inferredSingleEvent
        ? [
            getDayNameFromDate(startDate),
          ].filter(Boolean)
        : parsedDays;

    const maxTicketQuantity =
      normalizeIntegerValue(
        normalizedEvent.maxTicketQuantity ??
          normalizedEvent.max_ticket_quantity,
        0
      );

    setNewEvent({
      name: normalizedEvent.name || '',
      description:
        normalizedEvent.description || '',
      frequency,
      startDate,
      endDate: inferredSingleEvent
        ? startDate
        : endDate,
      startTime:
        normalizedEvent.startTime || '',
      endTime:
        normalizedEvent.endTime || '',
      days: normalizedDays,
      isPurchase,
      price:
        isPurchase &&
        Number(normalizedEvent.price) > 0
          ? String(normalizedEvent.price)
          : '',
      maxTicketQuantity:
        isPurchase &&
        maxTicketQuantity > 0
          ? String(maxTicketQuantity)
          : '',
    });

    setEditEventId(normalizedEvent.id);
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
      maxTicketQuantity,
    } = newEvent;

    if (!String(name).trim()) {
      setValidationError(
        'Enter an event name.'
      );

      return false;
    }

    if (!String(description).trim()) {
      setValidationError(
        'Enter an event description.'
      );

      return false;
    }

    if (!frequency) {
      setValidationError(
        'Select an event frequency.'
      );

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

    if (
      !isSingleEvent &&
      !endDate
    ) {
      setValidationError(
        'Select an end date.'
      );

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
      parseDateOnly(endDate).isBefore(
        parseDateOnly(startDate),
        'day'
      )
    ) {
      setValidationError(
        'The end date cannot be before the start date.'
      );

      return false;
    }

    const startsAt = moment(
      `${startDate} ${startTime}`,
      [
        'YYYY-MM-DD HH:mm',
        'YYYY-MM-DD HH:mm:ss',
      ],
      true
    );

    const endsAt = moment(
      `${
        isSingleEvent
          ? startDate
          : endDate
      } ${endTime}`,
      [
        'YYYY-MM-DD HH:mm',
        'YYYY-MM-DD HH:mm:ss',
      ],
      true
    );

    if (
      isSingleEvent &&
      startsAt.isValid() &&
      endsAt.isValid() &&
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

      const parsedMaxTicketQuantity =
        maxTicketQuantity === ''
          ? 0
          : Number(maxTicketQuantity);

      if (
        !Number.isInteger(
          parsedMaxTicketQuantity
        ) ||
        parsedMaxTicketQuantity < 0
      ) {
        setValidationError(
          'Enter a valid max ticket quantity. Use 0 or leave it blank for unlimited tickets.'
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

    const payloadStartDate =
      normalizeDateOnly(
        newEvent.startDate
      );

    const payloadEndDate = singleEvent
      ? payloadStartDate
      : normalizeDateOnly(
          newEvent.endDate
        );

    const payloadDays = singleEvent
      ? [
          getDayNameFromDate(
            payloadStartDate
          ),
        ]
      : newEvent.days;

    const isPurchase =
      newEvent.isPurchase === true;

    const parsedPrice = Number(
      newEvent.price
    );

    const parsedMaxTicketQuantity =
      parseInt(
        newEvent.maxTicketQuantity || '0',
        10
      );

    return {
      name: newEvent.name.trim(),
      description:
        newEvent.description.trim(),
      frequency: newEvent.frequency,
      startDate: payloadStartDate,
      endDate: payloadEndDate,
      startTime: newEvent.startTime,
      endTime: newEvent.endTime,
      days: payloadDays
        .filter(Boolean)
        .join(','),
      isPurchase,
      price:
        isPurchase &&
        Number.isFinite(parsedPrice) &&
        parsedPrice > 0
          ? parsedPrice
          : 0,
      maxTicketQuantity:
        isPurchase &&
        Number.isInteger(
          parsedMaxTicketQuantity
        ) &&
        parsedMaxTicketQuantity > 0
          ? parsedMaxTicketQuantity
          : 0,
    };
  };

  const generateEventOccurrences = (
    event
  ) => {
    const normalizedEvent =
      normalizeEventRecord(event);
  
    if (
      !normalizedEvent?.id ||
      !normalizedEvent?.startDate
    ) {
      return [];
    }
  
    /*
     * Prefer the authoritative EventOccurrences rows
     * returned by the backend.
     *
     * These rows contain the actual:
     * - occurrence date
     * - capacity
     * - reserved count
     * - sold count
     *
     * This is the data updated by the Stripe webhook.
     */
    if (
      Array.isArray(
        normalizedEvent.occurrences
      ) &&
      normalizedEvent.occurrences.length >
        0
    ) {
      return normalizedEvent.occurrences
        .filter(
          (occurrence) =>
            occurrence.isActive !==
            false
        )
        .map((occurrence) => {
          const occurrenceDate =
            normalizeDateOnly(
              occurrence.occurrenceDate
            );
  
          if (!occurrenceDate) {
            return null;
          }
  
          const occurrenceCapacity =
            normalizeIntegerValue(
              occurrence.capacity,
              normalizedEvent
                .maxTicketQuantity
            );
  
          const occurrenceSoldCount =
            normalizeIntegerValue(
              occurrence.soldCount ??
                occurrence.sold_count,
              0
            );
  
          const occurrenceReservedCount =
            normalizeIntegerValue(
              occurrence.reservedCount ??
                occurrence.reserved_count,
              0
            );
  
          return {
            id:
              normalizedEvent.id,
  
            occurrenceId:
              occurrence.id ??
              occurrence.occurrenceId ??
              occurrence.occurrence_id,
  
            title:
              normalizedEvent.name,
  
            description:
              normalizedEvent.description,
  
            startTime:
              normalizedEvent.startTime,
  
            endTime:
              normalizedEvent.endTime,
  
            isPurchase:
              normalizedEvent.isPurchase,
  
            price:
              normalizedEvent.price,
  
            /*
             * Capacity is stored per occurrence.
             * Fall back to the event-level limit only
             * for older records.
             */
            maxTicketQuantity:
              occurrenceCapacity,
  
            /*
             * These are the authoritative counts
             * updated by the event Stripe webhook.
             */
            ticketsSold:
              occurrenceSoldCount,
  
            reservedCount:
              occurrenceReservedCount,
  
            remainingTickets:
              occurrenceCapacity > 0
                ? Math.max(
                    0,
                    occurrenceCapacity -
                      occurrenceSoldCount -
                      occurrenceReservedCount
                  )
                : null,
  
            date:
              occurrenceDate,
          };
        })
        .filter(Boolean);
    }
  
    /*
     * Legacy fallback:
     *
     * Use calculated dates only when the API response
     * does not contain EventOccurrences. This supports
     * older data while keeping current occurrence rows
     * authoritative.
     */
    const normalizedDays =
      normalizeDays(
        normalizedEvent.days
      );
  
    const eventStartDate =
      moment(
        normalizedEvent.startDate,
        'YYYY-MM-DD',
        true
      );
  
    const eventEndDate =
      moment(
        normalizedEvent.endDate ||
          normalizedEvent.startDate,
        'YYYY-MM-DD',
        true
      );
  
    if (!eventStartDate.isValid()) {
      return [];
    }
  
    const safeEndDate =
      eventEndDate.isValid()
        ? eventEndDate
        : eventStartDate.clone();
  
    /*
     * Protect against malformed event records where
     * the end date precedes the start date.
     */
    if (
      safeEndDate.isBefore(
        eventStartDate,
        'day'
      )
    ) {
      safeEndDate.set({
        year:
          eventStartDate.year(),
        month:
          eventStartDate.month(),
        date:
          eventStartDate.date(),
      });
    }
  
    const createLegacyOccurrence = (
      dateKey
    ) => {
      const ticketsSold =
        getTicketsSoldForDate(
          normalizedEvent,
          dateKey
        );
  
      const maxTicketQuantity =
        normalizeIntegerValue(
          normalizedEvent
            .maxTicketQuantity,
          0
        );
  
      return {
        id:
          normalizedEvent.id,
  
        occurrenceId:
          null,
  
        title:
          normalizedEvent.name,
  
        description:
          normalizedEvent.description,
  
        startTime:
          normalizedEvent.startTime,
  
        endTime:
          normalizedEvent.endTime,
  
        isPurchase:
          normalizedEvent.isPurchase,
  
        price:
          normalizedEvent.price,
  
        maxTicketQuantity,
  
        ticketsSold,
  
        reservedCount:
          0,
  
        remainingTickets:
          maxTicketQuantity > 0
            ? Math.max(
                0,
                maxTicketQuantity -
                  ticketsSold
              )
            : null,
  
        date:
          dateKey,
      };
    };
  
    const isSingleOccurrence =
      normalizedEvent.frequency ===
        'single' ||
      normalizedEvent.frequency ===
        'once' ||
      eventStartDate.isSame(
        safeEndDate,
        'day'
      );
  
    if (isSingleOccurrence) {
      return [
        createLegacyOccurrence(
          eventStartDate.format(
            'YYYY-MM-DD'
          )
        ),
      ];
    }
  
    /*
     * If an older recurring event has no selected
     * weekdays, preserve its start date rather than
     * hiding it from the admin calendar.
     */
    if (
      normalizedDays.length === 0
    ) {
      return [
        createLegacyOccurrence(
          eventStartDate.format(
            'YYYY-MM-DD'
          )
        ),
      ];
    }
  
    const occurrences = [];
    const cursor =
      eventStartDate.clone();
  
    while (
      cursor.isSameOrBefore(
        safeEndDate,
        'day'
      )
    ) {
      const fullDayName =
        cursor
          .format('dddd')
          .toLowerCase();
  
      const shortDayName =
        cursor
          .format('ddd')
          .toLowerCase();
  
      const hasMatchingDay =
        normalizedDays.some(
          (day) => {
            const normalizedDay =
              String(day)
                .trim()
                .toLowerCase();
  
            return (
              normalizedDay ===
                fullDayName ||
              normalizedDay ===
                shortDayName ||
              fullDayName.startsWith(
                normalizedDay
              ) ||
              normalizedDay.startsWith(
                shortDayName
              )
            );
          }
        );
  
      if (hasMatchingDay) {
        occurrences.push(
          createLegacyOccurrence(
            cursor.format(
              'YYYY-MM-DD'
            )
          )
        );
      }
  
      cursor.add(1, 'day');
    }
  
    return occurrences;
  };
  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);

      const response =
        await adminApi.get(
          '/admin-event/events'
        );

      const rawEvents = Array.isArray(
        response.data
      )
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
        rawEvents
          .map(normalizeEventRecord)
          .filter(Boolean);

      setEvents(normalizedEvents);

      const occurrences =
        normalizedEvents.flatMap(
          generateEventOccurrences
        );

      setCalendarEvents(occurrences);
    } catch (fetchError) {
      console.error(
        'Fetch error:',
        fetchError
      );

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

    const formattedEvent =
      buildEventPayload();

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
      console.error(
        'Error saving event:',
        saveError
      );

      setValidationError(
        saveError.response?.data?.message ||
          'Unable to save the event.'
      );
    }
  };

  const handleDeleteEvent = async (
    eventId
  ) => {
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

  const eventsByDate = useMemo(() => {
    return calendarEvents.reduce(
      (calendar, event) => {
        if (!calendar[event.date]) {
          calendar[event.date] = [];
        }

        calendar[event.date].push(event);

        return calendar;
      },
      {}
    );
  }, [calendarEvents]);

  const selectedEvents =
    eventsByDate[selectedDate] || [];

  const upcomingOccurrences = useMemo(() => {
    const now = moment();

    return calendarEvents
      .filter((event) => {
        const eventDateTime =
          parseEventDateTime(
            event.date,
            event.startTime || '23:59'
          );

        return (
          eventDateTime.isValid() &&
          eventDateTime.isSameOrAfter(now)
        );
      })
      .sort((firstEvent, secondEvent) => {
        const firstDateTime =
          parseEventDateTime(
            firstEvent.date,
            firstEvent.startTime || '23:59'
          );

        const secondDateTime =
          parseEventDateTime(
            secondEvent.date,
            secondEvent.startTime || '23:59'
          );

        return (
          firstDateTime.valueOf() -
          secondDateTime.valueOf()
        );
      });
  }, [calendarEvents]);

  const featuredEvent =
    upcomingOccurrences[0] || null;

  useEffect(() => {
    if (!featuredEvent?.date) {
      return;
    }

    const featuredDate = moment(
      featuredEvent.date,
      'YYYY-MM-DD',
      true
    );

    if (!featuredDate.isValid()) {
      return;
    }

    setSelectedDate(
      featuredDate.format('YYYY-MM-DD')
    );

    setCurrentDate(
      featuredDate
        .clone()
        .startOf('month')
    );
  }, [
    featuredEvent?.id,
    featuredEvent?.date,
  ]);

  const calendarDays = useMemo(() => {
    const startOfCalendar =
      currentDate
        .clone()
        .startOf('month')
        .startOf('week');

    const endOfCalendar =
      currentDate
        .clone()
        .endOf('month')
        .endOf('week');

    const days = [];
    const cursor =
      startOfCalendar.clone();

    while (
      cursor.isSameOrBefore(
        endOfCalendar,
        'day'
      )
    ) {
      days.push(cursor.clone());
      cursor.add(1, 'day');
    }

    return days;
  }, [currentDate]);

  const handlePrevMonth = () => {
    setCurrentDate((previousDate) =>
      previousDate
        .clone()
        .subtract(1, 'month')
    );
  };

  const handleNextMonth = () => {
    setCurrentDate((previousDate) =>
      previousDate
        .clone()
        .add(1, 'month')
    );
  };

  const handleCurrentMonth = () => {
    const today = moment();

    setCurrentDate(
      today.clone().startOf('month')
    );

    setSelectedDate(
      today.format('YYYY-MM-DD')
    );
  };

  const handleSelectDate = (date) => {
    setSelectedDate(
      date.format('YYYY-MM-DD')
    );

    setValidationError('');
  };

  const findSourceEvent = (eventId) =>
    events.find(
      (event) => event.id === eventId
    );

  const renderSelectedEvent = (
    event,
    index
  ) => {
    const sourceEvent =
      findSourceEvent(event.id);

    const eventIsPurchase =
      normalizePurchaseValue(
        event.isPurchase
      );

    const maxTicketQuantity =
      normalizeIntegerValue(
        event.maxTicketQuantity ??
          event.max_ticket_quantity,
        0
      );

    const ticketsSold =
      normalizeIntegerValue(
        event.ticketsSold ??
          event.tickets_sold,
        0
      );

    return (
      <article
        key={`${event.id}-${event.date}-${index}`}
        className="admin-selected-event"
      >
        <div className="admin-selected-event__heading">
          <div>
            <span>
              {formatTime(event.startTime)}
            </span>

            <h3>{event.title}</h3>
          </div>

          <strong>
            {eventIsPurchase
              ? `$${Number(
                  event.price || 0
                ).toFixed(2)}`
              : 'Free'}
          </strong>
        </div>

        {event.description && (
          <p>{event.description}</p>
        )}

        <div className="admin-selected-event__meta">
          <span>
            {formatTime(event.startTime)} –{' '}
            {formatTime(event.endTime)}
          </span>
          <br />
          {eventIsPurchase && (
            <span>
              {maxTicketQuantity > 0
                ? `${ticketsSold} / ${maxTicketQuantity} tickets sold`
                : `${ticketsSold} tickets sold — unlimited`}
            </span>
          )}
        </div>

        <div className="admin-selected-event__actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={() =>
              sourceEvent &&
              handleEditEvent(sourceEvent)
            }
            disabled={!sourceEvent}
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
        <div className="event-ticket-settings">
          <div className="form-field">
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

          <div className="form-field">
            <label htmlFor="maxTicketQuantity">
              Max tickets per event date
            </label>

            <input
              id="maxTicketQuantity"
              name="maxTicketQuantity"
              type="number"
              min="0"
              step="1"
              value={newEvent.maxTicketQuantity}
              onChange={handleEventChange}
              placeholder="0"
            />

            <span className="form-field__hint">
              For recurring events, this limit applies to each individual calendar date. Use 0 or leave blank for unlimited.
            </span>
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

                <span>
                  {day.slice(0, 3)}
                </span>
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
                        {parseDateOnly(
                          newEvent.startDate
                        ).format(
                          'dddd, MMMM D, YYYY'
                        )}
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
      normalizePurchaseValue(
        event.isPurchase
      );

    const startDate = moment(
      event.startDate,
      'YYYY-MM-DD',
      true
    );

    const endDate = moment(
      event.endDate || event.startDate,
      'YYYY-MM-DD',
      true
    );

    const singleEvent =
      event.frequency === 'single' ||
      (
        startDate.isValid() &&
        endDate.isValid() &&
        startDate.isSame(
          endDate,
          'day'
        )
      );

    const maxTicketQuantity =
      normalizeIntegerValue(
        event.maxTicketQuantity ??
          event.max_ticket_quantity,
        0
      );

    return (
      <article className="event-card">
        <div className="event-card__content">
          <div className="event-card__heading">
            <div>
              <span className="event-card__type">
                {singleEvent
                  ? 'Single event'
                  : event.frequency ||
                    'Recurring'}
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
                  ? startDate.format(
                      'MMMM D, YYYY'
                    )
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
                {formatTime(event.startTime)} –{' '}
                {formatTime(event.endTime)}
              </strong>
            </div>

            {eventIsPurchase && (
              <div className="event-card__detail">
                <span>Ticket limit</span>

                <strong>
                  {maxTicketQuantity > 0
                    ? `${maxTicketQuantity} per event date`
                    : 'Unlimited'}
                </strong>
              </div>
            )}
          </div>
        </div>

        <div className="event-card__actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={() =>
              handleEditEvent(event)
            }
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
    <main className="events-body events-page admin-events-page">
      <section className="events-page__shell">
        <header className="events-page__header admin-events-heading">
          <div>
            <span className="events-page__eyebrow">
              Event administration
            </span>

            <h1>Manage Events</h1>

            <p>
              Select a calendar date to review scheduled events,
              edit details, delete entries, or create a new event.
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

        {validationError &&
          !showAddEventForm && (
            <div className="event-alert event-alert--error">
              {validationError}
            </div>
          )}

        {error && (
          <div className="event-alert event-alert--error">
            {error}
          </div>
        )}

        {loading && (
          <div className="admin-events-loading">
            Loading events...
          </div>
        )}

        {!loading && featuredEvent && (
          <section className="admin-featured-event">
            <div className="admin-featured-event__date">
              <span>
                {parseDateOnly(
                  featuredEvent.date
                ).format('MMM')}
              </span>

              <strong>
                {parseDateOnly(
                  featuredEvent.date
                ).format('D')}
              </strong>

              <span>
                {parseDateOnly(
                  featuredEvent.date
                ).format('YYYY')}
              </span>
            </div>

            <div className="admin-featured-event__content">
              <span className="events-page__eyebrow">
                Next event
              </span>

              <h2>{featuredEvent.title}</h2>

              {featuredEvent.description && (
                <p>
                  {featuredEvent.description}
                </p>
              )}

              <div className="admin-featured-event__meta">
                <span>
                  {parseDateOnly(
                    featuredEvent.date
                  ).format(
                    'dddd, MMMM D, YYYY'
                  )}
                </span>

                <span>
                  {formatTime(
                    featuredEvent.startTime
                  )}{' '}
                  –{' '}
                  {formatTime(
                    featuredEvent.endTime
                  )}
                </span>

                {normalizePurchaseValue(
                  featuredEvent.isPurchase
                ) && (
                  <span>
                    {normalizeIntegerValue(
                      featuredEvent.maxTicketQuantity,
                      0
                    ) > 0
                      ? `${normalizeIntegerValue(
                          featuredEvent.ticketsSold,
                          0
                        )} / ${normalizeIntegerValue(
                          featuredEvent.maxTicketQuantity,
                          0
                        )} tickets sold`
                      : `${normalizeIntegerValue(
                          featuredEvent.ticketsSold,
                          0
                        )} tickets sold — unlimited`}
                  </span>
                )}
              </div>
            </div>

            <div className="admin-featured-event__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => {
                  const sourceEvent =
                    findSourceEvent(
                      featuredEvent.id
                    );

                  if (sourceEvent) {
                    handleEditEvent(
                      sourceEvent
                    );
                  }
                }}
              >
                Edit event
              </button>
            </div>
          </section>
        )}

        <div className="admin-events-layout">
          <section className="calendar-card admin-calendar-card">
            <div className="calendar-toolbar">
              <div>
                <span className="calendar-toolbar__label">
                  Event calendar
                </span>

                <h2>
                  {currentDate.format(
                    'MMMM YYYY'
                  )}
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

            <div className="calendar-grid admin-calendar-grid">
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

              {calendarDays.map((date) => {
                const dateKey =
                  date.format('YYYY-MM-DD');

                const eventsForDay =
                  eventsByDate[dateKey] ||
                  [];

                const isToday =
                  date.isSame(moment(), 'day');

                const isCurrentMonth =
                  date.isSame(
                    currentDate,
                    'month'
                  );

                const isSelected =
                  dateKey === selectedDate;

                return (
                  <button
                    type="button"
                    key={dateKey}
                    className={[
                      'calendar-day',
                      isCurrentMonth
                        ? 'calendar-day--current'
                        : 'calendar-day--outside',
                      isToday
                        ? 'calendar-day--today'
                        : '',
                      isSelected
                        ? 'calendar-day--selected'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() =>
                      handleSelectDate(date)
                    }
                    onDoubleClick={() =>
                      openEventFormForDate(date)
                    }
                    aria-label={`View events on ${date.format(
                      'MMMM D, YYYY'
                    )}`}
                  >
                    <span className="calendar-day__number">
                      {date.date()}
                    </span>

                    {eventsForDay.length > 0 && (
                      <span className="admin-calendar-event-count">
                        {eventsForDay.length}
                      </span>
                    )}

                    <div
                      className="admin-calendar-event-dots"
                      aria-hidden="true"
                    >
                      {eventsForDay
                        .slice(0, 5)
                        .map(
                          (
                            event,
                            index
                          ) => (
                            <span
                              key={`${event.id}-${dateKey}-${index}`}
                            />
                          )
                        )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="admin-selected-events-panel">
            <div className="admin-selected-events-header">
              <span className="events-page__eyebrow">
                Selected date
              </span>

              <h2>
                {parseDateOnly(
                  selectedDate
                ).format(
                  'MMMM D, YYYY'
                )}
              </h2>

              <button
                type="button"
                className="button button--primary"
                onClick={() =>
                  openEventFormForDate(
                    selectedDate
                  )
                }
              >
                Add event on this date
              </button>
            </div>

            <div className="admin-selected-events-list">
              {selectedEvents.length === 0 ? (
                <div className="admin-selected-events-empty">
                  <h3>
                    No events scheduled
                  </h3>

                  <p>
                    Create an event for this date using the button above.
                  </p>
                </div>
              ) : (
                selectedEvents.map(
                  renderSelectedEvent
                )
              )}
            </div>
          </aside>
        </div>

        <section className="event-list-section admin-event-directory">
          <div className="event-list-section__header">
            <div>
              <span className="events-page__eyebrow">
                Event directory
              </span>

              <h2>
                All scheduled events
              </h2>
            </div>

            <span className="event-list-section__count">
              {events.length}{' '}
              {events.length === 1
                ? 'event'
                : 'events'}
            </span>
          </div>

          {!loading &&
          events.length === 0 ? (
            <div className="event-empty-state">
              <h3>
                No events scheduled
              </h3>

              <p>
                Select a date or use the Add event button to create one.
              </p>
            </div>
          ) : (
            <div className="event-list">
              {events.map((event) => (
                <React.Fragment
                  key={event.id}
                >
                  {renderEventPreview(
                    event
                  )}
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