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
        this.setDataValue('name', sanitizeString(value));
      },
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      set(value) {
        this.setDataValue('description', sanitizeString(value));
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
        this.setDataValue('frequency', sanitizeString(value));
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

          this.setDataValue('days', sanitizedDays.join(','));
          return;
        }

        if (typeof value === 'string') {
          const sanitizedDays = value
            .split(',')
            .map((day) => sanitizeString(day))
            .filter(Boolean);

          this.setDataValue('days', sanitizedDays.join(','));
          return;
        }

        throw new Error(
          'Days must be an array or comma-separated string.'
        );
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
  },
  {
    hooks: {
      beforeValidate: (event) => {
        if (!event.isPurchase) {
          event.price = 0;
          return;
        }

        const parsedPrice = Number(event.price);

        if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
          throw new Error(
            'A purchasable event must have a price greater than zero.'
          );
        }

        event.price = Math.round(parsedPrice * 100) / 100;
      },
    },

    timestamps: true,
    tableName: 'Events',
  }
);

module.exports = Event;