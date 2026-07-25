import React, { useEffect, useState } from "react";
import Cookies from "js-cookie";

import PrivacyPolicy from "../../Components/Privacy&Terms/privacyPolicy";
import TermsOfService from "../../Components/Privacy&Terms/termsOfService";
import { registerApi } from "../../config/axios";

import "./privacy_terms.css";

const CART_CHECKOUT_ENDPOINT =
  "/register-cart/create-checkout-session";

const TICKET_CHECKOUT_ENDPOINT =
  "/register-events/checkout-events";

const acceptanceCookieOptions = {
  expires: 1,
  path: "/",
  sameSite: "Lax",
  secure:
    window.location.protocol === "https:",
};

const temporaryCookieOptions = {
  expires: 1,
  path: "/",
  sameSite: "Lax",
  secure:
    window.location.protocol === "https:",
};

/*
 * Safely parses JSON stored in a cookie.
 *
 * Examples:
 * - pendingTicketCheckout
 * - shippingDetails
 */
const parseCookieJSON = (
  cookieName,
  fallbackValue = {}
) => {
  const cookieValue =
    Cookies.get(cookieName);

  if (!cookieValue) {
    return fallbackValue;
  }

  try {
    return JSON.parse(cookieValue);
  } catch (error) {
    console.error(
      `Failed to parse ${cookieName} cookie:`,
      error
    );

    return fallbackValue;
  }
};

/*
 * Supports the checkout URL response property names
 * currently used by the cart and event controllers.
 */
const getCheckoutUrl = (response) => {
  return (
    response?.data?.url ||
    response?.data?.checkoutUrl ||
    response?.data?.checkout_url ||
    null
  );
};

/*
 * Calendar dates are date-only values rather than
 * timestamps. Preserve the YYYY-MM-DD portion without
 * converting the date through UTC or the browser's
 * timezone.
 */
const normalizeDateOnly = (value) => {
  if (!value) {
    return "";
  }

  const stringValue =
    String(value).trim();

  const dateMatch =
    stringValue.match(
      /^(\d{4}-\d{2}-\d{2})/
    );

  return dateMatch
    ? dateMatch[1]
    : "";
};

/*
 * Validates and normalizes the ticket selections
 * created by TicketQuantityModal.
 *
 * Expected structure:
 *
 * [
 *   {
 *     occurrenceDate: "2026-07-20",
 *     quantity: 2
 *   }
 * ]
 */
const normalizeTicketSelections = (
  selections
) => {
  if (!Array.isArray(selections)) {
    return [];
  }

  return selections
    .map((selection) => {
      const occurrenceDate =
        normalizeDateOnly(
          selection?.occurrenceDate
        );

      const quantity =
        Number(selection?.quantity);

      return {
        occurrenceDate,
        quantity,
      };
    })
    .filter(
      (selection) =>
        Boolean(
          selection.occurrenceDate
        ) &&
        Number.isInteger(
          selection.quantity
        ) &&
        selection.quantity > 0
    );
};

