import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Link,
  useLocation,
} from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";

import ThemeToggle from "../../registerFrontEnd/Components/themetoggle/Dark-Light";

import "../Componentcss/navbar.css";

const NAVIGATION_ITEMS = [
  {
    path: "/",
    title: "Home",
    shortTitle: "Home",
  },
  {
    path: "/product-manager",
    title: "Product Manager",
    shortTitle: "Products",
  },
  {
    path: "/gallery",
    title: "Gallery Manager",
    shortTitle: "Gallery",
  },
  {
    path: "/event-manager",
    title: "Event Manager",
    shortTitle: "Events",
  },
  {
    path: "/orders",
    title: "Orders",
    shortTitle: "Orders",
  },
  {
    path: "/messaging",
    title: "Messages",
    shortTitle: "Messages",
  },
  {
    path: "/email",
    title: "Email",
    shortTitle: "Email",
  },
  {
    path: "/social-manager",
    title: "Social Manager",
    shortTitle: "Social",
  },
  {
    path: "/discount",
    title: "Discount Manager",
    shortTitle: "Discounts",
  },
  {
    path: "/invoices",
    title: "Invoices",
    shortTitle: "Invoices",
  },
];

const AdminNavbar = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  const lastScrollYRef = useRef(0);
  const location = useLocation();

  const currentNavigationItem =
    NAVIGATION_ITEMS.find(
      ({ path }) => path === location.pathname
    ) || null;

  const currentPageTitle =
    currentNavigationItem?.title || "Admin Panel";

  const toggleMenu = () => {
    setMenuOpen((previousState) => !previousState);
  };

  const closeMenu = () => {
    setMenuOpen(false);
  };

  const isPathActive = (path) => {
    if (path === "/") {
      return location.pathname === "/";
    }

    return (
      location.pathname === path ||
      location.pathname.startsWith(`${path}/`)
    );
  };

  useEffect(() => {
    const container =
      document.querySelector(".app-container");

    if (!container) {
      return undefined;
    }

    const handleScroll = () => {
      const currentScrollY = container.scrollTop;
      const previousScrollY =
        lastScrollYRef.current;

      const isScrollingDown =
        currentScrollY > previousScrollY;

      const shouldHideNavbar =
        isScrollingDown &&
        currentScrollY > 80 &&
        !menuOpen;

      setIsVisible(!shouldHideNavbar);

      lastScrollYRef.current = currentScrollY;
    };

    container.addEventListener(
      "scroll",
      handleScroll,
      {
        passive: true,
      }
    );

    return () => {
      container.removeEventListener(
        "scroll",
        handleScroll
      );
    };
  }, [menuOpen]);

  useEffect(() => {
    closeMenu();
    setIsVisible(true);
  }, [location.pathname]);

  useEffect(() => {
    const handleEscapeKey = (event) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    document.addEventListener(
      "keydown",
      handleEscapeKey
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleEscapeKey
      );
    };
  }, []);

  useEffect(() => {
    const originalOverflow =
      document.body.style.overflow;

    if (menuOpen) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow =
        originalOverflow;
    };
  }, [menuOpen]);

  return (
    <>
      <motion.header
        className={`bb-admin-nav ${
          menuOpen
            ? "bb-admin-nav--menu-open"
            : ""
        }`}
        initial={false}
        animate={{
          y: isVisible || menuOpen ? 0 : -120,
        }}
        transition={{
          duration: 0.25,
          ease: "easeOut",
        }}
      >
        <div className="bb-admin-nav__inner">
          <div className="bb-admin-nav__brand">
            <div
              className="bb-admin-nav__brand-mark"
              aria-hidden="true"
            >
              BB
            </div>

            <div className="bb-admin-nav__brand-copy">
              <span className="bb-admin-nav__brand-label">
                BakersBurns Admin
              </span>

              <h1 className="bb-admin-nav__page-title">
                {currentPageTitle}
              </h1>
            </div>
          </div>

          <div className="bb-admin-nav__desktop-actions">
            <div className="bb-admin-nav__theme-toggle">
              <ThemeToggle />
            </div>

            <a
              href={import.meta.env.VITE_USER}
              target="_blank"
              rel="noopener noreferrer"
              className="bb-admin-nav__preview-link"
            >
              <span>User Preview</span>

              <span
                className="bb-admin-nav__external-icon"
                aria-hidden="true"
              >
                ↗
              </span>
            </a>
          </div>

          <button
            type="button"
            className={`bb-admin-nav__menu-button ${
              menuOpen
                ? "bb-admin-nav__menu-button--open"
                : ""
            }`}
            onClick={toggleMenu}
            aria-label={
              menuOpen
                ? "Close navigation menu"
                : "Open navigation menu"
            }
            aria-expanded={menuOpen}
            aria-controls="bb-admin-nav-menu"
          >
            <span className="bb-admin-nav__menu-line" />
            <span className="bb-admin-nav__menu-line" />
            <span className="bb-admin-nav__menu-line" />
          </button>
        </div>

        <AnimatePresence initial={false}>
          {menuOpen && (
            <motion.div
              id="bb-admin-nav-menu"
              className="bb-admin-nav__menu"
              initial={{
                opacity: 0,
                height: 0,
              }}
              animate={{
                opacity: 1,
                height: "auto",
              }}
              exit={{
                opacity: 0,
                height: 0,
              }}
              transition={{
                duration: 0.22,
                ease: "easeOut",
              }}
            >
              <div className="bb-admin-nav__menu-content">
                <div className="bb-admin-nav__mobile-controls">
                  <div className="bb-admin-nav__mobile-theme">
                    <span className="bb-admin-nav__mobile-control-label">
                      Appearance
                    </span>

                    <ThemeToggle />
                  </div>

                  <a
                    href={import.meta.env.VITE_USER}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bb-admin-nav__mobile-preview"
                    onClick={closeMenu}
                  >
                    User Preview
                    <span aria-hidden="true">↗</span>
                  </a>
                </div>

                <nav
                  className="bb-admin-nav__navigation"
                  aria-label="Admin navigation"
                >
                  <ul className="bb-admin-nav__grid">
                    {NAVIGATION_ITEMS.map(
                      ({
                        path,
                        title,
                        shortTitle,
                      }) => {
                        const isActive =
                          isPathActive(path);

                        return (
                          <li
                            className="bb-admin-nav__item"
                            key={path}
                          >
                            <Link
                              to={path}
                              className={`bb-admin-nav__link ${
                                isActive
                                  ? "bb-admin-nav__link--active"
                                  : ""
                              }`}
                              onClick={closeMenu}
                              aria-current={
                                isActive
                                  ? "page"
                                  : undefined
                              }
                            >
                              <span className="bb-admin-nav__link-text">
                                {shortTitle}
                              </span>

                              <span
                                className="bb-admin-nav__link-arrow"
                                aria-hidden="true"
                              >
                                →
                              </span>

                              <span className="bb-admin-nav__link-description">
                                {title}
                              </span>
                            </Link>
                          </li>
                        );
                      }
                    )}
                  </ul>
                </nav>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>

      <AnimatePresence>
        {menuOpen && (
          <motion.button
            type="button"
            className="bb-admin-nav__backdrop"
            aria-label="Close navigation menu"
            onClick={closeMenu}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default AdminNavbar;