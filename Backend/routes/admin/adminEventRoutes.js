const express = require('express');

const router = express.Router();
const adminEventController = require('../../controllers/admin/adminEventController');
const adminAuthMiddleware = require('../../middleware/adminAuthMiddleware');
const { refundAllEventReservations, getEventRefundPreview} = require('../../controllers/admin/eventRefundController');

// general crud routes
router.get('/events',  adminAuthMiddleware(), adminEventController.getAllEvents);
router.get('/events/:id',  adminAuthMiddleware(), adminEventController.getEventById);
router.post('/events', adminAuthMiddleware(), adminEventController.createEvent);
router.put('/events/:id', adminAuthMiddleware(), adminEventController.updateEvent);
router.delete('/events/:id', adminAuthMiddleware(), adminEventController.deleteEvent);

// Refund routes
router.get('/events/:eventId/get-refund-preview', adminAuthMiddleware(), getEventRefundPreview);
router.post('/events/:eventId/refund-all-event-tickets',adminAuthMiddleware(),refundAllEventReservations);

module.exports = router;
