const express = require('express');
const router = express.Router();
const { getAllUserEvents, getUpcomingEvent, getAllEvents } = require('../../controllers/register/eventController');
const {createEventCheckoutSession, getEventCheckoutSuccess} = require('../../controllers/register/eventCheckout');


router.get('/get-events',  getAllUserEvents);
router.get('/upcoming', getUpcomingEvent);
router.get('/all', getAllEvents);
router.post('/checkout-events', createEventCheckoutSession);
router.get(
    '/checkout-success',
    getEventCheckoutSuccess
  );

module.exports = router;