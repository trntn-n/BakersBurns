
'use strict';

const {
  ValidationError,
  Op,
} = require('sequelize');

const sequelize = require('../../config/database');
const Event = require('../../models/events');
const EventOccurrence = require('../../models/eventOccurrence');

const MAX_GENERATED_OCCURRENCES = 3660;

const WEEKDAY_NUMBERS = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const hasProperty = (object, property) =>
  Object.prototype.hasOwnProperty.call(object, property);

const createHttpError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const normalizeBoolean = (value, fallback = false) => {
  if (value === true || value === 1) {
    return true;
  }

  if (
    value === false ||
    value === 0 ||
    value === null ||
    value === undefined
  ) {
    return false;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }

    if (
      [
        '',
        'false',
        '0',
        'no',
        'off',
        'null',
        'undefined',
      ].includes(normalized)
    ) {
      return false;
    }
  }

  return fallback;
};

const normalizePrice = (value) => {
  if (
    value === '' ||
    value === null ||
    value === undefined ||
    value === false
  ) {
    return 0;
  }

  const parsedPrice = Number(value);

  if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
    return 0;
  }

  return Math.round(parsedPrice * 100) / 100;
};

const normalizeNonNegativeInteger = (
  value,
  fallback = 0
) => {
  if (
    value === '' ||
    value === null ||
    value === undefined ||
    value === false
  ) {
    return fallback;
  }

  const parsedValue = Number(value);

  if (
    !Number.isInteger(parsedValue) ||
    parsedValue < 0
  ) {
    return fallback;
  }

  return parsedValue;
};

/**
 * Parse a date without allowing the server's local timezone to
 * accidentally change the calendar day.
 */
const parseDate = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    return new Date(value.getTime());
  }

  const stringValue = String(value).trim();
  const dateOnlyMatch = stringValue.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;

    const parsedDate = new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day)
      )
    );

    if (
      parsedDate.getUTCFullYear() !== Number(year) ||
      parsedDate.getUTCMonth() !== Number(month) - 1 ||
      parsedDate.getUTCDate() !== Number(day)
    ) {
      return null;
    }

    return parsedDate;
  }

  const parsedDate = new Date(stringValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
};

const formatDateOnly = (dateValue) => {
  const parsedDate = parseDate(dateValue);

  if (!parsedDate) {
    return null;
  }

  return [
    parsedDate.getUTCFullYear(),
    String(parsedDate.getUTCMonth() + 1).padStart(2, '0'),
    String(parsedDate.getUTCDate()).padStart(2, '0'),
  ].join('-');
};

const addUtcDays = (date, days) => {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

const normalizeFrequency = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  if (
    [
      'once',
      'one-time',
      'one time',
      'single',
      'single-event',
      'none',
    ].includes(normalized)
  ) {
    return 'once';
  }

  if (
    [
      'daily',
      'every day',
      'everyday',
    ].includes(normalized)
  ) {
    return 'daily';
  }

  if (
    [
      'weekly',
      'every week',
      'week',
    ].includes(normalized)
  ) {
    return 'weekly';
  }

  /*
   * Events with selected weekdays are treated as weekly schedules.
   * This also supports older frontend frequency values.
   */
  return normalized || 'once';
};

const normalizeSelectedWeekdays = (days) => {
  if (
    days === null ||
    days === undefined ||
    days === ''
  ) {
    return [];
  }

  let rawDays = days;

  if (typeof rawDays === 'string') {
    const trimmed = rawDays.trim();

    try {
      const parsed = JSON.parse(trimmed);

      if (Array.isArray(parsed)) {
        rawDays = parsed;
      } else {
        rawDays = trimmed.split(',');
      }
    } catch {
      rawDays = trimmed.split(',');
    }
  }

  if (!Array.isArray(rawDays)) {
    rawDays = [rawDays];
  }

  const weekdayNumbers = new Set();

  for (const rawDay of rawDays) {
    if (
      Number.isInteger(rawDay) &&
      rawDay >= 0 &&
      rawDay <= 6
    ) {
      weekdayNumbers.add(rawDay);
      continue;
    }

    const normalizedDay = String(rawDay)
      .trim()
      .toLowerCase();

    if (hasProperty(WEEKDAY_NUMBERS, normalizedDay)) {
      weekdayNumbers.add(
        WEEKDAY_NUMBERS[normalizedDay]
      );
    }
  }

  return [...weekdayNumbers].sort(
    (first, second) => first - second
  );
};

/**
 * Generate the date-only values that should exist in
 * EventOccurrences for an event.
 */
