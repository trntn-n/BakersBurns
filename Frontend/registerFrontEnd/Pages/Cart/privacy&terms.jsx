import React, { useState } from "react";
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

  return (
    <div className="privacy-terms-container">
      <h2>
        Review Privacy Policy and
        Terms of Service
      </h2>

      <div className="toggle-wrapper">
        <span className="toggle-label">
          Privacy Policy
        </span>

        <div
          className={`toggle-container ${
            isPolicyChecked
              ? "checked"
              : ""
          }`}
          onClick={() =>
            handleToggle("privacy")
          }
          role="switch"
          aria-checked={
            isPolicyChecked
          }
          tabIndex={0}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" ||
              event.key === " "
            ) {
              event.preventDefault();

              handleToggle(
                "privacy"
              );
            }
          }}
        >
          <div className="toggle-handle" />
        </div>
      </div>

      <div className="toggle-wrapper">
        <span className="toggle-label">
          Terms of Service
        </span>

        <div
          className={`toggle-container ${
            isToSChecked
              ? "checked"
              : ""
          }`}
          onClick={() =>
            handleToggle("tos")
          }
          role="switch"
          aria-checked={
            isToSChecked
          }
          tabIndex={0}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" ||
              event.key === " "
            ) {
              event.preventDefault();

              handleToggle("tos");
            }
          }}
        >
          <div className="toggle-handle" />
        </div>
      </div>

      {error && (
        <p
          className="privacy-terms-error"
          style={{
            color: "red",
          }}
          role="alert"
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleCheckout}
        disabled={!canProceed}
        style={{
          marginTop: "20px",
          padding: "10px 20px",
          background: canProceed
            ? "green"
            : "gray",
          color: "white",
          border: "none",
          borderRadius: "5px",
          cursor: canProceed
            ? "pointer"
            : "not-allowed",
        }}
      >
        {loading
          ? "Processing..."
          : "Accept & Proceed to Checkout"}
      </button>

      {isPolicyModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <PrivacyPolicy
              onReachBottom={() =>
                setIsPolicyScrolledToBottom(
                  true
                )
              }
            />

            <div className="modal-buttons">
              <button
                type="button"
                onClick={() =>
                  handleAgree(
                    "privacy"
                  )
                }
                disabled={
                  !isPolicyScrolledToBottom
                }
              >
                Agree
              </button>

              <p
                style={{
                  marginTop: 20,
                  padding: 10,
                }}
              >
                You must scroll to the
                bottom to click agree.
              </p>

              <button
                type="button"
                onClick={
                  handleDisagree
                }
              >
                I Don&apos;t Agree
              </button>
            </div>
          </div>
        </div>
      )}

      {isToSModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <TermsOfService
              onReachBottom={() =>
                setIsToSScrolledToBottom(
                  true
                )
              }
            />

            <div className="modal-buttons">
              <button
                type="button"
                onClick={() =>
                  handleAgree("tos")
                }
                disabled={
                  !isToSScrolledToBottom
                }
              >
                Agree
              </button>

              <p
                style={{
                  marginTop: 20,
                  padding: 10,
                }}
              >
                You must scroll to the
                bottom to click agree.
              </p>

              <button
                type="button"
                onClick={
                  handleDisagree
                }
              >
                I Don&apos;t Agree
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDisagree && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>
              Are you sure?
            </h2>

            <p>
              Pressing
              &quot;Yes&quot; means
              you do not want to use
              our website.
            </p>

            <div className="modal-buttons">
              <button
                type="button"
                onClick={
                  handleConfirmDisagree
                }
              >
                Yes
              </button>

              <button
                type="button"
                onClick={
                  handleCancelDisagree
                }
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrivacyPolicyAndTerms;