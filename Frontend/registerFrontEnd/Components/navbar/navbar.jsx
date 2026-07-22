import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Link,
  NavLink,
  useLocation,
} from "react-router-dom";
import {
  AnimatePresence,
  motion,
} from "framer-motion";

import { registerApi } from "../../config/axios";
import SocialLinks from "./socialLinks";
import ThemeToggle from "../themetoggle/Dark-Light";

import "./navbar.css";

const DESKTOP_BREAKPOINT = 1000;

const NAVIGATION_ITEMS = [
  {
    label: "Home",
    shortLabel: "Home",
    path: "/",
    exact: true,
  },
  {
    label: "Store",
    shortLabel: "Store",
    path: "/store",
  },
  {
    label: "Events",
    shortLabel: "Events",
    path: "/events",
  },
  {
    label: "Contact",
    shortLabel: "Contact",
    path: "/contact",
  },
  {
    label: "About",
    shortLabel: "About",
    path: "/about",
  },
  {
    label: "Gallery",
    shortLabel: "Gallery",
    path: "/gallery",
  },
];

const LEGAL_ITEMS = [
  {
    label: "Privacy Policy",
    path: "/privacy-policy",
  },
  {
    label: "Terms of Service",
    path: "/terms-of-service",
  },
];

const PAGE_TITLES = {
  "/": "Home",
  "/sign-up": "Create Account",
  "/login": "Login",
  "/store": "Store",
  "/cart": "Shopping Cart",
  "/events": "Events",
  "/about": "About",
  "/gallery": "Gallery",
  "/privacy-policy": "Privacy Policy",
  "/terms-of-service": "Terms of Service",
};

