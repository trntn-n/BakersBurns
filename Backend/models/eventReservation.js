'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EventReservation = sequelize.define(
  'EventReservation',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    eventId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'event_id',
    },

    occurrenceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'occurrence_id',
    },

    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'user_id',
    },

    purchaserEmail: {
      type: DataTypes.STRING(320),
      allowNull: false,
      field: 'purchaser_email',
      validate: {
        isEmail: true,
      },
    },

    quantity: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      validate: {
        min: 1,
      },
    },

    unitAmount: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'unit_amount',
      comment: 'Price in cents at time of purchase.',
    },

    stripeSessionId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'stripe_session_id',
    },

    stripePaymentIntentId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'stripe_payment_intent_id',
    },

    status: {
      type: DataTypes.ENUM('paid', 'refunded', 'cancelled'),
      allowNull: false,
      defaultValue: 'paid',
    },
    refundNotificationSentAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'refund_notification_sent_at',
      },
      
      refundNotificationEmailId: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'refund_notification_email_id',
      },
      
      refundNotificationError: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'refund_notification_error',
      },
  },
  {
    tableName: 'EventReservations',
    indexes: [
      {
        unique: true,
        fields: ['stripe_session_id', 'occurrence_id'],
        name: 'event_reservation_session_occurrence_unique',
      },
      {
        fields: ['event_id', 'occurrence_id'],
        name: 'event_reservation_event_occurrence',
      },
    ],
  }
);

module.exports = EventReservation;
