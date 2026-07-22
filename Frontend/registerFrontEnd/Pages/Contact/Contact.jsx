// src/Pages/Contact/Contact.jsx
import React, {
    useMemo,
    useState,
  } from 'react';
  
  import './Contact.css';
  
  const INITIAL_FORM_DATA = {
    name: '',
    email: '',
    subject: '',
    category: 'general',
    message: '',
    website: '',
  };
  
  const CONTACT_CATEGORIES = [
    {
      value: 'general',
      label: 'General question',
    },
    {
      value: 'order',
      label: 'Order assistance',
    },
    {
      value: 'event',
      label: 'Event assistance',
    },
    {
      value: 'product',
      label: 'Product question',
    },
    {
      value: 'account',
      label: 'Account assistance',
    },
    {
      value: 'other',
      label: 'Other',
    },
  ];
  
  const MAX_MESSAGE_LENGTH = 2000;
  
  const Contact = () => {
    const [formData, setFormData] =
      useState(INITIAL_FORM_DATA);
  
    const [fieldErrors, setFieldErrors] =
      useState({});
  
    const [status, setStatus] = useState({
      type: 'idle',
      message: '',
    });
  
    const isSubmitting =
      status.type === 'loading';
  
    const messageCharactersRemaining =
      MAX_MESSAGE_LENGTH -
      formData.message.length;
  
    const selectedCategoryLabel =
      useMemo(() => {
        const selectedCategory =
          CONTACT_CATEGORIES.find(
            (category) =>
              category.value ===
              formData.category
          );
  
        return (
          selectedCategory?.label ||
          'General question'
        );
      }, [formData.category]);
  
    const updateField = (
      fieldName,
      fieldValue
    ) => {
      setFormData((currentFormData) => ({
        ...currentFormData,
        [fieldName]: fieldValue,
      }));
  
      setFieldErrors(
        (currentFieldErrors) => ({
          ...currentFieldErrors,
          [fieldName]: '',
        })
      );
  
      if (
        status.type === 'error' ||
        status.type === 'success'
      ) {
        setStatus({
          type: 'idle',
          message: '',
        });
      }
    };
  
    const handleInputChange = (event) => {
      const {
        name,
        value,
      } = event.target;
  
      updateField(
        name,
        name === 'message'
          ? value.slice(
              0,
              MAX_MESSAGE_LENGTH
            )
          : value
      );
    };
  
    const validateForm = () => {
      const errors = {};
  
      const normalizedName =
        formData.name.trim();
  
      const normalizedEmail =
        formData.email
          .trim()
          .toLowerCase();
  
      const normalizedSubject =
        formData.subject.trim();
  
      const normalizedMessage =
        formData.message.trim();
  
      const emailPattern =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
      if (!normalizedName) {
        errors.name =
          'Please enter your name.';
      } else if (
        normalizedName.length < 2
      ) {
        errors.name =
          'Please enter at least 2 characters.';
      }
  
      if (!normalizedEmail) {
        errors.email =
          'Please enter your email address.';
      } else if (
        !emailPattern.test(
          normalizedEmail
        )
      ) {
        errors.email =
          'Please enter a valid email address.';
      }
  
      if (!normalizedSubject) {
        errors.subject =
          'Please enter a subject.';
      } else if (
        normalizedSubject.length < 3
      ) {
        errors.subject =
          'Please enter at least 3 characters.';
      }
  
      if (!normalizedMessage) {
        errors.message =
          'Please enter your message.';
      } else if (
        normalizedMessage.length < 10
      ) {
        errors.message =
          'Please enter at least 10 characters.';
      }
  
      setFieldErrors(errors);
  
      return {
        isValid:
          Object.keys(errors).length === 0,
        normalizedValues: {
          name: normalizedName,
          email: normalizedEmail,
          subject: normalizedSubject,
          category: formData.category,
          message: normalizedMessage,
          website: formData.website,
        },
      };
    };
  
    const handleSubmit = async (event) => {
      event.preventDefault();
  
      if (isSubmitting) {
        return;
      }
  
      const {
        isValid,
        normalizedValues,
      } = validateForm();
  
      if (!isValid) {
        setStatus({
          type: 'error',
          message:
            'Please review the highlighted fields and try again.',
        });
  
        return;
      }
  
      /*
       * Honeypot spam field.
       *
       * Real users never see or complete this field.
       * Return a fake success response when it is populated.
       */
      if (normalizedValues.website) {
        setStatus({
          type: 'success',
          message:
            'Thank you. Your message has been submitted.',
        });
  
        setFormData(INITIAL_FORM_DATA);
        setFieldErrors({});
  
        return;
      }
  
      setStatus({
        type: 'loading',
        message:
          'Sending your message...',
      });
  
      try {
        /*
         * Update this route if your API uses a different
         * contact endpoint or base URL.
         */
        const response = await fetch(
          'https://api.bakersburns.com/contact/contact-send',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
              name:
                normalizedValues.name,
              email:
                normalizedValues.email,
              subject:
                normalizedValues.subject,
              category:
                normalizedValues.category,
              message:
                normalizedValues.message,
            }),
          }
        );
  
        let responseData = null;
  
        try {
          responseData =
            await response.json();
        } catch {
          responseData = null;
        }
  
        if (!response.ok) {
          throw new Error(
            responseData?.message ||
              responseData?.error ||
              'We could not send your message. Please try again.'
          );
        }
  
        setStatus({
          type: 'success',
          message:
            responseData?.message ||
            'Your message has been sent. An administrator will respond as soon as possible.',
        });
  
        setFormData(
          INITIAL_FORM_DATA
        );
  
        setFieldErrors({});
      } catch (error) {
        console.error(
          'Contact form submission failed:',
          error
        );
  
        setStatus({
          type: 'error',
          message:
            error?.message ||
            'Something went wrong while sending your message.',
        });
      }
    };
  
    return (
      <main className="contact-page">
        <div className="contact-page__background-accent contact-page__background-accent--one" />
        <div className="contact-page__background-accent contact-page__background-accent--two" />
  
        <section className="contact-page__shell">
          <header className="contact-page__header">
            <span className="contact-page__eyebrow">
              Contact Bakers Burns
            </span>
  
            <h1 className="contact-page__title">
              How can we help?
            </h1>
  
            <p className="contact-page__intro">
              Send us a message using the
              form below. Your message will
              be delivered directly to an
              administrator without exposing
              their personal email address.
            </p>
          </header>
  
          <div className="contact-page__layout">
            <aside className="contact-page__information">
              <div className="contact-page__information-card">
                <div className="contact-page__information-icon">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path
                      d="M4 5.5h16v13H4v-13Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinejoin="round"
                    />
  
                    <path
                      d="m5 7 7 5 7-5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
  
                <div>
                  <h2>
                    Send us a message
                  </h2>
  
                  <p>
                    Tell us what you need
                    help with and include any
                    useful order or event
                    details.
                  </p>
                </div>
              </div>
  
              <div className="contact-page__information-card">
                <div className="contact-page__information-icon">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path
                      d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
  
                    <path
                      d="M12 7v5l3 2"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
  
                <div>
                  <h2>
                    Response time
                  </h2>
  
                  <p>
                    We will review your
                    request and respond to
                    the email address you
                    provide.
                  </p>
                </div>
              </div>
  
              <div className="contact-page__information-card">
                <div className="contact-page__information-icon">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path
                      d="M12 3 5 6v5c0 4.8 2.8 8.2 7 10 4.2-1.8 7-5.2 7-10V6l-7-3Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinejoin="round"
                    />
  
                    <path
                      d="m9.5 12 1.7 1.7 3.7-4"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
  
                <div>
                  <h2>
                    Your information
                  </h2>
  
                  <p>
                    Your contact information
                    is only used to review
                    and respond to your
                    request.
                  </p>
                </div>
              </div>
  
              <div className="contact-page__summary">
                <span className="contact-page__summary-label">
                  Selected topic
                </span>
  
                <strong className="contact-page__summary-value">
                  {selectedCategoryLabel}
                </strong>
              </div>
            </aside>
  
            <div className="contact-page__form-card">
              <div className="contact-page__form-heading">
                <div>
                  <span className="contact-page__form-eyebrow">
                    Message form
                  </span>
  
                  <h2>
                    Start a conversation
                  </h2>
                </div>
  
                <div className="contact-page__form-heading-icon">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path
                      d="M20 14a4 4 0 0 1-4 4H9l-5 3v-7a4 4 0 0 1-1-2.6V7a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4v7Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
  
              <form
                className="contact-page__form"
                onSubmit={handleSubmit}
                noValidate
              >
                <div className="contact-page__form-grid">
                  <div className="contact-page__field">
                    <label
                      htmlFor="contact-name"
                      className="contact-page__label"
                    >
                      Name
                      <span aria-hidden="true">
                        *
                      </span>
                    </label>
  
                    <input
                      id="contact-name"
                      className={`contact-page__input ${
                        fieldErrors.name
                          ? 'contact-page__input--error'
                          : ''
                      }`}
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={
                        handleInputChange
                      }
                      placeholder="Your name"
                      autoComplete="name"
                      maxLength={100}
                      disabled={isSubmitting}
                      aria-invalid={
                        Boolean(
                          fieldErrors.name
                        )
                      }
                      aria-describedby={
                        fieldErrors.name
                          ? 'contact-name-error'
                          : undefined
                      }
                    />
  
                    {fieldErrors.name && (
                      <span
                        id="contact-name-error"
                        className="contact-page__field-error"
                      >
                        {fieldErrors.name}
                      </span>
                    )}
                  </div>
  
                  <div className="contact-page__field">
                    <label
                      htmlFor="contact-email"
                      className="contact-page__label"
                    >
                      Email address
                      <span aria-hidden="true">
                        *
                      </span>
                    </label>
  
                    <input
                      id="contact-email"
                      className={`contact-page__input ${
                        fieldErrors.email
                          ? 'contact-page__input--error'
                          : ''
                      }`}
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={
                        handleInputChange
                      }
                      placeholder="you@example.com"
                      autoComplete="email"
                      inputMode="email"
                      maxLength={255}
                      disabled={isSubmitting}
                      aria-invalid={
                        Boolean(
                          fieldErrors.email
                        )
                      }
                      aria-describedby={
                        fieldErrors.email
                          ? 'contact-email-error'
                          : undefined
                      }
                    />
  
                    {fieldErrors.email && (
                      <span
                        id="contact-email-error"
                        className="contact-page__field-error"
                      >
                        {fieldErrors.email}
                      </span>
                    )}
                  </div>
                </div>
  
                <div className="contact-page__form-grid">
                  <div className="contact-page__field">
                    <label
                      htmlFor="contact-category"
                      className="contact-page__label"
                    >
                      What can we help with?
                    </label>
  
                    <div className="contact-page__select-wrapper">
                      <select
                        id="contact-category"
                        className="contact-page__select"
                        name="category"
                        value={
                          formData.category
                        }
                        onChange={
                          handleInputChange
                        }
                        disabled={
                          isSubmitting
                        }
                      >
                        {CONTACT_CATEGORIES.map(
                          (category) => (
                            <option
                              key={
                                category.value
                              }
                              value={
                                category.value
                              }
                            >
                              {
                                category.label
                              }
                            </option>
                          )
                        )}
                      </select>
  
                      <svg
                        className="contact-page__select-icon"
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path
                          d="m7 10 5 5 5-5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  </div>
  
                  <div className="contact-page__field">
                    <label
                      htmlFor="contact-subject"
                      className="contact-page__label"
                    >
                      Subject
                      <span aria-hidden="true">
                        *
                      </span>
                    </label>
  
                    <input
                      id="contact-subject"
                      className={`contact-page__input ${
                        fieldErrors.subject
                          ? 'contact-page__input--error'
                          : ''
                      }`}
                      type="text"
                      name="subject"
                      value={
                        formData.subject
                      }
                      onChange={
                        handleInputChange
                      }
                      placeholder="Briefly describe your request"
                      maxLength={150}
                      disabled={isSubmitting}
                      aria-invalid={
                        Boolean(
                          fieldErrors.subject
                        )
                      }
                      aria-describedby={
                        fieldErrors.subject
                          ? 'contact-subject-error'
                          : undefined
                      }
                    />
  
                    {fieldErrors.subject && (
                      <span
                        id="contact-subject-error"
                        className="contact-page__field-error"
                      >
                        {
                          fieldErrors.subject
                        }
                      </span>
                    )}
                  </div>
                </div>
  
                <div className="contact-page__field">
                  <div className="contact-page__label-row">
                    <label
                      htmlFor="contact-message"
                      className="contact-page__label"
                    >
                      Message
                      <span aria-hidden="true">
                        *
                      </span>
                    </label>
  
                    <span
                      className={`contact-page__character-count ${
                        messageCharactersRemaining <
                        100
                          ? 'contact-page__character-count--warning'
                          : ''
                      }`}
                    >
                      {
                        messageCharactersRemaining
                      }{' '}
                      remaining
                    </span>
                  </div>
  
                  <textarea
                    id="contact-message"
                    className={`contact-page__textarea ${
                      fieldErrors.message
                        ? 'contact-page__textarea--error'
                        : ''
                    }`}
                    name="message"
                    value={formData.message}
                    onChange={
                      handleInputChange
                    }
                    placeholder="Please include any useful order numbers, event names, dates, or other details."
                    rows={8}
                    maxLength={
                      MAX_MESSAGE_LENGTH
                    }
                    disabled={isSubmitting}
                    aria-invalid={
                      Boolean(
                        fieldErrors.message
                      )
                    }
                    aria-describedby={
                      fieldErrors.message
                        ? 'contact-message-error'
                        : 'contact-message-help'
                    }
                  />
  
                  {fieldErrors.message ? (
                    <span
                      id="contact-message-error"
                      className="contact-page__field-error"
                    >
                      {fieldErrors.message}
                    </span>
                  ) : (
                    <span
                      id="contact-message-help"
                      className="contact-page__field-help"
                    >
                      Avoid including passwords,
                      payment card numbers, or
                      other highly sensitive
                      information.
                    </span>
                  )}
                </div>
  
                <div
                  className="contact-page__honeypot"
                  aria-hidden="true"
                >
                  <label htmlFor="contact-website">
                    Website
                  </label>
  
                  <input
                    id="contact-website"
                    type="text"
                    name="website"
                    value={formData.website}
                    onChange={
                      handleInputChange
                    }
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </div>
  
                {status.type !== 'idle' && (
                  <div
                    className={`contact-page__status contact-page__status--${status.type}`}
                    role={
                      status.type === 'error'
                        ? 'alert'
                        : 'status'
                    }
                    aria-live="polite"
                  >
                    <div className="contact-page__status-icon">
                      {status.type ===
                      'loading' ? (
                        <span className="contact-page__spinner" />
                      ) : status.type ===
                        'success' ? (
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <path
                            d="m6 12 4 4 8-8"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : (
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <path
                            d="M12 8v5"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
  
                          <path
                            d="M12 17.1v.1"
                            stroke="currentColor"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                          />
  
                          <path
                            d="M10.3 4.7 3.7 16.2A2 2 0 0 0 5.4 19h13.2a2 2 0 0 0 1.7-2.8L13.7 4.7a2 2 0 0 0-3.4 0Z"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
  
                    <p>{status.message}</p>
                  </div>
                )}
  
                <div className="contact-page__form-footer">
                  <p className="contact-page__required-note">
                    <span aria-hidden="true">
                      *
                    </span>{' '}
                    Required fields
                  </p>
  
                  <button
                    className="contact-page__submit-button"
                    type="submit"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="contact-page__button-spinner" />
                        Sending message
                      </>
                    ) : (
                      <>
                        Send message
  
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <path
                            d="m5 12 14-7-4.5 14-3-5.5L5 12Z"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
  
                          <path
                            d="m11.5 13.5 3.5-3.5"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>
      </main>
    );
  };
  
  export default Contact;