const Navbar = () => {
  const location = useLocation();

  const [isLargeScreen, setIsLargeScreen] =
    useState(() => {
      if (typeof window === "undefined") {
        return true;
      }

      return (
        window.innerWidth >= DESKTOP_BREAKPOINT
      );
    });

  const [menuOpen, setMenuOpen] =
    useState(false);

  const [cartItemCount, setCartItemCount] =
    useState(0);

  const [navbarElevated, setNavbarElevated] =
    useState(false);

  const currentPageTitle = useMemo(() => {
    return (
      PAGE_TITLES[location.pathname] ||
      "BakersBurns"
    );
  }, [location.pathname]);

  const getSessionId = () => {
    return localStorage.getItem("sessionId");
  };

  const fetchCartItemCount =
    useCallback(async () => {
      const sessionId = getSessionId();

      if (!sessionId) {
        setCartItemCount(0);
        return;
      }

      try {
        const response = await registerApi.post(
          "/register-cart/items",
          {
            sessionId,
          }
        );

        const cartItems = Array.isArray(
          response.data?.cartDetails
        )
          ? response.data.cartDetails
          : [];

        const totalQuantity =
          cartItems.reduce(
            (total, item) => {
              const quantity = Number(
                item.quantity
              );

              return (
                total +
                (Number.isFinite(quantity)
                  ? quantity
                  : 0)
              );
            },
            0
          );

        setCartItemCount(totalQuantity);
      } catch (error) {
        console.error(
          "Error fetching navbar cart count:",
          error.response?.data || error
        );

        setCartItemCount(0);
      }
    }, []);

  useEffect(() => {
    fetchCartItemCount();

    const handleCartUpdated = () => {
      fetchCartItemCount();
    };

    window.addEventListener(
      "cartUpdated",
      handleCartUpdated
    );

    return () => {
      window.removeEventListener(
        "cartUpdated",
        handleCartUpdated
      );
    };
  }, [
    location.pathname,
    fetchCartItemCount,
  ]);

  useEffect(() => {
    const handleResize = () => {
      const isWide =
        window.innerWidth >=
        DESKTOP_BREAKPOINT;

      setIsLargeScreen(isWide);

      if (isWide) {
        setMenuOpen(false);
      }
    };

    handleResize();

    window.addEventListener(
      "resize",
      handleResize
    );

    return () => {
      window.removeEventListener(
        "resize",
        handleResize
      );
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setNavbarElevated(
        window.scrollY > 12
      );
    };

    handleScroll();

    window.addEventListener(
      "scroll",
      handleScroll,
      {
        passive: true,
      }
    );

    return () => {
      window.removeEventListener(
        "scroll",
        handleScroll
      );
    };
  }, []);

  useEffect(() => {
    if (isLargeScreen) {
      return undefined;
    }

    document.body.style.overflow =
      menuOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen, isLargeScreen]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (
        event.key === "Escape" &&
        menuOpen
      ) {
        setMenuOpen(false);
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const toggleMenu = () => {
    if (!isLargeScreen) {
      setMenuOpen(
        (previousOpenState) =>
          !previousOpenState
      );
    }
  };

  const closeMenu = () => {
    setMenuOpen(false);
  };

  const renderCartBadge = () => {
    if (cartItemCount <= 0) {
      return null;
    }

    return (
      <span
        className="bb-register-nav__cart-badge"
        aria-label={`${cartItemCount} item${
          cartItemCount === 1 ? "" : "s"
        } in cart`}
      >
        {cartItemCount > 99
          ? "99+"
          : cartItemCount}
      </span>
    );
  };

  return (
    <>
      <header
        className={[
          "bb-register-nav",
          navbarElevated
            ? "bb-register-nav--elevated"
            : "",
          menuOpen
            ? "bb-register-nav--open"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="bb-register-nav__inner">
          <Link
            to="/"
            className="bb-register-nav__brand"
            aria-label="BakersBurns home"
            onClick={closeMenu}
          >
            <span
              className="bb-register-nav__brand-mark"
              aria-hidden="true"
            >
              BB
            </span>

            <span className="bb-register-nav__brand-copy">
              <strong className="bb-register-nav__brand-name">
                BakersBurns
              </strong>

              <AnimatePresence mode="wait">
                <motion.span
                  key={currentPageTitle}
                  className="bb-register-nav__page-title"
                  initial={{
                    opacity: 0,
                    y: -5,
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                  }}
                  exit={{
                    opacity: 0,
                    y: 5,
                  }}
                  transition={{
                    duration: 0.2,
                  }}
                >
                  {currentPageTitle}
                </motion.span>
              </AnimatePresence>
            </span>
          </Link>

          <nav
            className="bb-register-nav__desktop"
            aria-label="Primary navigation"
          >
            <ul className="bb-register-nav__desktop-list">
              {NAVIGATION_ITEMS.map(
                (item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      end={item.exact}
                      className={({
                        isActive,
                      }) =>
                        [
                          "bb-register-nav__desktop-link",
                          isActive
                            ? "bb-register-nav__desktop-link--active"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")
                      }
                    >
                      {item.label}
                    </NavLink>
                  </li>
                )
              )}

              <li>
                <NavLink
                  to="/cart"
                  className={({
                    isActive,
                  }) =>
                    [
                      "bb-register-nav__desktop-link",
                      "bb-register-nav__cart-link",
                      isActive
                        ? "bb-register-nav__desktop-link--active"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")
                  }
                >
                  <span>Cart</span>
                  {renderCartBadge()}
                </NavLink>
              </li>
            </ul>
          </nav>

          <div className="bb-register-nav__desktop-actions">
            <div className="bb-register-nav__theme-control">
              <ThemeToggle />
            </div>

            <Link
              to="/login"
              className="bb-register-nav__action-link bb-register-nav__action-link--secondary"
            >
              Login
            </Link>

            <Link
              to="/sign-up"
              className="bb-register-nav__action-link bb-register-nav__action-link--primary"
            >
              Sign up
            </Link>
          </div>

          <div className="bb-register-nav__mobile-actions">
            <Link
              to="/cart"
              className="bb-register-nav__mobile-cart"
              onClick={closeMenu}
              aria-label={`Shopping cart${
                cartItemCount > 0
                  ? ` with ${cartItemCount} items`
                  : ""
              }`}
            >
              <span
                className="bb-register-nav__cart-icon"
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 24 24"
                  focusable="false"
                >
                  <path
                    d="M3 4h2l2.2 9.2a2 2 0 0 0 2 1.5h7.9a2 2 0 0 0 1.9-1.4L21 7H7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  <circle
                    cx="10"
                    cy="19"
                    r="1.3"
                    fill="currentColor"
                  />

                  <circle
                    cx="18"
                    cy="19"
                    r="1.3"
                    fill="currentColor"
                  />
                </svg>
              </span>

              {renderCartBadge()}
            </Link>

            <button
              type="button"
              className={[
                "bb-register-nav__menu-button",
                menuOpen
                  ? "bb-register-nav__menu-button--open"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={toggleMenu}
              aria-label={
                menuOpen
                  ? "Close navigation menu"
                  : "Open navigation menu"
              }
              aria-expanded={menuOpen}
              aria-controls="bb-register-mobile-menu"
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {!isLargeScreen && menuOpen && (
            <motion.div
              id="bb-register-mobile-menu"
              className="bb-register-nav__mobile-menu"
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
                duration: 0.25,
                ease: [
                  0.22,
                  1,
                  0.36,
                  1,
                ],
              }}
            >
              <div className="bb-register-nav__mobile-content">
                <div className="bb-register-nav__mobile-heading">
                  <span className="bb-register-nav__mobile-eyebrow">
                    Navigation
                  </span>

                  <span className="bb-register-nav__mobile-current">
                    {currentPageTitle}
                  </span>
                </div>

                <nav
                  aria-label="Mobile navigation"
                >
                  <ul className="bb-register-nav__mobile-list">
                    {NAVIGATION_ITEMS.map(
                      (item, index) => (
                        <motion.li
                          key={item.path}
                          initial={{
                            opacity: 0,
                            x: -12,
                          }}
                          animate={{
                            opacity: 1,
                            x: 0,
                          }}
                          transition={{
                            delay:
                              index * 0.035,
                          }}
                        >
                          <NavLink
                            to={item.path}
                            end={item.exact}
                            onClick={
                              closeMenu
                            }
                            className={({
                              isActive,
                            }) =>
                              [
                                "bb-register-nav__mobile-link",
                                isActive
                                  ? "bb-register-nav__mobile-link--active"
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" ")
                            }
                          >
                            <span>
                              {
                                item.shortLabel
                              }
                            </span>

                            <span
                              className="bb-register-nav__mobile-link-arrow"
                              aria-hidden="true"
                            >
                              →
                            </span>
                          </NavLink>
                        </motion.li>
                      )
                    )}

                    <motion.li
                      initial={{
                        opacity: 0,
                        x: -12,
                      }}
                      animate={{
                        opacity: 1,
                        x: 0,
                      }}
                      transition={{
                        delay:
                          NAVIGATION_ITEMS.length *
                          0.035,
                      }}
                    >
                      <NavLink
                        to="/cart"
                        onClick={closeMenu}
                        className={({
                          isActive,
                        }) =>
                          [
                            "bb-register-nav__mobile-link",
                            isActive
                              ? "bb-register-nav__mobile-link--active"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")
                        }
                      >
                        <span className="bb-register-nav__mobile-cart-label">
                          Cart
                          {renderCartBadge()}
                        </span>

                        <span
                          className="bb-register-nav__mobile-link-arrow"
                          aria-hidden="true"
                        >
                          →
                        </span>
                      </NavLink>
                    </motion.li>
                  </ul>
                </nav>

                <div className="bb-register-nav__mobile-auth">
                  <Link
                    to="/login"
                    className="bb-register-nav__mobile-auth-link bb-register-nav__mobile-auth-link--secondary"
                    onClick={closeMenu}
                  >
                    Login
                  </Link>

                  <Link
                    to="/sign-up"
                    className="bb-register-nav__mobile-auth-link bb-register-nav__mobile-auth-link--primary"
                    onClick={closeMenu}
                  >
                    Create Account
                  </Link>
                </div>

                <div className="bb-register-nav__mobile-footer">
                  <div className="bb-register-nav__mobile-theme">
                    <div>
                      <span className="bb-register-nav__mobile-footer-label">
                        Appearance
                      </span>

                      <span className="bb-register-nav__mobile-footer-description">
                        Change the site theme
                      </span>
                    </div>

                    <ThemeToggle />
                  </div>

                  <div className="bb-register-nav__legal-links">
                    {LEGAL_ITEMS.map(
                      (item) => (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={
                            closeMenu
                          }
                        >
                          {item.label}
                        </Link>
                      )
                    )}
                  </div>

                  <div className="bb-register-nav__social-links">
                    <SocialLinks />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <AnimatePresence>
        {!isLargeScreen && menuOpen && (
          <motion.button
            type="button"
            className="bb-register-nav__backdrop"
            aria-label="Close navigation menu"
            onClick={closeMenu}
            initial={{
              opacity: 0,
            }}
            animate={{
              opacity: 1,
            }}
            exit={{
              opacity: 0,
            }}
            transition={{
              duration: 0.2,
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default Navbar;