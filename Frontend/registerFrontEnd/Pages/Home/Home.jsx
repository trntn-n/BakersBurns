import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import moment from 'moment';

import StoreGrid from '../../Pages/Store/StoreGrid';
import SocialLinks from '../../Components/navbar/socialLinks';

import './Home.css';
import { registerApi } from '../../config/axios';

import Logo from '../../assets/logo_light.webp';
import CarnivaleeFont from '../../assets/CarnivaleeFreakshow-DLrm.ttf';

const Home = () => {
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [upcomingEvent, setUpcomingEvent] = useState(null);
  const [fontLoaded, setFontLoaded] = useState(false);

  useEffect(() => {
    const loadFont = async () => {
      try {
        const font = new FontFace(
          'Carnivalee Freakshow',
          `url(${CarnivaleeFont})`
        );

        await font.load();
        document.fonts.add(font);
        setFontLoaded(true);
      } catch (error) {
        console.error('Unable to load display font:', error);
      }
    };

    loadFont();
  }, []);

  useEffect(() => {
    const loadHomeData = async () => {
      const [products, event] = await Promise.all([
        fetchFeaturedProducts(),
        fetchUpcomingEvent(),
      ]);

      setFeaturedProducts(products);
      setUpcomingEvent(event);
    };

    loadHomeData();
  }, []);

  const fetchFeaturedProducts = async () => {
    try {
      const response = await registerApi.get(
        '/register-store/get-featured-products'
      );

      return Array.isArray(response.data)
        ? response.data
        : [];
    } catch (error) {
      console.error(
        'Error fetching featured products:',
        error.response?.data || error
      );

      return [];
    }
  };

  const fetchUpcomingEvent = async () => {
    try {
      const response = await registerApi.get(
        '/register-events/upcoming'
      );

      const event = response.data;

      if (
        !event ||
        typeof event !== 'object' ||
        Array.isArray(event) ||
        !event.id
      ) {
        return null;
      }

      return event;
    } catch (error) {
      /*
       * A 404 from this endpoint means there is simply no upcoming event.
       * That is expected and should render no section.
       */
      if (error.response?.status !== 404) {
        console.error(
          'Error fetching upcoming event:',
          error.response?.data || error
        );
      }

      return null;
    }
  };

  const formatEventTime = (time) => {
    if (!time) {
      return '';
    }

    const parsedTime = moment(
      time,
      ['HH:mm:ss', 'HH:mm'],
      true
    );

    return parsedTime.isValid()
      ? parsedTime.format('h:mm A')
      : time;
  };

  const normalizeBoolean = (value) => {
    if (
      value === true ||
      value === 1 ||
      value === '1'
    ) {
      return true;
    }

    if (typeof value === 'string') {
      return value.trim().toLowerCase() === 'true';
    }

    return false;
  };

  const fadeIn = {
    hidden: {
      opacity: 0,
      y: 20,
    },

    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
      },
    },
  };

  const titleStyle = {
    fontFamily: fontLoaded
      ? 'Carnivalee Freakshow'
      : 'Arial, sans-serif',
  };

  return (
    <div className="home-container">
      <motion.section
        className="hero-section"
        initial="hidden"
        animate="visible"
        variants={fadeIn}
      >
        <div className="hero-content">
          <Link to="/store">
          <img
            src={Logo}
            alt="BakersBurns Logo"
            className="logo"
            style={{ height: '30vh' }}
          />
          </Link>

          <p className="hero-description">
            Handcrafted pyrography and wood-burned art —
            every product is a one-of-a-kind creation.
          </p>

          <Link
            to="/store"
            className="hero-btn"
          >
            Shop Unique Art
          </Link>
        </div>
      </motion.section>

      <motion.section
        className="home-section"
        initial="hidden"
        whileInView="visible"
        viewport={{
          once: true,
          amount: 0.2,
        }}
        variants={fadeIn}
      >
        <StoreGrid products={featuredProducts} />
      </motion.section>

      {upcomingEvent && (
        <motion.section
          className="upcoming-event-section"
          initial="hidden"
          whileInView="visible"
          viewport={{
            once: true,
            amount: 0.35,
          }}
          variants={fadeIn}
        >
          <span className="upcoming-event-label">
            Next Event
          </span>

          <motion.h2
            className="upcoming-event-title"
            style={titleStyle}
          >
            Upcoming Event
          </motion.h2>

          <h3 className="upcoming-event-name">
            {upcomingEvent.name}
          </h3>

          <p className="upcoming-event-date">
            {moment(
              upcomingEvent.startDate
            ).format('MMMM Do, YYYY')}

            {upcomingEvent.startTime &&
              ` at ${formatEventTime(
                upcomingEvent.startTime
              )}`}

            {upcomingEvent.endTime &&
              ` – ${formatEventTime(
                upcomingEvent.endTime
              )}`}
          </p>

          <p className="upcoming-event-description">
            {upcomingEvent.description}
          </p>

          {normalizeBoolean(
            upcomingEvent.isPurchase
          ) && (
            <p className="upcoming-event-price">
              Tickets: $
              {Number(
                upcomingEvent.price || 0
              ).toFixed(2)}
            </p>
          )}

          <Link
            to="/events"
            className="upcoming-event-btn"
          >
            {normalizeBoolean(
              upcomingEvent.isPurchase
            )
              ? 'View Event & Buy Tickets'
              : 'View Event'}
          </Link>
        </motion.section>
      )}

      <motion.section
        className="home-section"
        initial="hidden"
        whileInView="visible"
        viewport={{
          once: true,
          amount: 0.2,
        }}
        variants={fadeIn}
      >
        <h2 className="home-title">
          Get In Touch
        </h2>

        <p className="contact-description">
          For commissions, inquiries, or collaborations,
          feel free to contact me. Let&apos;s create
          something beautiful together!
        </p>

        <SocialLinks />
      </motion.section>

      <motion.section
        className="home-section"
        initial="hidden"
        whileInView="visible"
        viewport={{
          once: true,
          amount: 0.2,
        }}
        variants={fadeIn}
      >
        <div className="about-content">
          <motion.h1
            className="about-title"
            initial={{
              scale: 0.8,
              opacity: 0,
            }}
            animate={{
              scale: 1,
              opacity: 1,
            }}
            transition={{
              duration: 1,
            }}
          >
            About the Artist
          </motion.h1>

          <p>
            Kalea is a passionate artist specializing in
            burn designs on wood, felt, suede, leather,
            and hats. Each piece is crafted with precision,
            bringing intricate and meaningful designs to
            life. Whether it&apos;s custom artwork for
            personal collections or unique branding for
            businesses, Kalea&apos;s work embodies
            craftsmanship and creativity.
          </p>

          <Link
            to="/about"
            className="about-btn"
          >
            Learn More
          </Link>
        </div>
      </motion.section>
    </div>
  );
};

export default Home;