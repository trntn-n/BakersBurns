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

const EventRegistration = sequelize.define(
  'EventRegistration',
  {
    eventId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Events',
        key: 'id',
      },
    },

    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'id',
      },
    },

    eventNameSnapshot: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Event name snapshot is required.',
        },
      },
      set(value) {
        this.setDataValue(
          'eventNameSnapshot',
          sanitizeString(value)
        );
      },
    },

    /*
     * This is critical for recurring events.
     * Capacity is checked by eventId + occurrenceDate.
     */
    occurrenceDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      validate: {
        isDate: {
          msg: 'Occurrence date must be a valid date.',
        },
      },
    },

    customerEmail: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Customer email is required.',
        },
        isEmail: {
          msg: 'Customer email must be valid.',
        },
      },
      set(value) {
        this.setDataValue(
          'customerEmail',
          sanitizeString(value).toLowerCase()
        );
      },
    },

    customerName: {
      type: DataTypes.STRING,
      allowNull: true,
      set(value) {
        this.setDataValue(
          'customerName',
          sanitizeString(value, null)
        );
      },
    },

    ticketQuantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: {
        min: {
          args: [1],
          msg: 'Ticket quantity must be at least 1.',
        },
      },
      set(value) {
        this.setDataValue(
          'ticketQuantity',
          normalizeInteger(value, 1)
        );
      },
    },

    currency: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'usd',
      set(value) {
        this.setDataValue(
          'currency',
          sanitizeString(value || 'usd').toLowerCase()
        );
      },
    },

    unitAmountCents: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: {
          args: [0],
          msg: 'Unit amount cannot be negative.',
        },
      },
      set(value) {
        this.setDataValue(
          'unitAmountCents',
          normalizeInteger(value, 0)
        );
      },
    },

    totalAmountCents: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: {
          args: [0],
          msg: 'Total amount cannot be negative.',
        },
      },
      set(value) {
        this.setDataValue(
          'totalAmountCents',
          normalizeInteger(value, 0)
        );
      },
    },

    stripeCheckoutSessionId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: {
          msg: 'Stripe checkout session ID is required.',
        },
      },
      set(value) {
        this.setDataValue(
          'stripeCheckoutSessionId',
          sanitizeString(value)
        );
      },
    },

    stripePaymentIntentId: {
      type: DataTypes.STRING,
      allowNull: true,
      set(value) {
        this.setDataValue(
          'stripePaymentIntentId',
          sanitizeString(value, null)
        );
      },
    },

    stripeCustomerId: {
      type: DataTypes.STRING,
      allowNull: true,
      set(value) {
        this.setDataValue(
          'stripeCustomerId',
          sanitizeString(value, null)
        );
      },
    },

    stripePaymentStatus: {
      type: DataTypes.STRING,
      allowNull: true,
      set(value) {
        this.setDataValue(
          'stripePaymentStatus',
          sanitizeString(value, null)
        );
      },
    },

    /*
     * This is your internal registration status.
     * The row should normally be created only after Stripe confirms payment.
     */
    status: {
      type: DataTypes.ENUM(
        'paid',
        'refunded',
        'partially_refunded',
        'canceled'
      ),
      allowNull: false,
      defaultValue: 'paid',
      set(value) {
        const normalizedStatus =
          sanitizeString(value || 'paid')
            .toLowerCase();

        const allowedStatuses = [
          'paid',
          'refunded',
          'partially_refunded',
          'canceled',
        ];

        this.setDataValue(
          'status',
          allowedStatuses.includes(normalizedStatus)
            ? normalizedStatus
            : 'paid'
        );
      },
    },

    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
    },

    stripeSessionSnapshot: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    hooks: {
      beforeValidate: (registration) => {
        const ticketQuantity = normalizeInteger(
          registration.ticketQuantity,
          1
        );

        const unitAmountCents = normalizeInteger(
          registration.unitAmountCents,
          0
        );

        const totalAmountCents = normalizeInteger(
          registration.totalAmountCents,
          0
        );

        if (ticketQuantity < 1) {
          throw new Error(
            'Ticket quantity must be at least 1.'
          );
        }

        if (unitAmountCents < 0) {
          throw new Error(
            'Unit amount cannot be negative.'
          );
        }

        if (totalAmountCents < 0) {
          throw new Error(
            'Total amount cannot be negative.'
          );
        }

        registration.ticketQuantity = ticketQuantity;
        registration.unitAmountCents = unitAmountCents;
        registration.totalAmountCents = totalAmountCents;

        if (!registration.currency) {
          registration.currency = 'usd';
        }
      },
    },

    indexes: [
      {
        unique: true,
        fields: ['stripeCheckoutSessionId'],
      },
      {
        fields: [
          'eventId',
          'occurrenceDate',
          'status',
        ],
      },
      {
        fields: ['customerEmail'],
      },
      {
        fields: ['stripePaymentIntentId'],
      },
    ],

    timestamps: true,
    tableName: 'EventRegistrations',
  }
);

module.exports = EventRegistration;