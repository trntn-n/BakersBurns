import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import moment from "moment";

import StoreGrid from "../../Pages/Store/StoreGrid";
import SocialLinks from "../../Components/navbar/socialLinks";

import { registerApi } from "../../config/axios";

import Logo from "../../assets/logo_light.webp";
import CarnivaleeFont from "../../assets/CarnivaleeFreakshow-DLrm.ttf";

import "./Home.css";

const Home = () => {
  const [featuredProducts, setFeaturedProducts] =
    useState([]);
  const [upcomingEvent, setUpcomingEvent] =
    useState(null);
  const [fontLoaded, setFontLoaded] =
    useState(false);
  const [homeLoading, setHomeLoading] =
    useState(true);

  useEffect(() => {
    let componentMounted = true;

    const loadFont = async () => {
      try {
        const font = new FontFace(
          "Carnivalee Freakshow",
          `url(${CarnivaleeFont})`
        );

        await font.load();

        if (!componentMounted) {
          return;
        }

        document.fonts.add(font);
        setFontLoaded(true);
      } catch (error) {
        console.error(
          "Unable to load display font:",
          error
        );
      }
    };

    loadFont();

    return () => {
      componentMounted = false;
    };
  }, []);

  useEffect(() => {
    let componentMounted = true;

    const loadHomeData = async () => {
      setHomeLoading(true);

      try {
        const [products, event] =
          await Promise.all([
            fetchFeaturedProducts(),
            fetchUpcomingEvent(),
          ]);

        if (!componentMounted) {
          return;
        }

        setFeaturedProducts(products);
        setUpcomingEvent(event);
      } finally {
        if (componentMounted) {
          setHomeLoading(false);
        }
      }
    };

    loadHomeData();

    return () => {
      componentMounted = false;
    };
  }, []);

  const fetchFeaturedProducts = async () => {
    try {
      const response = await registerApi.get(
        "/register-store/get-featured-products"
      );

      return Array.isArray(response.data)
        ? response.data
        : [];
    } catch (error) {
      console.error(
        "Error fetching featured products:",
        error.response?.data || error
      );

      return [];
    }
  };

  const fetchUpcomingEvent = async () => {
    try {
      const response = await registerApi.get(
        "/register-events/upcoming"
      );

      const event = response.data;

      if (
        !event ||
        typeof event !== "object" ||
        Array.isArray(event) ||
        !event.id
      ) {
        return null;
      }

      return event;
    } catch (error) {
      /*
       * A 404 means there is no upcoming event.
       * That is an expected response.
       */
      if (error.response?.status !== 404) {
        console.error(
          "Error fetching upcoming event:",
          error.response?.data || error
        );
      }

      return null;
    }
  };

  const formatEventTime = (time) => {
    if (!time) {
      return "";
    }

    const parsedTime = moment(
      time,
      ["HH:mm:ss", "HH:mm"],
      true
    );

    return parsedTime.isValid()
      ? parsedTime.format("h:mm A")
      : time;
  };

  const normalizeBoolean = (value) => {
    if (
      value === true ||
      value === 1 ||
      value === "1"
    ) {
      return true;
    }

    if (typeof value === "string") {
      return (
        value.trim().toLowerCase() === "true"
      );
    }

    return false;
  };

  const eventIsPurchasable = useMemo(() => {
    if (!upcomingEvent) {
      return false;
    }

    return normalizeBoolean(
      upcomingEvent.isPurchase ??
        upcomingEvent.is_purchase
    );
  }, [upcomingEvent]);

  const eventPrice = useMemo(() => {
    if (!upcomingEvent) {
      return 0;
    }

    const rawPrice =
      upcomingEvent.price ??
      upcomingEvent.eventPrice ??
      upcomingEvent.event_price ??
      0;

    const parsedPrice = Number(rawPrice);

    return Number.isFinite(parsedPrice)
      ? parsedPrice
      : 0;
  }, [upcomingEvent]);

  const formattedEventDate = useMemo(() => {
    if (!upcomingEvent?.startDate) {
      return "";
    }

    const parsedDate = moment(
      upcomingEvent.startDate
    );

    return parsedDate.isValid()
      ? parsedDate.format("MMMM Do, YYYY")
      : upcomingEvent.startDate;
  }, [upcomingEvent]);

  const formattedEventTime = useMemo(() => {
    if (!upcomingEvent) {
      return "";
    }

    const startTime = formatEventTime(
      upcomingEvent.startTime
    );

    const endTime = formatEventTime(
      upcomingEvent.endTime
    );

    if (startTime && endTime) {
      return `${startTime} – ${endTime}`;
    }

    return startTime || endTime || "";
  }, [upcomingEvent]);

  const displayFontStyle = {
    fontFamily: fontLoaded
      ? '"Carnivalee Freakshow", serif'
      : "Georgia, serif",
  };

  const sectionMotion = {
    hidden: {
      opacity: 0,
      y: 32,
    },

    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.65,
        ease: [0.22, 1, 0.36, 1],
      },
    },
  };

  const heroMotion = {
    hidden: {
      opacity: 0,
      y: 24,
      scale: 0.985,
    },

    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.85,
        ease: [0.22, 1, 0.36, 1],
      },
    },
  };

  return (
    <main className="bb-home">
      <section className="bb-home__hero">
        <div
          className="bb-home__hero-background"
          aria-hidden="true"
        >
          <div className="bb-home__hero-glow bb-home__hero-glow--one" />
          <div className="bb-home__hero-glow bb-home__hero-glow--two" />
          <div className="bb-home__hero-grid" />
        </div>

        <motion.div
          className="bb-home__hero-content"
          initial="hidden"
          animate="visible"
          variants={heroMotion}
        >
          <div className="bb-home__hero-badge">
            <span
              className="bb-home__hero-badge-dot"
              aria-hidden="true"
            />

            Handmade pyrography and wood art
          </div>

          <Link
            to="/store"
            className="bb-home__logo-link"
            aria-label="Visit the BakersBurns store"
          >
            <img
              src={Logo}
              alt="BakersBurns"
              className="bb-home__logo"
            />
          </Link>

          <p className="bb-home__hero-description">
            Handcrafted pyrography and wood-burned
            art, created individually so every piece
            has its own character and story.
          </p>

          <div className="bb-home__hero-actions">
            <Link
              to="/store"
              className="bb-home__button bb-home__button--primary"
            >
              <span>Shop Unique Art</span>

              <span
                className="bb-home__button-arrow"
                aria-hidden="true"
              >
                →
              </span>
            </Link>

            <Link
              to="/gallery"
              className="bb-home__button bb-home__button--secondary"
            >
              Explore the Gallery
            </Link>
          </div>

          <div className="bb-home__hero-details">
            <div className="bb-home__hero-detail">
              <span
                className="bb-home__hero-detail-icon"
                aria-hidden="true"
              >
                ✓
              </span>

              <span>Handmade designs</span>
            </div>

            <div className="bb-home__hero-detail">
              <span
                className="bb-home__hero-detail-icon"
                aria-hidden="true"
              >
                ✓
              </span>

              <span>One-of-a-kind pieces</span>
            </div>

            <div className="bb-home__hero-detail">
              <span
                className="bb-home__hero-detail-icon"
                aria-hidden="true"
              >
                ✓
              </span>

              <span>Custom commissions</span>
            </div>
          </div>
        </motion.div>

        <a
          href={
            upcomingEvent
              ? "#upcoming-event"
              : "#featured-products"
          }
          className="bb-home__scroll-indicator"
          aria-label={
            upcomingEvent
              ? "Scroll to upcoming event"
              : "Scroll to featured products"
          }
        >
          <span>Explore</span>

          <span
            className="bb-home__scroll-arrow"
            aria-hidden="true"
          >
            ↓
          </span>
        </a>
      </section>

      {upcomingEvent && (
        <motion.section
          id="upcoming-event"
          className="bb-home__section bb-home__section--event"
          initial="hidden"
          whileInView="visible"
          viewport={{
            once: true,
            amount: 0.22,
          }}
          variants={sectionMotion}
        >
          <div className="bb-home__event-card">
            <div
              className="bb-home__event-decoration"
              aria-hidden="true"
            >
              <div className="bb-home__event-circle bb-home__event-circle--large" />
              <div className="bb-home__event-circle bb-home__event-circle--small" />
            </div>

            <div className="bb-home__event-date-panel">
              <span className="bb-home__event-label">
                Next Event
              </span>

              <div className="bb-home__event-calendar">
                <span className="bb-home__event-month">
                  {moment(
                    upcomingEvent.startDate
                  ).format("MMM")}
                </span>

                <strong className="bb-home__event-day">
                  {moment(
                    upcomingEvent.startDate
                  ).format("D")}
                </strong>

                <span className="bb-home__event-year">
                  {moment(
                    upcomingEvent.startDate
                  ).format("YYYY")}
                </span>
              </div>
            </div>

            <div className="bb-home__event-content">
              <span className="bb-home__eyebrow bb-home__eyebrow--light">
                Upcoming Event
              </span>

              <motion.h2
                className="bb-home__event-heading"
                style={displayFontStyle}
              >
                {upcomingEvent.name}
              </motion.h2>

              <div className="bb-home__event-metadata">
                {formattedEventDate && (
                  <div className="bb-home__event-meta-item">
                    <span
                      className="bb-home__event-meta-icon"
                      aria-hidden="true"
                    >
                      ◷
                    </span>

                    <span>
                      {formattedEventDate}
                    </span>
                  </div>
                )}

                {formattedEventTime && (
                  <div className="bb-home__event-meta-item">
                    <span
                      className="bb-home__event-meta-icon"
                      aria-hidden="true"
                    >
                      ◴
                    </span>

                    <span>
                      {formattedEventTime}
                    </span>
                  </div>
                )}

                {upcomingEvent.location && (
                  <div className="bb-home__event-meta-item">
                    <span
                      className="bb-home__event-meta-icon"
                      aria-hidden="true"
                    >
                      ◉
                    </span>

                    <span>
                      {upcomingEvent.location}
                    </span>
                  </div>
                )}
              </div>

              {upcomingEvent.description && (
                <p className="bb-home__event-description">
                  {upcomingEvent.description}
                </p>
              )}

              <div className="bb-home__event-footer">
                {eventIsPurchasable && (
                  <div className="bb-home__event-price">
                    <span className="bb-home__event-price-label">
                      Tickets
                    </span>

                    <strong>
                      ${eventPrice.toFixed(2)}
                    </strong>
                  </div>
                )}

                <Link
                  to="/events"
                  className="bb-home__button bb-home__button--light"
                >
                  <span>
                    {eventIsPurchasable
                      ? "View Event & Buy Tickets"
                      : "View Event"}
                  </span>

                  <span
                    className="bb-home__button-arrow"
                    aria-hidden="true"
                  >
                    →
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </motion.section>
      )}


      <motion.section
        id="featured-products"
        className="bb-home__section bb-home__section--products"
        initial="hidden"
        whileInView="visible"
        viewport={{
          once: true,
          amount: 0.12,
        }}
        variants={sectionMotion}
      >
        <div className="bb-home__section-header">
          <div>
            <span className="bb-home__eyebrow">
              Featured Collection
            </span>

            <h2 className="bb-home__section-title">
              Art made with intention
            </h2>

            <p className="bb-home__section-description">
              Explore selected handcrafted pieces,
              custom designs, and newly available
              creations.
            </p>
          </div>

          <Link
            to="/store"
            className="bb-home__text-link"
          >
            View the full store
            <span aria-hidden="true">→</span>
          </Link>
        </div>

        <div className="bb-home__products-content">
          {homeLoading ? (
            <div
              className="bb-home__products-loading"
              role="status"
              aria-live="polite"
            >
              <div className="bb-home__loading-spinner" />

              <span>
                Loading featured products...
              </span>
            </div>
          ) : featuredProducts.length > 0 ? (
            <StoreGrid
              products={featuredProducts}
            />
          ) : (
            <div className="bb-home__empty-state">
              <span
                className="bb-home__empty-icon"
                aria-hidden="true"
              >
                ✦
              </span>

              <h3>
                New pieces are being prepared
              </h3>

              <p>
                There are no featured products
                available right now. Visit the store
                to see the complete collection.
              </p>

              <Link
                to="/store"
                className="bb-home__button bb-home__button--secondary"
              >
                Browse the Store
              </Link>
            </div>
          )}
        </div>
      </motion.section>

      <motion.section
        className="bb-home__section bb-home__section--connection"
        initial="hidden"
        whileInView="visible"
        viewport={{
          once: true,
          amount: 0.2,
        }}
        variants={sectionMotion}
      >
        <div className="bb-home__connection-card">
          <div className="bb-home__connection-copy">
            <span className="bb-home__eyebrow">
              Commissions & Collaborations
            </span>

            <h2 className="bb-home__section-title">
              Let&apos;s create something meaningful
            </h2>

            <p className="bb-home__section-description">
              Reach out for custom artwork,
              commissions, business collaborations,
              or questions about an existing piece.
            </p>

            <Link
              to="/contact"
              className="bb-home__button bb-home__button--primary"
            >
              Start a Conversation
              <span aria-hidden="true">→</span>
            </Link>
          </div>

          <div className="bb-home__social-panel">
            <span className="bb-home__social-label">
              Follow BakersBurns
            </span>

            <p className="bb-home__social-description">
              See new artwork, upcoming events, and
              works in progress.
            </p>

            <div className="bb-home__social-links">
              <SocialLinks />
            </div>
          </div>
        </div>
      </motion.section>

      <motion.section
        className="bb-home__section bb-home__section--about"
        initial="hidden"
        whileInView="visible"
        viewport={{
          once: true,
          amount: 0.18,
        }}
        variants={sectionMotion}
      >
        <div className="bb-home__about-card">
          <div className="bb-home__about-accent">
            <span
              className="bb-home__about-symbol"
              aria-hidden="true"
            >
              ✦
            </span>

            <span>Made by hand</span>
          </div>

          <div className="bb-home__about-content">
            <span className="bb-home__eyebrow">
              Meet the Artist
            </span>

            <motion.h2
              className="bb-home__about-title"
              style={displayFontStyle}
              initial={{
                opacity: 0,
                y: 16,
              }}
              whileInView={{
                opacity: 1,
                y: 0,
              }}
              viewport={{
                once: true,
              }}
              transition={{
                duration: 0.65,
              }}
            >
              About Kalea
            </motion.h2>

            <p className="bb-home__about-description">
              Kalea is a passionate artist specializing
              in burned designs on wood, felt, suede,
              leather, and hats. Each piece is crafted
              carefully, bringing intricate and
              meaningful designs to life.
            </p>

            <p className="bb-home__about-description">
              From custom artwork for personal
              collections to distinctive branding for
              businesses, every project combines
              craftsmanship, creativity, and attention
              to detail.
            </p>

            <Link
              to="/about"
              className="bb-home__text-link bb-home__text-link--large"
            >
              Learn more about the artist
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </motion.section>
    </main>
  );
};

export default Home;