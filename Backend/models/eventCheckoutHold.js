'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EventCheckoutHold = sequelize.define(
  'EventCheckoutHold',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },

    holdToken: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      defaultValue: DataTypes.UUIDV4,
      field: 'hold_token',
    },

    eventId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'event_id',
    },

    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: 'user_id',
    },

    stripeSessionId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true,
      field: 'stripe_session_id',
    },

    connectedAccountId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'connected_account_id',
    },

    status: {
      type: DataTypes.ENUM(
        'reserving',
        'open',
        'completed',
        'released',
        'failed'
      ),
      allowNull: false,
      defaultValue: 'reserving',
    },

    selections: {
      type: DataTypes.JSON,
      allowNull: false,
      comment:
        'Snapshot: [{ occurrenceId, occurrenceDate, quantity, unitAmount }]',
    },

    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at',
    },
  },
  {
    tableName: 'EventCheckoutHolds',
    indexes: [
      {
        fields: ['status', 'expires_at'],
        name: 'event_checkout_holds_status_expiry',
      },
    ],
  }
);

module.exports = EventCheckoutHold;
