/* eventOccurrences.js */
'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EventOccurrence = sequelize.define(
  'EventOccurrence',
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

    occurrenceDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'occurrence_date',
    },

    capacity: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },

    reservedCount: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      field: 'reserved_count',
      validate: {
        min: 0,
      },
    },

    soldCount: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      field: 'sold_count',
      validate: {
        min: 0,
      },
    },

    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
  },
  {
    tableName: 'EventOccurrences',
    indexes: [
      {
        unique: true,
        fields: ['event_id', 'occurrence_date'],
        name: 'event_occurrences_event_date_unique',
      },
    ],
  }
);

module.exports = EventOccurrence;
