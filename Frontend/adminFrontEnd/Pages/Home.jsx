import React from "react";
import { Link } from "react-router-dom";
import {
  motion,
  useReducedMotion,
} from "framer-motion";

import NotificationBadge from "../Components/notification/notificationBadge";
import ProductManagerGif from "../assets/ProductManager.gif";
import OrdersGif from "../assets/orders.gif";
import GalleryGif from "../assets/gallery.gif";
import MessageGif from "../assets/messages.gif";
import SocialsGif from "../assets/socials.gif";
import EmailGif from "../assets/email.gif";
import InvoicesGif from "../assets/invoice.gif";

import "../Pagecss/Home.css";

const DASHBOARD_APPS = [
  {
    title: "Orders",
    eyebrow: "Fulfillment",
    description:
      "Review purchases, update statuses, and manage shipment tracking.",
    to: "/orders",
    image: OrdersGif,
    accent: "copper",
    badge: true,
  },
  {
    title: "Product Manager",
    eyebrow: "Store",
    description:
      "Manage products, pricing, availability, media, and inventory.",
    to: "/product-manager",
    image: ProductManagerGif,
    accent: "sand",
  },
  {
    title: "Events",
    eyebrow: "Scheduling",
    description:
      "Create events, manage ticket availability, and review attendance.",
    to: "/event-manager",
    image: MessageGif,
    accent: "amber",
  },
  {
    title: "Gallery",
    eyebrow: "Media",
    description:
      "Upload, edit, organize, and publish gallery photography.",
    to: "/gallery",
    image: GalleryGif,
    accent: "rose",
  },
  {
    title: "Messaging",
    eyebrow: "Conversations",
    description:
      "Read customer conversations and reply through in-app messaging.",
    to: "/messaging",
    image: MessageGif,
    accent: "clay",
  },
  {
    title: "Email",
    eyebrow: "Campaigns",
    description:
      "Send updates and campaigns to customers who have opted in.",
    to: "/email",
    image: EmailGif,
    accent: "gold",
  },
  {
    title: "Socials",
    eyebrow: "Publishing",
    description:
      "Prepare and manage content for your connected social channels.",
    to: "/social-manager",
    image: SocialsGif,
    accent: "terracotta",
  },
  {
    title: "Invoices",
    eyebrow: "Accounting",
    description:
      "Create, organize, and review invoices and payment records.",
    to: "/invoices",
    image: InvoicesGif,
    accent: "bronze",
  },
];

const DashboardCard = ({ app, reduceMotion }) => (
  <motion.li
    className={`bb-admin-home-card bb-admin-home-card--${app.accent}`}
    variants={{
      hidden: {
        opacity: 0,
        y: reduceMotion ? 0 : 18,
      },
      visible: {
        opacity: 1,
        y: 0,
      },
    }}
  >
    <Link
      className="bb-admin-home-card-link"
      to={app.to}
      aria-label={`Open ${app.title}`}
    >
      <div className="bb-admin-home-card-media">
        <img
          src={app.image}
          alt=""
          loading="lazy"
        />
        <div
          className="bb-admin-home-card-shade"
          aria-hidden="true"
        />

        {app.badge && (
          <div
            className="bb-admin-home-card-badge"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <NotificationBadge
              apiEndpoint="/admin-notifications/orders"
              customFilter={(data) =>
                (Array.isArray(data) ? data : []).filter(
                  (order) =>
                    String(
                      order?.status || ""
                    ).toLowerCase() ===
                    "processing"
                )
              }
              color="red"
              label="Processing Orders"
            />
          </div>
        )}

        <span className="bb-admin-home-card-arrow">
          <span aria-hidden="true">↗</span>
        </span>
      </div>

      <div className="bb-admin-home-card-copy">
        <span className="bb-admin-home-card-eyebrow">
          {app.eyebrow}
        </span>
        <h2>{app.title}</h2>
        <p>{app.description}</p>
      </div>
    </Link>
  </motion.li>
);

const Home = () => {
  const reduceMotion = useReducedMotion();

  return (
    <main className="bb-admin-home">
      <div
        className="bb-admin-home-background"
        aria-hidden="true"
      >
        <span className="bb-admin-home-glow bb-admin-home-glow--one" />
        <span className="bb-admin-home-glow bb-admin-home-glow--two" />
        <span className="bb-admin-home-grid-pattern" />
      </div>

      <div className="bb-admin-home-shell">
        <motion.header
          className="bb-admin-home-hero"
          initial={
            reduceMotion
              ? false
              : { opacity: 0, y: 14 }
          }
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.5,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <div>
            <span className="bb-admin-home-eyebrow">
              BakersBurns administration
            </span>
            <h1>Welcome back.</h1>
            <p>
              Everything you need to manage the store,
              customer experience, and day-to-day operations
              is collected here.
            </p>
          </div>

          <div className="bb-admin-home-hero-mark">
            <span>BB</span>
            <small>Control center</small>
          </div>
        </motion.header>

        <motion.ul
          className="bb-admin-home-apps"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: {
              transition: {
                staggerChildren: reduceMotion
                  ? 0
                  : 0.055,
              },
            },
          }}
        >
          {DASHBOARD_APPS.map((app) => (
            <DashboardCard
              key={app.to}
              app={app}
              reduceMotion={reduceMotion}
            />
          ))}
        </motion.ul>

        <footer className="bb-admin-home-footer">
          <span>BakersBurns</span>
          <p>Admin operations dashboard</p>
        </footer>
      </div>
    </main>
  );
};

export default Home;
