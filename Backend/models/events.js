'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const xss = require('xss');

const sanitizeString = (value, fallback = '') => {
  if (value === null || value === undefined) {
    return fallback;
  }

  return xss(String(value).trim());
};

const normalizeBoolean = (value) => {
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

const normalizeInteger = (value, fallback = 0) => {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return fallback;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue)) {
    return fallback;
  }

  return parsedValue;
};

const Event = sequelize.define(
  'Event',
  {
    
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Event name is required.',
        },
      },
      set(value) {
        this.setDataValue(
          'name',
          sanitizeString(value)
        );
      },
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      set(value) {
        this.setDataValue(
          'description',
          sanitizeString(value)
        );
      },
    },

    frequency: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Event frequency is required.',
        },
      },
      set(value) {
        this.setDataValue(
          'frequency',
          sanitizeString(value)
        );
      },
    },

    days: {
      type: DataTypes.STRING,
      allowNull: false,

      get() {
        const value = this.getDataValue('days');

        if (!value) {
          return [];
        }

        return value
          .split(',')
          .map((day) => day.trim())
          .filter(Boolean);
      },

      set(value) {
        if (Array.isArray(value)) {
          const sanitizedDays = value
            .map((day) => sanitizeString(day))
            .filter(Boolean);

          this.setDataValue(
            'days',
            sanitizedDays.join(',')
          );

          return;
        }

        if (typeof value === 'string') {
          const sanitizedDays = value
            .split(',')
            .map((day) => sanitizeString(day))
            .filter(Boolean);

          this.setDataValue(
            'days',
            sanitizedDays.join(',')
          );

          return;
        }

        this.setDataValue('days', '');
      },
    },

    startTime: {
      type: DataTypes.TIME,
      allowNull: false,
    },

    endTime: {
      type: DataTypes.TIME,
      allowNull: false,
    },

    startDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },

    endDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },

    isPurchase: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      set(value) {
        this.setDataValue(
          'isPurchase',
          normalizeBoolean(value)
        );
      },
    },

    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      validate: {
        min: {
          args: [0],
          msg: 'Event price cannot be negative.',
        },
      },
    },

    /*
     * 0 means unlimited.
     * For recurring/multi-day events, this limit is per occurrence date.
     */
    maxTicketQuantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: {
          args: [0],
          msg: 'Max ticket quantity cannot be negative.',
        },
      },
      set(value) {
        this.setDataValue(
          'maxTicketQuantity',
          normalizeInteger(value, 0)
        );
      },
    },
  },
  {
    hooks: {
      beforeValidate: (event) => {
        event.isPurchase = normalizeBoolean(
          event.isPurchase
        );

        const parsedPrice = Number(event.price);

        const parsedMaxTicketQuantity =
          normalizeInteger(
            event.maxTicketQuantity,
            0
          );

        if (!event.isPurchase) {
          event.price = 0;
          event.maxTicketQuantity = 0;
          return;
        }

        if (
          !Number.isFinite(parsedPrice) ||
          parsedPrice <= 0
        ) {
          throw new Error(
            'A purchasable event must have a price greater than zero.'
          );
        }

        if (parsedMaxTicketQuantity < 0) {
          throw new Error(
            'Max ticket quantity cannot be negative.'
          );
        }

        event.price =
          Math.round(parsedPrice * 100) / 100;

        event.maxTicketQuantity =
          parsedMaxTicketQuantity;
      },
    },

    timestamps: true,
    tableName: 'Events',
  }
);

module.exports = Event;