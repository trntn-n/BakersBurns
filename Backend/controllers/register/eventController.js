const Event = require('../../models/events');
const moment = require('moment');
const { Op } = require('sequelize');

const getAllUserEvents = async (req, res) => {
    try {
        const events = await Event.findAll();
        res.status(200).json(events);

    } catch (error) {
        console.error('Error fetching user events:', error);
        res.status(500).json({ message: 'Error fetching events'});
    }
}

const getUpcomingEvent = async (req, res) => {
    try {
      const currentDate = moment().format('YYYY-MM-DD');
      const currentTime = moment().format('HH:mm:ss');
  
      console.log('Upcoming event endpoint called:', {
        currentDate,
        currentTime,
      });
  
      const upcomingEvent = await Event.findOne({
        where: {
          [Op.or]: [
            {
              startDate: {
                [Op.lte]: currentDate,
              },
              endDate: {
                [Op.gte]: currentDate,
              },
            },
            {
              startDate: {
                [Op.gt]: currentDate,
              },
            },
          ],
        },
        order: [
          ['startDate', 'ASC'],
          ['startTime', 'ASC'],
        ],
      });
  
      console.log(
        'Upcoming event query result:',
        upcomingEvent
          ? upcomingEvent.get({ plain: true })
          : null
      );
  
      if (!upcomingEvent) {
        console.log('No upcoming event was found.');
  
        return res.status(404).json({
          message: 'No upcoming events found',
        });
      }
  
      return res.status(200).json(upcomingEvent);
    } catch (error) {
      console.error(
        'Error fetching upcoming event:',
        error
      );
  
      return res.status(500).json({
        message: 'Error fetching upcoming event',
      });
    }
  };

const getAllEvents = async (req, res) => {
    try {
      const events = await Event.findAll({
        order: [
          ['startDate', 'ASC'],
          ['startTime', 'ASC'],
        ],
      });
  
      const formattedEvents = events.map((event) => {
        const plainEvent = event.get({
          plain: true,
        });
  
        return {
          ...plainEvent,
  
          startDate: plainEvent.startDate || null,
          endDate:
            plainEvent.endDate ||
            plainEvent.startDate ||
            null,
  
          days: Array.isArray(plainEvent.days)
            ? plainEvent.days.join(',')
            : plainEvent.days || '',
  
          isPurchase:
            plainEvent.isPurchase === true ||
            plainEvent.isPurchase === 1 ||
            plainEvent.isPurchase === '1' ||
            String(plainEvent.isPurchase).toLowerCase() ===
              'true',
  
          price:
            Number.isFinite(Number(plainEvent.price))
              ? Number(plainEvent.price)
              : 0,
        };
      });
  
      return res.status(200).json(formattedEvents);
    } catch (error) {
      console.error(
        'Error fetching all events:',
        error
      );
  
      return res.status(500).json({
        message: 'Error fetching events',
      });
    }
  };


module.exports = {
     getAllUserEvents,
     getUpcomingEvent,
     getAllEvents
}