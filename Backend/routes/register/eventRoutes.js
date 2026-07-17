// routes/register/eventRoutes.js
'use strict';

const express = require('express');

const router = express.Router();

/*
 * Event controllers
 */
const {
  getAllUserEvents,
  getUpcomingEvent,
  getAllEvents,
} = require(
  '../../controllers/register/eventController'
);

/*
 * Event checkout controllers
 */
const {
  createEventCheckoutSession,
  getEventCheckoutSuccess,
} = require(
  '../../controllers/register/eventCheckout'
);

/*
 * Event notification controllers
 */
const {
  createEventNotificationSubscriptions,
  getAllEventNotificationSubscriptions,
  getEventNotificationSubscriptionById,
  updateEventNotificationSubscription,
  markEventNotificationSent,
  deleteEventNotificationSubscription,
} = require(
  '../../controllers/register/eventNotificationController'
);

/*
 * =========================
 * Event routes
 * =========================
 */

/*
 * Get the events available to users.
 */
router.get(
  '/get-events',
  getAllUserEvents
);

/*
 * Get the nearest upcoming event.
 */
router.get(
  '/upcoming',
  getUpcomingEvent
);

/*
 * Get all events.
 */
router.get(
  '/all',
  getAllEvents
);

/*
 * =========================
 * Event checkout routes
 * =========================
 */

/*
 * Create a Stripe Checkout Session for an event.
 */
router.post(
  '/checkout-events',
  createEventCheckoutSession
);

/*
 * Return the completed checkout details used by the
 * EventCheckoutSuccess frontend page.
 */
router.get(
  '/checkout-success',
  getEventCheckoutSuccess
);

/*
 * =========================
 * Event notification routes
 * =========================
 */

/*
 * Create or update notification subscriptions.
 *
 * This is the endpoint currently called by
 * EventCheckoutSuccess.jsx.
 */
router.post(
  '/event-notification-subscriptions',
  createEventNotificationSubscriptions
);

/*
 * Get all notification subscriptions.
 *
 * Optional filters:
 *
 * ?email=user@example.com
 * ?eventId=1
 * ?eventOccurrenceId=2
 * ?pending=true
 */
router.get(
  '/event-notification-subscriptions',
  getAllEventNotificationSubscriptions
);

/*
 * Get one notification subscription by its ID.
 */
router.get(
  '/event-notification-subscriptions/:id',
  getEventNotificationSubscriptionById
);

/*
 * Update a notification subscription.
 */
router.patch(
  '/event-notification-subscriptions/:id',
  updateEventNotificationSubscription
);

/*
 * Mark one reminder frequency as successfully sent.
 *
 * Expected body:
 *
 * {
 *   frequency: "month"
 * }
 *
 * Supported values:
 * month, week, day
 */
router.patch(
  '/event-notification-subscriptions/:id/mark-sent',
  markEventNotificationSent
);

/*
 * Delete a notification subscription.
 */
router.delete(
  '/event-notification-subscriptions/:id',
  deleteEventNotificationSubscription
);

module.exports = router;