const PrivacyPolicyAndTerms = () => {
  const [
    isPolicyModalOpen,
    setIsPolicyModalOpen,
  ] = useState(false);

  const [
    isToSModalOpen,
    setIsToSModalOpen,
  ] = useState(false);

  const [
    isPolicyChecked,
    setIsPolicyChecked,
  ] = useState(
    () =>
      Cookies.get(
        "hasAcceptedPrivacy"
      ) === "true"
  );

  const [
    isToSChecked,
    setIsToSChecked,
  ] = useState(
    () =>
      Cookies.get(
        "hasAcceptedTerms"
      ) === "true"
  );

  const [
    isPolicyScrolledToBottom,
    setIsPolicyScrolledToBottom,
  ] = useState(false);

  const [
    isToSScrolledToBottom,
    setIsToSScrolledToBottom,
  ] = useState(false);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState(null);

  const [
    confirmDisagree,
    setConfirmDisagree,
  ] = useState(false);

  const [
    pendingToggle,
    setPendingToggle,
  ] = useState(null);

  /*
   * Preserve the existing cart checkout behavior by
   * refreshing the shipping-details timestamp
   * immediately before checkout.
   */
  const updateShippingCookieBeforeCheckout =
    () => {
      const shippingDetails =
        parseCookieJSON(
          "shippingDetails",
          {}
        );

      const updatedShippingDetails = {
        ...shippingDetails,
        timestamp: Date.now(),
      };

      Cookies.set(
        "shippingDetails",
        JSON.stringify(
          updatedShippingDetails
        ),
        temporaryCookieOptions
      );

      console.log(
        "✅ Updated shippingDetails before checkout:",
        updatedShippingDetails
      );

      return updatedShippingDetails;
    };

  /*
   * Starts the existing cart checkout workflow.
   */
  const startCartCheckout =
    async () => {
      const sessionId =
        localStorage.getItem(
          "sessionId"
        );

      if (!sessionId) {
        throw new Error(
          "Your cart session could not be found."
        );
      }

      const shippingDetails =
        updateShippingCookieBeforeCheckout();

      const checkoutPayload = {
        sessionId,

        metadata: {
          hasAcceptedPrivacy:
            isPolicyChecked,

          hasAcceptedTermsOfService:
            isToSChecked,

          ...shippingDetails,
        },
      };

      console.log(
        "🚀 Starting cart checkout with metadata:",
        checkoutPayload
      );

      const response =
        await registerApi.post(
          CART_CHECKOUT_ENDPOINT,
          checkoutPayload
        );

      const checkoutUrl =
        getCheckoutUrl(response);

      if (!checkoutUrl) {
        throw new Error(
          "Cart checkout URL was not returned."
        );
      }

      return checkoutUrl;
    };

  /*
   * Starts ticket checkout using the complete
   * event/date/quantity selections saved by
   * Events.jsx.
   *
   * Expected cookie:
   *
   * {
   *   eventId: 12,
   *   selections: [
   *     {
   *       occurrenceDate: "2026-07-20",
   *       quantity: 2
   *     }
   *   ]
   * }
   */
  const startTicketCheckout =
    async () => {
      const pendingTicketCheckout =
        parseCookieJSON(
          "pendingTicketCheckout",
          null
        );

      if (!pendingTicketCheckout) {
        throw new Error(
          "The selected ticket checkout could not be found."
        );
      }

      const normalizedEventId =
        Number(
          pendingTicketCheckout.eventId
        );

      if (
        !Number.isInteger(
          normalizedEventId
        ) ||
        normalizedEventId <= 0
      ) {
        throw new Error(
          "The selected event is missing a valid event ID."
        );
      }

      const normalizedSelections =
        normalizeTicketSelections(
          pendingTicketCheckout.selections
        );

      if (
        normalizedSelections.length === 0
      ) {
        throw new Error(
          "No valid ticket selections were found. Please return to the events page and select your tickets again."
        );
      }

      const checkoutPayload = {
        eventId: normalizedEventId,
        selections:
          normalizedSelections,

        metadata: {
          hasAcceptedPrivacy:
            isPolicyChecked,

          hasAcceptedTermsOfService:
            isToSChecked,
        },
      };

      console.log(
        "🚀 Starting ticket checkout:",
        checkoutPayload
      );

      const response =
        await registerApi.post(
          TICKET_CHECKOUT_ENDPOINT,
          checkoutPayload
        );

      const checkoutUrl =
        getCheckoutUrl(response);

      if (!checkoutUrl) {
        throw new Error(
          "Ticket checkout URL was not returned."
        );
      }

      return checkoutUrl;
    };

  /*
   * Removes only the temporary routing and pending
   * checkout cookies after Stripe has successfully
   * returned a Checkout URL.
   *
   * Acceptance cookies are intentionally preserved.
   */
  const clearTemporaryCheckoutCookies =
    (checkoutType) => {
      Cookies.remove(
        "checkoutType",
        {
          path: "/",
        }
      );

      if (
        checkoutType === "ticket"
      ) {
        Cookies.remove(
          "pendingTicketCheckout",
          {
            path: "/",
          }
        );
      }
    };

  /*
   * Routes checkout to either the cart or ticket
   * controller after both agreements have been
   * accepted.
   */
  const handleCheckout =
    async () => {
      if (
        !isPolicyChecked ||
        !isToSChecked
      ) {
        setError(
          "You must accept the privacy policy and terms of service to continue."
        );

        return;
      }

      setLoading(true);
      setError(null);

      try {
        /*
         * Defaulting to cart preserves the original
         * cart workflow if checkoutType is absent.
         */
        const checkoutType =
          Cookies.get(
            "checkoutType"
          ) || "cart";

        let checkoutUrl;

        if (
          checkoutType === "ticket"
        ) {
          checkoutUrl =
            await startTicketCheckout();
        } else {
          checkoutUrl =
            await startCartCheckout();
        }

        /*
         * Only clear the temporary checkout data after
         * a valid Stripe Checkout URL has been returned.
         *
         * If checkout fails, the data remains available
         * so the user can retry without reselecting it.
         */
        clearTemporaryCheckoutCookies(
          checkoutType
        );

        window.location.assign(
          checkoutUrl
        );
      } catch (checkoutError) {
        console.error(
          "Failed to initiate checkout:",
          checkoutError
        );

        setError(
          checkoutError.response
            ?.data?.message ||
            checkoutError.message ||
            "Failed to initiate checkout."
        );
      } finally {
        setLoading(false);
      }
    };

  /*
   * Opens the selected agreement modal or asks the
   * user to confirm that they intend to withdraw
   * their previous acceptance.
   */
  const handleToggle = (type) => {
    if (type === "privacy") {
      if (isPolicyChecked) {
        setPendingToggle(
          "privacy"
        );

        setConfirmDisagree(true);
      } else {
        setIsPolicyModalOpen(
          true
        );

        setIsPolicyScrolledToBottom(
          false
        );
      }

      return;
    }

    if (type === "tos") {
      if (isToSChecked) {
        setPendingToggle("tos");
        setConfirmDisagree(true);
      } else {
        setIsToSModalOpen(true);

        setIsToSScrolledToBottom(
          false
        );
      }
    }
  };

  /*
   * Records acceptance for 24 hours and closes the
   * corresponding agreement modal.
   */
  const handleAgree = (type) => {
    if (type === "privacy") {
      setIsPolicyChecked(true);

      Cookies.set(
        "hasAcceptedPrivacy",
        "true",
        acceptanceCookieOptions
      );

      setIsPolicyModalOpen(false);
      setError(null);

      return;
    }

    if (type === "tos") {
      setIsToSChecked(true);

      Cookies.set(
        "hasAcceptedTerms",
        "true",
        acceptanceCookieOptions
      );

      setIsToSModalOpen(false);
      setError(null);
    }
  };

  /*
   * Removes the selected acceptance cookie after the
   * user confirms that they no longer agree.
   */
  const handleConfirmDisagree =
    () => {
      if (
        pendingToggle ===
        "privacy"
      ) {
        setIsPolicyChecked(false);

        Cookies.remove(
          "hasAcceptedPrivacy",
          {
            path: "/",
          }
        );
      } else if (
        pendingToggle === "tos"
      ) {
        setIsToSChecked(false);

        Cookies.remove(
          "hasAcceptedTerms",
          {
            path: "/",
          }
        );
      }

      setPendingToggle(null);
      setConfirmDisagree(false);
    };

  const handleCancelDisagree =
    () => {
      setPendingToggle(null);
      setConfirmDisagree(false);
    };

  /*
   * Closes either agreement modal without recording
   * acceptance.
   */
  const handleDisagree = () => {
    setIsPolicyModalOpen(false);
    setIsToSModalOpen(false);
  };

  const canProceed =
    isPolicyChecked &&
    isToSChecked &&
    !loading;

  const isAgreementModalOpen =
    isPolicyModalOpen ||
    isToSModalOpen;

  const checkoutType =
    Cookies.get(
      "checkoutType"
    ) || "cart";

  /*
   * Keep the document behind the agreement from
   * scrolling while the policy itself owns scrolling.
   * Escape closes only non-destructive review modals.
   */
  useEffect(() => {
    if (
      !isAgreementModalOpen &&
      !confirmDisagree
    ) {
      return undefined;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    const handleKeyDown = (
      event
    ) => {
      if (event.key !== "Escape") {
        return;
      }

      if (confirmDisagree) {
        setPendingToggle(null);
        setConfirmDisagree(false);
      } else {
        setIsPolicyModalOpen(false);
        setIsToSModalOpen(false);
      }
    };

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      document.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    confirmDisagree,
    isAgreementModalOpen,
  ]);

  const renderAgreementModal = ({
    type,
    title,
    description,
    hasReachedBottom,
    children,
  }) => (
    <div
      className="bb-acceptance-modal-overlay"
      role="presentation"
      onMouseDown={handleDisagree}
    >
      <section
        className="bb-acceptance-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`bb-acceptance-${type}-title`}
        onMouseDown={(event) =>
          event.stopPropagation()
        }
      >
        <header className="bb-acceptance-modal-header">
          <div>
            <span className="bb-acceptance-eyebrow">
              Required agreement
            </span>

            <h2
              id={`bb-acceptance-${type}-title`}
            >
              {title}
            </h2>

            <p>{description}</p>
          </div>

          <button
            type="button"
            className="bb-acceptance-modal-close"
            onClick={handleDisagree}
            aria-label={`Close ${title}`}
          >
            ×
          </button>
        </header>

        <div
          className="bb-acceptance-modal-scroll"
          tabIndex={0}
          aria-label={`${title} document`}
        >
          {children}
        </div>

        <footer className="bb-acceptance-modal-footer">
          <div
            className={`bb-acceptance-scroll-status ${
              hasReachedBottom
                ? "bb-acceptance-scroll-status--complete"
                : ""
            }`}
            aria-live="polite"
          >
            <span aria-hidden="true">
              {hasReachedBottom
                ? "✓"
                : "↓"}
            </span>

            <p>
              {hasReachedBottom
                ? "You reached the end and can now agree."
                : "Scroll through the entire document to enable agreement."}
            </p>
          </div>

          <div className="bb-acceptance-modal-actions">
            <button
              type="button"
              className="bb-acceptance-button bb-acceptance-button--secondary"
              onClick={handleDisagree}
            >
              I Don&apos;t Agree
            </button>

            <button
              type="button"
              className="bb-acceptance-button bb-acceptance-button--primary"
              onClick={() =>
                handleAgree(type)
              }
              disabled={
                !hasReachedBottom
              }
            >
              Agree and Continue
            </button>
          </div>
        </footer>
      </section>
    </div>
  );

  return (
    <main className="bb-acceptance-page">
      <section className="bb-acceptance-card">
        <header className="bb-acceptance-header">
          <span className="bb-acceptance-eyebrow">
            One final step
          </span>

          <h1>
            Review and accept
          </h1>

          <p>
            Please review both documents
            before continuing to secure
            checkout.
          </p>

          <div className="bb-acceptance-checkout-type">
            <span aria-hidden="true">
              {checkoutType ===
              "ticket"
                ? "◆"
                : "◈"}
            </span>

            <div>
              <strong>
                {checkoutType ===
                "ticket"
                  ? "Event ticket checkout"
                  : "Product checkout"}
              </strong>

              <small>
                Your selections are saved
                while you review.
              </small>
            </div>
          </div>
        </header>

        <div className="bb-acceptance-body">
          <div className="bb-acceptance-progress">
            <span
              className={
                isPolicyChecked
                  ? "bb-acceptance-progress--complete"
                  : ""
              }
            />

            <span
              className={
                isToSChecked
                  ? "bb-acceptance-progress--complete"
                  : ""
              }
            />
          </div>

          <div className="bb-acceptance-list">
            <article
              className={`bb-acceptance-item ${
                isPolicyChecked
                  ? "bb-acceptance-item--accepted"
                  : ""
              }`}
            >
              <div className="bb-acceptance-item-icon">
                <span aria-hidden="true">
                  {isPolicyChecked
                    ? "✓"
                    : "01"}
                </span>
              </div>

              <div className="bb-acceptance-item-copy">
                <h2>Privacy Policy</h2>

                <p>
                  Review how BakersBurns
                  collects, uses, and
                  protects your information.
                </p>
              </div>

              <button
                type="button"
                className="bb-acceptance-review-button"
                onClick={() =>
                  handleToggle(
                    "privacy"
                  )
                }
              >
                {isPolicyChecked
                  ? "Change"
                  : "Review"}
              </button>
            </article>

            <article
              className={`bb-acceptance-item ${
                isToSChecked
                  ? "bb-acceptance-item--accepted"
                  : ""
              }`}
            >
              <div className="bb-acceptance-item-icon">
                <span aria-hidden="true">
                  {isToSChecked
                    ? "✓"
                    : "02"}
                </span>
              </div>

              <div className="bb-acceptance-item-copy">
                <h2>
                  Terms of Service
                </h2>

                <p>
                  Review the conditions
                  that apply when using
                  BakersBurns and completing
                  your purchase.
                </p>
              </div>

              <button
                type="button"
                className="bb-acceptance-review-button"
                onClick={() =>
                  handleToggle("tos")
                }
              >
                {isToSChecked
                  ? "Change"
                  : "Review"}
              </button>
            </article>
          </div>

          {error && (
            <p
              className="bb-acceptance-alert"
              role="alert"
            >
              {error}
            </p>
          )}

          <div className="bb-acceptance-security-note">
            <span aria-hidden="true">
              ✓
            </span>

            <p>
              Your acceptance is remembered
              for 24 hours on this device.
            </p>
          </div>

          <button
            type="button"
            onClick={handleCheckout}
            disabled={!canProceed}
            className="bb-acceptance-checkout-button"
          >
            {loading ? (
              <>
                <span
                  className="bb-acceptance-spinner"
                  aria-hidden="true"
                />
                Preparing Checkout...
              </>
            ) : (
              "Continue to Secure Checkout"
            )}
          </button>

          {!canProceed && !loading && (
            <p className="bb-acceptance-helper">
              Review and accept both
              documents to continue.
            </p>
          )}
        </div>
      </section>

      {isPolicyModalOpen &&
        renderAgreementModal({
          type: "privacy",
          title: "Privacy Policy",
          description:
            "How we collect, use, and protect your information.",
          hasReachedBottom:
            isPolicyScrolledToBottom,
          children: (
            <PrivacyPolicy
              onReachBottom={() =>
                setIsPolicyScrolledToBottom(
                  true
                )
              }
            />
          ),
        })}

      {isToSModalOpen &&
        renderAgreementModal({
          type: "tos",
          title: "Terms of Service",
          description:
            "The terms that apply to your use of BakersBurns.",
          hasReachedBottom:
            isToSScrolledToBottom,
          children: (
            <TermsOfService
              onReachBottom={() =>
                setIsToSScrolledToBottom(
                  true
                )
              }
            />
          ),
        })}

      {confirmDisagree && (
        <div
          className="bb-acceptance-modal-overlay"
          role="presentation"
          onMouseDown={
            handleCancelDisagree
          }
        >
          <section
            className="bb-acceptance-confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="bb-acceptance-confirm-title"
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <span
              className="bb-acceptance-confirm-icon"
              aria-hidden="true"
            >
              !
            </span>

            <span className="bb-acceptance-eyebrow">
              Confirm your choice
            </span>

            <h2 id="bb-acceptance-confirm-title">
              Withdraw acceptance?
            </h2>

            <p>
              You will need to accept this
              document again before you can
              complete checkout.
            </p>

            <div className="bb-acceptance-modal-actions">
              <button
                type="button"
                className="bb-acceptance-button bb-acceptance-button--danger"
                onClick={
                  handleConfirmDisagree
                }
              >
                Withdraw Acceptance
              </button>

              <button
                type="button"
                className="bb-acceptance-button bb-acceptance-button--secondary"
                onClick={
                  handleCancelDisagree
                }
              >
                Keep Accepted
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};

export default PrivacyPolicyAndTerms;
