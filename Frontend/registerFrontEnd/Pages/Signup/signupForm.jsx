import React, { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { registerApi } from '../../config/axios';
import eyeOpenIcon from '../../assets/password-visibility-icon.gif';
import eyeCloseIcon from '../../assets/password-visibility-icon-reverse.gif';
import PrivacyPolicy from '../../Components/Privacy&Terms/privacyPolicy';
import TermsOfService from '../../Components/Privacy&Terms/termsOfService';
import GoogleSignInButton from './googleSignup';
import './sign_up_form.css';

const INITIAL_FORM_DATA = {
  userName: '',
  email: '',
  password: '',
  confirmPassword: '',
  phoneNumber: '',
  countryCode: '+1',
  isOptedInForPromotions: false,
  isOptedInForEmailUpdates: false,
  hasAcceptedTermsOfService: false,
  hasAcceptedPrivacyPolicy: false,
};

const SignUpPolicyModal = ({
  isVisible,
  content,
  onClose,
  requireScroll = false,
}) => {
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(!requireScroll);

  useEffect(() => {
    setHasScrolledToBottom(!requireScroll);
  }, [isVisible, requireScroll]);

  useEffect(() => {
    if (!isVisible) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape' && hasScrolledToBottom) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [hasScrolledToBottom, isVisible, onClose]);

  if (!isVisible) return null;

  const handleScroll = (event) => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    const reachedBottom = scrollTop + clientHeight >= scrollHeight - 4;

    if (reachedBottom) {
      setHasScrolledToBottom(true);
    }
  };

  const handleOverlayClick = (event) => {
    if (event.target === event.currentTarget && hasScrolledToBottom) {
      onClose();
    }
  };

  return (
    <div
      className="bb-signup-modal"
      role="presentation"
      onMouseDown={handleOverlayClick}
    >
      <section
        className="bb-signup-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Policy information"
      >
        <header className="bb-signup-modal__header">
          <div>
            <span className="bb-signup-modal__eyebrow">Please review</span>
            <h2>Policy Information</h2>
          </div>

          <button
            type="button"
            className="bb-signup-modal__close"
            onClick={onClose}
            disabled={!hasScrolledToBottom}
            aria-label="Close policy window"
          >
            ×
          </button>
        </header>

        <div
          className={`bb-signup-modal__content${
            requireScroll ? ' bb-signup-modal__content--scroll-required' : ''
          }`}
          onScroll={handleScroll}
        >
          {content}
        </div>

        <footer className="bb-signup-modal__footer">
          {requireScroll && !hasScrolledToBottom && (
            <p className="bb-signup-modal__prompt">
              Scroll to the bottom before closing this window.
            </p>
          )}

          <button
            type="button"
            className="bb-signup-button bb-signup-button--secondary"
            onClick={onClose}
            disabled={!hasScrolledToBottom}
          >
            Close
          </button>
        </footer>
      </section>
    </div>
  );
};

const SignUpForm = () => {
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const [modalContent, setModalContent] = useState(null);
  const [isModalVisible, setModalVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [userNameError, setUserNameError] = useState('');
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requirements, setRequirements] = useState({
    length: false,
    upperLowerCase: false,
    specialChar: false,
    digit: false,
  });

  const termsAccepted =
    formData.hasAcceptedPrivacyPolicy &&
    formData.hasAcceptedTermsOfService;

  useEffect(() => {
    setRequirements({
      length: formData.password.length >= 8,
      upperLowerCase: /(?=.*[a-z])(?=.*[A-Z])/.test(formData.password),
      specialChar: /(?=.*[@$!%*?&-])/.test(formData.password),
      digit: /(?=.*\d)/.test(formData.password),
    });
  }, [formData.password]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }));

    if (errorMessage) {
      setErrorMessage('');
    }
  };

  const formatPhoneNumber = (value) => {
    const phoneNumber = value.replace(/[^\d]/g, '').slice(0, 10);

    if (phoneNumber.length < 4) return phoneNumber;
    if (phoneNumber.length < 7) {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
    }

    return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(
      3,
      6
    )}-${phoneNumber.slice(6, 10)}`;
  };

  const handlePhoneChange = (event) => {
    const formattedPhoneNumber = formatPhoneNumber(event.target.value);

    setFormData((current) => ({
      ...current,
      phoneNumber: formattedPhoneNumber,
    }));
  };

  const togglePasswordVisibility = () => {
    setPasswordVisible((current) => !current);
  };

  const handleOpenModal = (content) => {
    setModalContent(content);
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setModalContent(null);
  };

  const checkUsername = async () => {
    const sanitizedUsername = DOMPurify.sanitize(formData.userName.trim());

    if (!sanitizedUsername) {
      setUserNameError('');
      return;
    }

    try {
      await registerApi.post('/sign-up/check-username', {
        userName: sanitizedUsername,
      });
      setUserNameError('');
    } catch (error) {
      if (error.response?.status === 400) {
        setUserNameError('Username is already taken.');
      } else {
        setUserNameError('Unable to check this username right now.');
      }
    }
  };

  const handleKeyDown = (event, index) => {
    if (event.key !== 'Enter') return;

    const nextInput = document.querySelector(
      `[data-bb-signup-index="${index + 1}"]`
    );

    if (nextInput) {
      event.preventDefault();
      nextInput.focus();
    }
  };

  const resetForm = () => {
    setFormData(INITIAL_FORM_DATA);
    setUserNameError('');
    setPasswordVisible(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage('');

    if (formData.password !== formData.confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    const passwordValid = Object.values(requirements).every(Boolean);

    if (!passwordValid) {
      setErrorMessage(
        "Your password must be at least 8 characters and include uppercase, lowercase, a number, and a special character such as '-'."
      );
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(formData.email)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (!termsAccepted) {
      setErrorMessage(
        'Please accept the Privacy Policy and Terms of Service.'
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const sanitizedUserName = DOMPurify.sanitize(formData.userName.trim());
      const sanitizedEmail = DOMPurify.sanitize(formData.email.trim());
      const sanitizedPhoneNumber = DOMPurify.sanitize(formData.phoneNumber);

      const response = await registerApi.post('/sign-up', {
        userName: sanitizedUserName,
        email: sanitizedEmail,
        password: formData.password,
        phoneNumber: `${formData.countryCode} ${sanitizedPhoneNumber}`,
        isOptedInForPromotions: formData.isOptedInForPromotions,
        isOptedInForEmailUpdates: formData.isOptedInForEmailUpdates,
        hasAcceptedPrivacyPolicy: formData.hasAcceptedPrivacyPolicy,
        hasAcceptedTermsOfService: formData.hasAcceptedTermsOfService,
        actionType: 'sign-up',
      });

      if (response.status === 200) {
        setRegisteredEmail(sanitizedEmail);
        setEmailSent(true);
        resetForm();
      } else {
        setErrorMessage(
          response.data?.message || 'An error occurred during registration.'
        );
      }
    } catch (error) {
      console.error('There was an error signing up:', error);
      setErrorMessage(
        error.response?.data?.message ||
          'We could not complete your registration. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (emailSent) {
    return (
      <main className="bb-signup-page">
        <section className="bb-signup-success" aria-live="polite">
          <div className="bb-signup-success__icon" aria-hidden="true">
            ✓
          </div>

          <span className="bb-signup-eyebrow">Almost finished</span>
          <h1>Check your inbox</h1>

          <p>
            Registration was successful. We sent a verification email to:
          </p>

          <strong className="bb-signup-success__email">
            {registeredEmail}
          </strong>

          <p>
            Open that message and follow the verification link to activate your
            account.
          </p>

          <div className="bb-signup-success__notice">
            Entered the wrong email? Return to this page and submit the form
            again with the correct address.
          </div>

          <button
            type="button"
            className="bb-signup-button bb-signup-button--primary"
            onClick={() => setEmailSent(false)}
          >
            Sign up another account
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="bb-signup-page">
      <div className="bb-signup-shell">
        <section className="bb-signup-intro">
          <span className="bb-signup-eyebrow">Create your account</span>
          <h1>Join BakersBurns</h1>
          <p>
            Save your information, receive order updates, and get easier access
            to future purchases and events.
          </p>

          <div className="bb-signup-intro__feature-list">
            <div className="bb-signup-intro__feature">
              <span aria-hidden="true">01</span>
              <div>
                <strong>Faster checkout</strong>
                <p>Keep your account details ready for your next order.</p>
              </div>
            </div>

            <div className="bb-signup-intro__feature">
              <span aria-hidden="true">02</span>
              <div>
                <strong>Order updates</strong>
                <p>Choose whether you want tracking and account emails.</p>
              </div>
            </div>

            <div className="bb-signup-intro__feature">
              <span aria-hidden="true">03</span>
              <div>
                <strong>Your preferences</strong>
                <p>Promotional emails remain completely optional.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="bb-signup-card">
          <header className="bb-signup-card__header">
            <span className="bb-signup-eyebrow">Account details</span>
            <h2>Sign up</h2>
            <p>Complete the fields below to create your account.</p>
          </header>

          <form className="bb-signup-form" onSubmit={handleSubmit} noValidate>
            {errorMessage && (
              <div
                className="bb-signup-alert bb-signup-alert--error"
                role="alert"
              >
                {errorMessage}
              </div>
            )}

            <div className="bb-signup-google">
              <GoogleSignInButton />
            </div>

            <div className="bb-signup-divider">
              <span>or use your email</span>
            </div>

            <div className="bb-signup-field">
              <label htmlFor="bb-signup-username">Username</label>
              <input
                id="bb-signup-username"
                type="text"
                name="userName"
                value={formData.userName}
                onChange={handleChange}
                onBlur={checkUsername}
                placeholder="Choose a username"
                autoComplete="username"
                required
                data-bb-signup-index="0"
                onKeyDown={(event) => handleKeyDown(event, 0)}
                aria-invalid={Boolean(userNameError)}
                aria-describedby={
                  userNameError ? 'bb-signup-username-error' : undefined
                }
              />

              {userNameError && (
                <span
                  id="bb-signup-username-error"
                  className="bb-signup-field__error"
                >
                  {userNameError}
                </span>
              )}
            </div>

            <div className="bb-signup-field">
              <label htmlFor="bb-signup-email">Email address</label>
              <input
                id="bb-signup-email"
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="you@example.com"
                autoComplete="email"
                required
                data-bb-signup-index="1"
                onKeyDown={(event) => handleKeyDown(event, 1)}
              />
            </div>

            <div className="bb-signup-field">
              <label htmlFor="bb-signup-phone">Phone number</label>

              <div className="bb-signup-phone">
                <select
                  name="countryCode"
                  value={formData.countryCode}
                  onChange={handleChange}
                  aria-label="Country calling code"
                >
                  <option value="+1">+1 US</option>
                  <option value="+44">+44 UK</option>
                  <option value="+61">+61 AU</option>
                </select>

                <input
                  id="bb-signup-phone"
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handlePhoneChange}
                  placeholder="(555) 555-5555"
                  autoComplete="tel"
                  maxLength={14}
                  required
                  data-bb-signup-index="2"
                  onKeyDown={(event) => handleKeyDown(event, 2)}
                />
              </div>
            </div>

            <div className="bb-signup-form__two-column">
              <div className="bb-signup-field">
                <label htmlFor="bb-signup-password">Password</label>

                <div className="bb-signup-password">
                  <input
                    id="bb-signup-password"
                    type={passwordVisible ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Create a password"
                    autoComplete="new-password"
                    required
                    data-bb-signup-index="3"
                    onKeyDown={(event) => handleKeyDown(event, 3)}
                  />

                  <button
                    type="button"
                    className="bb-signup-password__toggle"
                    onClick={togglePasswordVisibility}
                    aria-label={
                      passwordVisible ? 'Hide password' : 'Show password'
                    }
                    aria-pressed={passwordVisible}
                  >
                    <img
                      src={passwordVisible ? eyeCloseIcon : eyeOpenIcon}
                      alt=""
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </div>

              <div className="bb-signup-field">
                <label htmlFor="bb-signup-confirm-password">
                  Confirm password
                </label>
                <input
                  id="bb-signup-confirm-password"
                  type={passwordVisible ? 'text' : 'password'}
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                  required
                  data-bb-signup-index="4"
                  onKeyDown={(event) => handleKeyDown(event, 4)}
                />
              </div>
            </div>

            <div className="bb-signup-requirements" aria-live="polite">
              <span className="bb-signup-requirements__title">
                Your password needs:
              </span>

              <ul>
                <li
                  className={
                    requirements.length
                      ? 'bb-signup-requirement--valid'
                      : undefined
                  }
                >
                  At least 8 characters
                </li>
                <li
                  className={
                    requirements.upperLowerCase
                      ? 'bb-signup-requirement--valid'
                      : undefined
                  }
                >
                  Uppercase and lowercase letters
                </li>
                <li
                  className={
                    requirements.specialChar
                      ? 'bb-signup-requirement--valid'
                      : undefined
                  }
                >
                  A special character, including “-”
                </li>
                <li
                  className={
                    requirements.digit
                      ? 'bb-signup-requirement--valid'
                      : undefined
                  }
                >
                  At least one number
                </li>
              </ul>
            </div>

            <fieldset className="bb-signup-preferences">
              <legend>Email preferences</legend>

              <label className="bb-signup-check-row">
                <input
                  type="checkbox"
                  name="isOptedInForPromotions"
                  checked={formData.isOptedInForPromotions}
                  onChange={handleChange}
                />
                <span className="bb-signup-check-row__control" />
                <span>
                  <strong>Promotions</strong>
                  <small>
                    Receive occasional offers and BakersBurns announcements.
                  </small>
                </span>
              </label>

              <label className="bb-signup-check-row">
                <input
                  type="checkbox"
                  name="isOptedInForEmailUpdates"
                  checked={formData.isOptedInForEmailUpdates}
                  onChange={handleChange}
                />
                <span className="bb-signup-check-row__control" />
                <span>
                  <strong>Order and email updates</strong>
                  <small>
                    Receive tracking updates and other helpful account emails.
                  </small>
                </span>
              </label>
            </fieldset>

            <fieldset className="bb-signup-agreements">
              <legend>Required agreements</legend>

              <label className="bb-signup-check-row bb-signup-check-row--required">
                <input
                  type="checkbox"
                  name="hasAcceptedPrivacyPolicy"
                  checked={formData.hasAcceptedPrivacyPolicy}
                  onChange={handleChange}
                />
                <span className="bb-signup-check-row__control" />
                <span>
                  I have read and agree to the{' '}
                  <button
                    type="button"
                    className="bb-signup-inline-link"
                    onClick={() => handleOpenModal(<PrivacyPolicy />)}
                  >
                    Privacy Policy
                  </button>
                  .
                </span>
              </label>

              <label className="bb-signup-check-row bb-signup-check-row--required">
                <input
                  type="checkbox"
                  name="hasAcceptedTermsOfService"
                  checked={formData.hasAcceptedTermsOfService}
                  onChange={handleChange}
                />
                <span className="bb-signup-check-row__control" />
                <span>
                  I have read and agree to the{' '}
                  <button
                    type="button"
                    className="bb-signup-inline-link"
                    onClick={() => handleOpenModal(<TermsOfService />)}
                  >
                    Terms of Service
                  </button>
                  .
                </span>
              </label>
            </fieldset>

            <button
              type="submit"
              className="bb-signup-button bb-signup-button--primary bb-signup-button--submit"
              disabled={!termsAccepted || isSubmitting}
            >
              {isSubmitting
                ? 'Creating account…'
                : termsAccepted
                  ? 'Create account'
                  : 'Accept terms to continue'}
            </button>
          </form>
        </section>
      </div>

      <SignUpPolicyModal
        isVisible={isModalVisible}
        content={modalContent}
        onClose={handleCloseModal}
      />
    </main>
  );
};

export default SignUpForm;