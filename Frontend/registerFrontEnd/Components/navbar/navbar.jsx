import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

import { registerApi } from "../../config/axios";
import SocialLinks from "./socialLinks";
import ThemeToggle from "../themetoggle/Dark-Light";

import "./navbar.css";

const Navbar = () => {
  const [menuOpen, setMenuOpen] = useState(
    () => window.innerWidth >= 1000
  );

  const [isLargeScreen, setIsLargeScreen] = useState(
    () => window.innerWidth >= 1000
  );

  const [cartItemCount, setCartItemCount] = useState(0);

  const location = useLocation();

  const pageTitles = {
    "/": "Home",
    "/sign-up": "Sign Up",
    "/login": "Login",
    "/store": "Store",
    "/cart": "Cart",
    "/about": "About",
    "/gallery": "Gallery",
    "/privacy-policy": "Privacy Policy",
    "/terms-of-service": "Terms of Service",
  };

  const currentPageTitle =
    pageTitles[location.pathname] || "";

  /*
   * Use the existing guest session ID.
   *
   * The navbar should generally not create a new session just
   * to check the cart, so this returns null when one does not exist.
   */
  const getSessionId = () => {
    return localStorage.getItem("sessionId");
  };

  /*
   * Fetch the cart and add together all quantities.
   *
   * Example:
   * Hat quantity 2 + Backpack quantity 1 = badge count 3
   */
  const fetchCartItemCount = useCallback(async () => {
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

      const cartItems =
        response.data.cartDetails || [];

      const totalQuantity = cartItems.reduce(
        (total, item) => {
          const quantity = Number(item.quantity);

          return total + (
            Number.isFinite(quantity)
              ? quantity
              : 0
          );
        },
        0
      );

      setCartItemCount(totalQuantity);
    } catch (error) {
      console.error(
        "Error fetching navbar cart count:",
        error
      );

      setCartItemCount(0);
    }
  }, []);

  /*
   * Refresh the cart count when:
   *
   * 1. The navbar first mounts.
   * 2. The user navigates to another route.
   * 3. Another component dispatches a cartUpdated event.
   */
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
  }, [location.pathname, fetchCartItemCount]);

  // Keep desktop navigation open and control mobile state.
  useEffect(() => {
    const handleResize = () => {
      const isWide = window.innerWidth >= 1000;

      setIsLargeScreen(isWide);
      setMenuOpen(isWide);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener(
        "resize",
        handleResize
      );
    };
  }, []);

  const toggleMenu = () => {
    if (!isLargeScreen) {
      setMenuOpen((previous) => !previous);
    }
  };

  const closeMenu = () => {
    if (!isLargeScreen) {
      setMenuOpen(false);
    }
  };

  /*
   * Reusable Cart link so the desktop and mobile versions
   * always show the same badge.
   */
  const CartLink = () => (
    <Link to="/cart" className="cart-nav-link">
      <span>Cart</span>

      {cartItemCount > 0 && (
        <span
          className="cart-count-badge"
          aria-label={`${cartItemCount} items in cart`}
        >
          {cartItemCount > 99
            ? "99+"
            : cartItemCount}
        </span>
      )}
    </Link>
  );

  return (
    <nav className="navbar">
      <div className="navbar-top">
        <AnimatePresence mode="wait">
          <motion.div
            className="navbar-title"
            key={location.pathname}
            initial={{
              opacity: 0,
              y: -20,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            exit={{
              opacity: 0,
              y: 20,
            }}
            transition={{
              duration: 0.5,
            }}
            onClick={toggleMenu}
          >
            {currentPageTitle}
          </motion.div>
        </AnimatePresence>

        {!isLargeScreen && !menuOpen && (
          <Link
            to="/"
            className="hero-title mobile-logo-link"
          >
            BakersBurns
          </Link>
        )}

        {isLargeScreen ? (
          <ul className="nav-list desktop">
            <li
              className="nav-item"
              onClick={closeMenu}
            >
              <Link to="/">Home</Link>
            </li>

            <li
              className="nav-item"
              onClick={closeMenu}
            >
              <Link to="/store">Store</Link>
            </li>

            <li
              className="nav-item"
              onClick={closeMenu}
            >
              <CartLink />
            </li>

            <li
              className="nav-item"
              onClick={closeMenu}
            >
              <Link to="/about">About</Link>
            </li>

            <li
              className="nav-item"
              onClick={closeMenu}
            >
              <Link to="/gallery">Gallery</Link>
            </li>

            <li className="nav-item-tiny-desk-box">
              <div
                className="nav-item-tiny-desk"
                onClick={closeMenu}
              >
                <Link to="/privacy-policy">
                  Privacy Policy
                </Link>
              </div>

              <div
                className="nav-item-tiny-desk"
                onClick={closeMenu}
              >
                <Link to="/terms-of-service">
                  Terms of Service
                </Link>
              </div>
            </li>

            <li className="nav-item">
              <ThemeToggle />
            </li>

            <li className="navbar-auth-list-item">
              <div className="navbar-auth-buttons">
                <button
                  type="button"
                  className="inverted-button-container"
                >
                  <Link
                    to="/sign-up"
                    className="inverted-button"
                  >
                    Sign up
                  </Link>
                </button>

                <button
                  type="button"
                  className="inverted-button-container"
                >
                  <Link
                    to="/login"
                    className="inverted-button"
                  >
                    Login
                  </Link>
                </button>
              </div>
            </li>
          </ul>
        ) : (
          <>
            {menuOpen && (
              <div className="navbar-auth-buttons">
                <button
                  type="button"
                  className="inverted-button-container"
                  onClick={closeMenu}
                >
                  <Link
                    to="/sign-up"
                    className="inverted-button"
                  >
                    Sign up
                  </Link>
                </button>

                <button
                  type="button"
                  className="inverted-button-container"
                  onClick={closeMenu}
                >
                  <Link
                    to="/login"
                    className="inverted-button"
                  >
                    Login
                  </Link>
                </button>
              </div>
            )}

            <button
              type="button"
              className={`hamburger-menu ${
                menuOpen ? "open" : ""
              }`}
              onClick={toggleMenu}
              aria-label="Toggle navigation menu"
              aria-expanded={menuOpen}
            >
              <span className="bar1" />
              <span className="bar2" />
              <span className="bar3" />
            </button>
          </>
        )}
      </div>

      {!isLargeScreen && (
        <>
          <ul
            className={`nav-list mobile ${
              menuOpen ? "show" : ""
            }`}
          >
            <li
              className="nav-item"
              onClick={closeMenu}
            >
              <Link to="/">Home</Link>
            </li>

            <li
              className="nav-item"
              onClick={closeMenu}
            >
              <Link to="/store">Store</Link>
            </li>

            <li
              className="nav-item"
              onClick={closeMenu}
            >
              <CartLink />
            </li>

            <li
              className="nav-item"
              onClick={closeMenu}
            >
              <Link to="/about">About</Link>
            </li>

            <li
              className="nav-item"
              onClick={closeMenu}
            >
              <Link to="/gallery">Gallery</Link>
            </li>

            <li
              className="nav-item-tiny"
              onClick={closeMenu}
            >
              <Link to="/privacy-policy">
                Privacy Policy
              </Link>
            </li>

            <li
              className="nav-item-tiny"
              onClick={closeMenu}
            >
              <Link to="/terms-of-service">
                Terms of Service
              </Link>
            </li>

            <li className="nav-item">
              <ThemeToggle />
            </li>
          </ul>

          {menuOpen && (
            <div className="social-links-nav">
              <SocialLinks />
            </div>
          )}
        </>
      )}
    </nav>
  );
};

export default Navbar;