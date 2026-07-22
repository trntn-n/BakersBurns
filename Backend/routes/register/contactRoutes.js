const express = require('express');
const { sendContactMessage} = require('../../controllers/register/contactController');

const router = express.Router();

router.post('/contact-send', sendContactMessage);

module.exports = router;