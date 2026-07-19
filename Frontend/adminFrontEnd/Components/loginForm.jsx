import React, { useState } from "react";
import PropTypes from "prop-types";

import { adminApi } from "../config/axios";
import LoadingPage from "./loading";

import eyeOpenIcon from "../assets/password-visibility-icon.gif";
import eyeCloseIcon from "../assets/password-visibility-icon-reverse.gif";

import "../Componentcss/login.css";

const AdminLoginForm = ({ onLoginSuccess }) => {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [passwordVisible, setPasswordVisible] =
    useState(false);
  const [loading, setLoading] = useState(false);

  const handleIdentifierChange = (event) => {
    setIdentifier(event.target.value);

    if (message) {
      setMessage("");
    }
  };

  const handlePasswordChange = (event) => {
    setPassword(event.target.value);

    if (message) {
      setMessage("");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const normalizedIdentifier = identifier.trim();

    if (!normalizedIdentifier || !password) {
      setMessage(
        "Please enter your username or email and password."
      );
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await adminApi.post(
        "/auth/admin-login",
        {
          identifier: normalizedIdentifier,
          password,
        },
        {
          withCredentials: true,
        }
      );

      onLoginSuccess(response.data.role);
    } catch (error) {
      const errorMessage =
        error.response?.data?.error ||
        error.response?.data?.message ||
        "An unexpected error occurred. Please try again.";

      setMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const redirectToUserApp = () => {
    const userAppUrl = import.meta.env.VITE_USER;

    if (!userAppUrl) {
      setMessage(
        "The user application URL is not configured."
      );
      return;
    }

    window.location.href = userAppUrl;
  };

  const togglePasswordVisibility = () => {
    setPasswordVisible(
      (previousVisibility) =>
        !previousVisibility
    );
  };

  return (
    <main className="bb-admin-login">
      <div
        className="bb-admin-login__background"
        aria-hidden="true"
      >
        <div className="bb-admin-login__glow bb-admin-login__glow--one" />
        <div className="bb-admin-login__glow bb-admin-login__glow--two" />
        <div className="bb-admin-login__grid-pattern" />
      </div>

      <section
        className="bb-admin-login__layout"
        aria-labelledby="bb-admin-login-title"
      >
        <div className="bb-admin-login__brand-panel">
          <div className="bb-admin-login__brand-content">
            <div
              className="bb-admin-login__brand-mark"
              aria-hidden="true"
            >
              BB
            </div>

            <p className="bb-admin-login__eyebrow">
              BakersBurns Administration
            </p>

            <h1 className="bb-admin-login__brand-title">
              Manage your business from one secure
              workspace.
            </h1>

            <p className="bb-admin-login__brand-description">
              Sign in to manage products, orders, events,
              messages, discounts, invoices, and other
              administrative tools.
            </p>

            <div className="bb-admin-login__feature-list">
              <div className="bb-admin-login__feature">
                <span
                  className="bb-admin-login__feature-icon"
                  aria-hidden="true"
                >
                  ✓
                </span>

                <span>Secure administrator access</span>
              </div>

              <div className="bb-admin-login__feature">
                <span
                  className="bb-admin-login__feature-icon"
                  aria-hidden="true"
                >
                  ✓
                </span>

                <span>Centralized store management</span>
              </div>

              <div className="bb-admin-login__feature">
                <span
                  className="bb-admin-login__feature-icon"
                  aria-hidden="true"
                >
                  ✓
                </span>

                <span>Responsive desktop and mobile access</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bb-admin-login__form-panel">
          <div className="bb-admin-login__card">
            {loading ? (
              <div
                className="bb-admin-login__loading"
                role="status"
                aria-live="polite"
                aria-label="Signing in"
              >
                <LoadingPage />

                <p className="bb-admin-login__loading-text">
                  Signing you in...
                </p>
              </div>
            ) : (
              <>
                <header className="bb-admin-login__header">
                  <div className="bb-admin-login__mobile-mark">
                    BB
                  </div>

                  <p className="bb-admin-login__form-eyebrow">
                    Administrator Access
                  </p>

                  <h2
                    id="bb-admin-login-title"
                    className="bb-admin-login__title"
                  >
                    Welcome back
                  </h2>

                  <p className="bb-admin-login__subtitle">
                    Enter your administrator credentials to
                    continue.
                  </p>
                </header>

                {message && (
                  <div
                    className="bb-admin-login__alert"
                    role="alert"
                    aria-live="assertive"
                  >
                    <span
                      className="bb-admin-login__alert-icon"
                      aria-hidden="true"
                    >
                      !
                    </span>

                    <span>{message}</span>
                  </div>
                )}

                <form
                  className="bb-admin-login__form"
                  onSubmit={handleSubmit}
                  noValidate
                >
                  <div className="bb-admin-login__field">
                    <label
                      className="bb-admin-login__label"
                      htmlFor="bb-admin-login-identifier"
                    >
                      Username or email
                    </label>

                    <div className="bb-admin-login__input-wrapper">
                      <span
                        className="bb-admin-login__input-icon"
                        aria-hidden="true"
                      >
                        @
                      </span>

                      <input
                        id="bb-admin-login-identifier"
                        className="bb-admin-login__input bb-admin-login__input--with-leading-icon"
                        type="text"
                        value={identifier}
                        onChange={handleIdentifierChange}
                        placeholder="Enter your username or email"
                        autoComplete="username"
                        autoCapitalize="none"
                        spellCheck="false"
                        required
                      />
                    </div>
                  </div>

                  <div className="bb-admin-login__field">
                    <label
                      className="bb-admin-login__label"
                      htmlFor="bb-admin-login-password"
                    >
                      Password
                    </label>

                    <div className="bb-admin-login__input-wrapper">
                      <span
                        className="bb-admin-login__input-icon"
                        aria-hidden="true"
                      >
                        •
                      </span>

                      <input
                        id="bb-admin-login-password"
                        className="bb-admin-login__input bb-admin-login__input--password"
                        type={
                          passwordVisible
                            ? "text"
                            : "password"
                        }
                        value={password}
                        onChange={handlePasswordChange}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        required
                      />

                      <button
                        type="button"
                        className="bb-admin-login__visibility-button"
                        onClick={togglePasswordVisibility}
                        aria-label={
                          passwordVisible
                            ? "Hide password"
                            : "Show password"
                        }
                        aria-pressed={passwordVisible}
                      >
                        <img
                          className="bb-admin-login__visibility-icon"
                          src={
                            passwordVisible
                              ? eyeCloseIcon
                              : eyeOpenIcon
                          }
                          alt=""
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="bb-admin-login__button bb-admin-login__button--primary"
                    disabled={loading}
                  >
                    <span>Sign in to Admin</span>

                    <span
                      className="bb-admin-login__button-arrow"
                      aria-hidden="true"
                    >
                      →
                    </span>
                  </button>
                </form>

                <div className="bb-admin-login__divider">
                  <span>or</span>
                </div>

                <button
                  type="button"
                  className="bb-admin-login__button bb-admin-login__button--secondary"
                  onClick={redirectToUserApp}
                >
                  <span>Access User App</span>

                  <span
                    className="bb-admin-login__external-icon"
                    aria-hidden="true"
                  >
                    ↗
                  </span>
                </button>

                <p className="bb-admin-login__security-note">
                  This area is restricted to authorized
                  administrators.
                </p>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
};

AdminLoginForm.propTypes = {
  onLoginSuccess: PropTypes.func.isRequired,
};

export default AdminLoginForm;