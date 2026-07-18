'use strict';

const {
    DataTypes,
} = require('sequelize');

const sequelize = require('../config/database');
const EventRefundRequest = sequelize.define(
        'EventRefundRequest',
        {
            id: {
                type: DataTypes.INTEGER,
                autoIncrement: true,
                primaryKey: true,
            },
            eventId:{ 
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            stripeSessionId: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            stripePaymentIntentId: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            connectedAccountId: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            purchaserEmail: {
                type: DataTypes.STRING,
                allowNull: false, 
                set(value) {
                    this.setDataValue(
                        'purchaserEmail',
                        String(value|| ''
                            .trim()
                            .toLowerCase()
                        )
                    )
                }
            },
            reason: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            details: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            amountRequested: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
                comment:
                    'Requested refund amount in the smallest currency (cents)'
            },
            currency: {
                type: DataTypes.STRING(10),
                allowNull: false,
                defaultValue: 'usd',
            },
            status: {
                type: DataTypes.ENUM(
                    'requested',
                    'approved',
                    'denied',
                    'processing',
                    'refunded',
                    'cancelled'
                ),
                allowNull: false,
                defaultValue: 'requested',
            },
            adminNotes: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            requesetedAt: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
            },
            reviewedAt: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            processedAt: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            
        },
        {
            tableName: 'EventRefundRequests',
            timestamps: true,
            indexes: [
                {
                    name: 'event_refund_session_status_idx',
                    fields: ['stripeSessionId', 'status'],
                },
                {
                    name: 'event_refund_email_idx',
                    fields: ['purchaserEmail',],
                },
                {
                    name: 'event_refund_event_idx',
                    fields: ['eventId',],
                },
            ]
        }
);
module.exports = 
    EventRefundRequest;