const generateOccurrenceDates = ({
  startDate,
  endDate,
  frequency,
  days,
}) => {
  const parsedStartDate = parseDate(startDate);
  const parsedEndDate = parseDate(endDate);

  if (!parsedStartDate || !parsedEndDate) {
    throw createHttpError(
      'A valid start date and end date are required.'
    );
  }

  if (parsedEndDate < parsedStartDate) {
    throw createHttpError(
      'The end date cannot be before the start date.'
    );
  }

  const normalizedFrequency =
    normalizeFrequency(frequency);

  const selectedWeekdays =
    normalizeSelectedWeekdays(days);

  const occurrenceDates = [];

  if (normalizedFrequency === 'once') {
    occurrenceDates.push(
      formatDateOnly(parsedStartDate)
    );

    return occurrenceDates;
  }

  let currentDate = new Date(
    parsedStartDate.getTime()
  );

  while (currentDate <= parsedEndDate) {
    if (
      occurrenceDates.length >=
      MAX_GENERATED_OCCURRENCES
    ) {
      throw createHttpError(
        `This schedule would generate more than ${MAX_GENERATED_OCCURRENCES} occurrences.`
      );
    }

    const currentWeekday =
      currentDate.getUTCDay();

    let shouldInclude = false;

    if (normalizedFrequency === 'daily') {
      shouldInclude = true;
    } else if (selectedWeekdays.length > 0) {
      shouldInclude =
        selectedWeekdays.includes(currentWeekday);
    } else if (normalizedFrequency === 'weekly') {
      shouldInclude =
        currentWeekday ===
        parsedStartDate.getUTCDay();
    } else {
      /*
       * For an unrecognized recurring frequency, selected
       * weekdays remain the safest schedule source.
       */
      shouldInclude =
        selectedWeekdays.length === 0
          ? currentDate.getTime() ===
            parsedStartDate.getTime()
          : selectedWeekdays.includes(
              currentWeekday
            );
    }

    if (shouldInclude) {
      occurrenceDates.push(
        formatDateOnly(currentDate)
      );
    }

    currentDate = addUtcDays(currentDate, 1);
  }

  if (occurrenceDates.length === 0) {
    throw createHttpError(
      'The event schedule does not produce any occurrence dates.'
    );
  }

  return occurrenceDates;
};

const getOccurrenceCapacity = (eventRecord) =>
  normalizeNonNegativeInteger(
    eventRecord.maxTicketQuantity,
    0
  );

/**
 * Synchronize an Event's calculated schedule with EventOccurrences.
 *
 * Existing rows are retained so their soldCount and reservedCount
 * values are preserved.
 *
 * Dates removed from the schedule may only be deleted when they
 * have no sold or currently reserved tickets.
 */
