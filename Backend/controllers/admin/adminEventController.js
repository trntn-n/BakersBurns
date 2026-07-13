'use strict';

const { ValidationError } = require('sequelize');
const Event = require('../../models/events');

const hasProperty = (object, property) =>
  Object.prototype.hasOwnProperty.call(object, property);

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

    if (
      ['true', '1', 'yes', 'on'].includes(normalized)
    ) {
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

const parseDate = (value) => {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
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
        (validationError) => validationError.message
      ),
    });
  }

  return res.status(500).json({
    message: defaultMessage,
    error: error.message,
  });
};

const getAllEvents = async (req, res) => {
  try {
    const events = await Event.findAll({
      order: [['startDate', 'ASC']],
    });

    return res.status(200).json(events);
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

    return res.status(200).json(event);
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
    } = req.body;

    const parsedStartDate = parseDate(startDate);
    const parsedEndDate = parseDate(endDate);

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

    const normalizedIsPurchase = normalizeBoolean(
      isPurchase,
      false
    );

    const normalizedPrice = normalizedIsPurchase
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

    const newEvent = await Event.create({
      name,
      description: description ?? '',
      frequency,
      days,
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      startTime,
      endTime,
      isPurchase: normalizedIsPurchase,
      price: normalizedPrice,
    });

    return res.status(201).json({
      message: 'Event created successfully.',
      event: newEvent,
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
    const event = await Event.findByPk(id);

    if (!event) {
      return res.status(404).json({
        message: 'Event not found.',
      });
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

    if (hasProperty(req.body, 'startDate')) {
      const parsedStartDate = parseDate(
        req.body.startDate
      );

      if (!parsedStartDate) {
        return res.status(400).json({
          message: 'The start date is invalid.',
        });
      }

      event.startDate = parsedStartDate;
    }

    if (hasProperty(req.body, 'endDate')) {
      const parsedEndDate = parseDate(
        req.body.endDate
      );

      if (!parsedEndDate) {
        return res.status(400).json({
          message: 'The end date is invalid.',
        });
      }

      event.endDate = parsedEndDate;
    }

    const finalStartDate = new Date(event.startDate);
    const finalEndDate = new Date(event.endDate);

    if (finalEndDate < finalStartDate) {
      return res.status(400).json({
        message:
          'The end date cannot be before the start date.',
      });
    }

    let finalIsPurchase = Boolean(event.isPurchase);

    if (hasProperty(req.body, 'isPurchase')) {
      finalIsPurchase = normalizeBoolean(
        req.body.isPurchase,
        false
      );
    }

    if (!finalIsPurchase) {
      event.isPurchase = false;
      event.price = 0;
    } else {
      let finalPrice = Number(event.price);

      if (hasProperty(req.body, 'price')) {
        finalPrice = normalizePrice(req.body.price);
      }

      if (
        !Number.isFinite(finalPrice) ||
        finalPrice <= 0
      ) {
        return res.status(400).json({
          message:
            'A purchasable event must have a price greater than zero.',
        });
      }

      event.isPurchase = true;
      event.price = finalPrice;
    }

    await event.save();

    return res.status(200).json({
      message: 'Event successfully updated!',
      event,
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
    const event = await Event.findByPk(id);

    if (!event) {
      return res.status(404).json({
        message: 'Event not found.',
      });
    }

    await event.destroy();

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