const express = require('express');
const router = express.Router();
const { getAllUserEvents, getUpcomingEvent, getAllEvents } = require('../../controllers/register/eventController');
const {createEventCheckoutSession} = require('../../controllers/register/eventCheckout');


router.get('/get-events',  getAllUserEvents);
router.get('/upcoming', getUpcomingEvent);
router.get('/all', getAllEvents);
router.post('/checkout-events', createEventCheckoutSession);

module.exports = router;