const synchronizeEventOccurrences = async (
  eventRecord,
  transaction
) => {
  const expectedDates = generateOccurrenceDates({
    startDate: eventRecord.startDate,
    endDate: eventRecord.endDate,
    frequency: eventRecord.frequency,
    days: eventRecord.days,
  });

  const expectedDateSet = new Set(expectedDates);
  const capacity =
    getOccurrenceCapacity(eventRecord);

  const existingOccurrences =
    await EventOccurrence.findAll({
      where: {
        eventId: eventRecord.id,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

  const existingByDate = new Map(
    existingOccurrences.map((occurrence) => [
      String(occurrence.occurrenceDate),
      occurrence,
    ])
  );

  const occurrencesToCreate = [];

  for (const occurrenceDate of expectedDates) {
    const existingOccurrence =
      existingByDate.get(occurrenceDate);

    if (existingOccurrence) {
      existingOccurrence.capacity = capacity;
      existingOccurrence.isActive = true;

      await existingOccurrence.save({
        transaction,
      });

      continue;
    }

    occurrencesToCreate.push({
      eventId: eventRecord.id,
      occurrenceDate,
      capacity,
      reservedCount: 0,
      soldCount: 0,
      isActive: true,
    });
  }

  if (occurrencesToCreate.length > 0) {
    await EventOccurrence.bulkCreate(
      occurrencesToCreate,
      {
        transaction,
      }
    );
  }

  const removedOccurrences =
    existingOccurrences.filter(
      (occurrence) =>
        !expectedDateSet.has(
          String(occurrence.occurrenceDate)
        )
    );

  const protectedOccurrences =
    removedOccurrences.filter((occurrence) => {
      const reservedCount = Number(
        occurrence.reservedCount || 0
      );

      const soldCount = Number(
        occurrence.soldCount || 0
      );

      return (
        reservedCount > 0 ||
        soldCount > 0
      );
    });

  if (protectedOccurrences.length > 0) {
    const protectedDates =
      protectedOccurrences.map(
        (occurrence) =>
          String(occurrence.occurrenceDate)
      );

    throw createHttpError(
      `The schedule cannot remove these dates because tickets are reserved or sold: ${protectedDates.join(', ')}.`
    );
  }

  const removableOccurrenceIds =
    removedOccurrences.map(
      (occurrence) => occurrence.id
    );

  if (removableOccurrenceIds.length > 0) {
    await EventOccurrence.destroy({
      where: {
        id: {
          [Op.in]: removableOccurrenceIds,
        },
      },
      transaction,
    });
  }

  return EventOccurrence.findAll({
    where: {
      eventId: eventRecord.id,
    },
    order: [['occurrenceDate', 'ASC']],
    transaction,
  });
};

const sendControllerError = (
  res,
  error,
  defaultMessage
) => {
  console.error(defaultMessage, error);

  if (error instanceof ValidationError) {
    return res.status(400).json({
      message: 'Event validation failed.',
      errors: error.errors.map(
        (validationError) =>
          validationError.message
      ),
    });
  }

  if (error.status) {
    return res.status(error.status).json({
      message: error.message,
    });
  }

  return res.status(500).json({
    message: defaultMessage,
    error:
      process.env.NODE_ENV === 'production'
        ? undefined
        : error.message,
  });
};

const getAllEvents = async (req, res) => {
  try {
    const events = await Event.findAll({
      order: [['startDate', 'ASC']],
    });

    const eventIds = events.map(
      (event) => event.id
    );

    const occurrences =
      eventIds.length > 0
        ? await EventOccurrence.findAll({
            where: {
              eventId: {
                [Op.in]: eventIds,
              },
            },
            order: [
              ['eventId', 'ASC'],
              ['occurrenceDate', 'ASC'],
            ],
          })
        : [];

    const occurrencesByEvent = new Map();

    for (const occurrence of occurrences) {
      const existing =
        occurrencesByEvent.get(
          occurrence.eventId
        ) || [];

      existing.push(occurrence);
      occurrencesByEvent.set(
        occurrence.eventId,
        existing
      );
    }

    const response = events.map((event) => ({
      ...event.toJSON(),
      occurrences:
        occurrencesByEvent.get(event.id) || [],
    }));

    return res.status(200).json(response);
  } catch (error) {
    return sendControllerError(
      res,
      error,
      'Error fetching events.'
    );
  }
};

const getEventById = async (req, res) => {
  const { id } = req.params;

  try {
    const event = await Event.findByPk(id);

    if (!event) {
      return res.status(404).json({
        message: 'Event not found.',
      });
    }

    const occurrences =
      await EventOccurrence.findAll({
        where: {
          eventId: event.id,
        },
        order: [['occurrenceDate', 'ASC']],
      });

    return res.status(200).json({
      ...event.toJSON(),
      occurrences,
    });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      'Error fetching event.'
    );
  }
};

const createEvent = async (req, res) => {
  try {
    const {
      name,
      description,
      frequency,
      days,
      startDate,
      endDate,
      startTime,
      endTime,
      isPurchase,
      price,
      maxTicketQuantity,
    } = req.body;

    const parsedStartDate =
      parseDate(startDate);

    const parsedEndDate =
      parseDate(endDate);

    if (!parsedStartDate || !parsedEndDate) {
      return res.status(400).json({
        message:
          'A valid start date and end date are required.',
      });
    }

    if (parsedEndDate < parsedStartDate) {
      return res.status(400).json({
        message:
          'The end date cannot be before the start date.',
      });
    }

    const normalizedIsPurchase =
      normalizeBoolean(isPurchase, false);

    const normalizedPrice =
      normalizedIsPurchase
        ? normalizePrice(price)
        : 0;

    if (
      normalizedIsPurchase &&
      normalizedPrice <= 0
    ) {
      return res.status(400).json({
        message:
          'A purchasable event must have a price greater than zero.',
      });
    }

    const normalizedMaxTicketQuantity =
      normalizeNonNegativeInteger(
        maxTicketQuantity,
        0
      );

    const result =
      await sequelize.transaction(
        async (transaction) => {
          const newEvent =
            await Event.create(
              {
                name,
                description: description ?? '',
                frequency,
                days,
                startDate: parsedStartDate,
                endDate: parsedEndDate,
                startTime,
                endTime,
                isPurchase:
                  normalizedIsPurchase,
                price: normalizedPrice,
                maxTicketQuantity:
                  normalizedMaxTicketQuantity,
              },
              {
                transaction,
              }
            );

          const occurrences =
            await synchronizeEventOccurrences(
              newEvent,
              transaction
            );

          return {
            event: newEvent,
            occurrences,
          };
        }
      );

    return res.status(201).json({
      message: 'Event created successfully.',
      event: {
        ...result.event.toJSON(),
        occurrences: result.occurrences,
      },
    });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      'Failed to create event.'
    );
  }
};

const updateEvent = async (req, res) => {
  const { id } = req.params;

  try {
    const result =
      await sequelize.transaction(
        async (transaction) => {
          const event = await Event.findByPk(
            id,
            {
              transaction,
              lock: transaction.LOCK.UPDATE,
            }
          );

          if (!event) {
            throw createHttpError(
              'Event not found.',
              404
            );
          }

          const updatableFields = [
            'name',
            'description',
            'frequency',
            'days',
            'startTime',
            'endTime',
          ];

          for (const field of updatableFields) {
            if (hasProperty(req.body, field)) {
              event[field] = req.body[field];
            }
          }

          if (
            hasProperty(req.body, 'startDate')
          ) {
            const parsedStartDate = parseDate(
              req.body.startDate
            );

            if (!parsedStartDate) {
              throw createHttpError(
                'The start date is invalid.'
              );
            }

            event.startDate = parsedStartDate;
          }

          if (
            hasProperty(req.body, 'endDate')
          ) {
            const parsedEndDate = parseDate(
              req.body.endDate
            );

            if (!parsedEndDate) {
              throw createHttpError(
                'The end date is invalid.'
              );
            }

            event.endDate = parsedEndDate;
          }

          const finalStartDate = parseDate(
            event.startDate
          );

          const finalEndDate = parseDate(
            event.endDate
          );

          if (
            !finalStartDate ||
            !finalEndDate
          ) {
            throw createHttpError(
              'The event contains an invalid date.'
            );
          }

          if (finalEndDate < finalStartDate) {
            throw createHttpError(
              'The end date cannot be before the start date.'
            );
          }

          let finalIsPurchase =
            Boolean(event.isPurchase);

          if (
            hasProperty(
              req.body,
              'isPurchase'
            )
          ) {
            finalIsPurchase =
              normalizeBoolean(
                req.body.isPurchase,
                false
              );
          }

          if (!finalIsPurchase) {
            event.isPurchase = false;
            event.price = 0;
          } else {
            let finalPrice = Number(
              event.price
            );

            if (
              hasProperty(req.body, 'price')
            ) {
              finalPrice = normalizePrice(
                req.body.price
              );
            }

            if (
              !Number.isFinite(finalPrice) ||
              finalPrice <= 0
            ) {
              throw createHttpError(
                'A purchasable event must have a price greater than zero.'
              );
            }

            event.isPurchase = true;
            event.price = finalPrice;
          }

          if (
            hasProperty(
              req.body,
              'maxTicketQuantity'
            )
          ) {
            event.maxTicketQuantity =
              normalizeNonNegativeInteger(
                req.body.maxTicketQuantity,
                0
              );
          }

          await event.save({
            transaction,
          });

          const occurrences =
            await synchronizeEventOccurrences(
              event,
              transaction
            );

          return {
            event,
            occurrences,
          };
        }
      );

    return res.status(200).json({
      message:
        'Event successfully updated!',
      event: {
        ...result.event.toJSON(),
        occurrences: result.occurrences,
      },
    });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      'Error updating event.'
    );
  }
};

const deleteEvent = async (req, res) => {
  const { id } = req.params;

  try {
    await sequelize.transaction(
      async (transaction) => {
        const event = await Event.findByPk(
          id,
          {
            transaction,
            lock: transaction.LOCK.UPDATE,
          }
        );

        if (!event) {
          throw createHttpError(
            'Event not found.',
            404
          );
        }

        const protectedOccurrence =
          await EventOccurrence.findOne({
            where: {
              eventId: event.id,
              [Op.or]: [
                {
                  soldCount: {
                    [Op.gt]: 0,
                  },
                },
                {
                  reservedCount: {
                    [Op.gt]: 0,
                  },
                },
              ],
            },
            transaction,
            lock: transaction.LOCK.UPDATE,
          });

        if (protectedOccurrence) {
          throw createHttpError(
            'This event cannot be deleted while it has sold or reserved tickets.'
          );
        }

        await EventOccurrence.destroy({
          where: {
            eventId: event.id,
          },
          transaction,
        });

        await event.destroy({
          transaction,
        });
      }
    );

    return res.status(200).json({
      message: 'Event deleted successfully.',
    });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      'Error deleting event.'
    );
  }
};

module.exports = {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
};

