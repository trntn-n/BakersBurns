// models/eventNotificationSubscription.js
'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EventNotificationSubscription = sequelize.define(
  'EventNotificationSubscription',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },

    email: {
      type: DataTypes.STRING(320),
      allowNull: false,

      set(value) {
        const normalizedEmail = String(value || '')
          .trim()
          .toLowerCase();

        this.setDataValue('email', normalizedEmail);
      },

      validate: {
        notEmpty: {
          msg: 'Email is required.',
        },

        isEmail: {
          msg: 'A valid email address is required.',
        },
      },
    },

    /*
     * The parent event.
     *
     * This is nullable so the notification record can remain
     * available even if an old event is eventually removed.
     */
    eventId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'event_id',
    },

    /*
     * The specific date/occurrence for which reminders
     * should be delivered.
     */
    eventOccurrenceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'event_occurrence_id',
    },

    /*
     * The Stripe Checkout Session that created the reservation.
     * This can help verify where the subscription originated.
     */
    stripeSessionId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'stripe_session_id',
    },

    /*
     * One-month reminder state.
     */
    acceptedOneMonthBefore: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'accepted_one_month_before',
    },

    sentOneMonthBefore: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'sent_one_month_before',
    },

    /*
     * One-week reminder state.
     */
    acceptedOneWeekBefore: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'accepted_one_week_before',
    },

    sentOneWeekBefore: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'sent_one_week_before',
    },

    /*
     * One-day reminder state.
     */
    acceptedOneDayBefore: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'accepted_one_day_before',
    },

    sentOneDayBefore: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'sent_one_day_before',
    },
  },
  {
    tableName: 'EventNotificationSubscriptions',

    timestamps: true,

    indexes: [
      /*
       * One email may only have one notification record
       * for each event occurrence.
       */
      {
        name: 'event_notification_email_occurrence_unique',
        unique: true,
        fields: [
          'email',
          'event_occurrence_id',
        ],
      },

      {
        name: 'event_notification_event_id_index',
        fields: ['event_id'],
      },

      {
        name: 'event_notification_occurrence_id_index',
        fields: ['event_occurrence_id'],
      },

      /*
       * These indexes make it easier for the future reminder
       * service to locate accepted but unsent notifications.
       */
      {
        name: 'event_notification_month_status_index',
        fields: [
          'accepted_one_month_before',
          'sent_one_month_before',
        ],
      },

      {
        name: 'event_notification_week_status_index',
        fields: [
          'accepted_one_week_before',
          'sent_one_week_before',
        ],
      },

      {
        name: 'event_notification_day_status_index',
        fields: [
          'accepted_one_day_before',
          'sent_one_day_before',
        ],
      },
    ],
  }
);

module.exports = EventNotificationSubscription;