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
  secure: window.location.protocol === "https:",
};

const temporaryCookieOptions = {
  expires: 1,
  path: "/",
  sameSite: "Lax",
  secure: window.location.protocol === "https:",
};

const parseCookieJSON = (
  cookieName,
  fallbackValue = {}
) => {
  const cookieValue = Cookies.get(cookieName);

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

const getCheckoutUrl = (response) => {
  return (
    response?.data?.url ||
    response?.data?.checkoutUrl ||
    response?.data?.checkout_url ||
    null
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
      Cookies.get("hasAcceptedPrivacy") ===
      "true"
  );

  const [
    isToSChecked,
    setIsToSChecked,
  ] = useState(
    () =>
      Cookies.get("hasAcceptedTerms") ===
      "true"
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

  const startCartCheckout = async () => {
    const sessionId =
      localStorage.getItem("sessionId");

    if (!sessionId) {
      throw new Error(
        "Your cart session could not be found."
      );
    }

    /*
     * Preserve the original cart workflow:
     * refresh the shipping cookie immediately before
     * creating the Stripe checkout session.
     */
    const shippingDetails =
      updateShippingCookieBeforeCheckout();

    console.log(
      "🚀 Starting cart checkout with metadata:",
      shippingDetails
    );

    const response =
      await registerApi.post(
        CART_CHECKOUT_ENDPOINT,
        {
          sessionId,

          metadata: {
            hasAcceptedPrivacy:
              isPolicyChecked,

            hasAcceptedTermsOfService:
              isToSChecked,

            ...shippingDetails,
          },
        }
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

  const startTicketCheckout = async () => {
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

    const {
      eventId,
      occurrenceDate,
    } = pendingTicketCheckout;

    if (!eventId) {
      throw new Error(
        "The selected event is missing an event ID."
      );
    }

    console.log(
      "🚀 Starting ticket checkout:",
      pendingTicketCheckout
    );

    const response =
      await registerApi.post(
        TICKET_CHECKOUT_ENDPOINT,
        {
          eventId,
          occurrenceDate,

          metadata: {
            hasAcceptedPrivacy:
              isPolicyChecked,

            hasAcceptedTermsOfService:
              isToSChecked,
          },
        }
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

  const clearTemporaryCheckoutCookies = (
    checkoutType
  ) => {
    Cookies.remove(
      "checkoutType",
      {
        path: "/",
      }
    );

    if (checkoutType === "ticket") {
      Cookies.remove(
        "pendingTicketCheckout",
        {
          path: "/",
        }
      );
    }
  };

  const handleCheckout = async () => {
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
       * Defaulting to cart preserves the previous
       * checkout workflow if checkoutType is missing.
       */
      const checkoutType =
        Cookies.get("checkoutType") ||
        "cart";

      let checkoutUrl;

      if (checkoutType === "ticket") {
        checkoutUrl =
          await startTicketCheckout();
      } else {
        checkoutUrl =
          await startCartCheckout();
      }

      clearTemporaryCheckoutCookies(
        checkoutType
      );

      window.location.href =
        checkoutUrl;
    } catch (err) {
      console.error(
        "Failed to initiate checkout:",
        err
      );

      setError(
        err.response?.data?.message ||
        err.message ||
        "Failed to initiate checkout."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (type) => {
    if (type === "privacy") {
      if (isPolicyChecked) {
        setPendingToggle("privacy");
        setConfirmDisagree(true);
      } else {
        setIsPolicyModalOpen(true);
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

  const handleAgree = (type) => {
    if (type === "privacy") {
      setIsPolicyChecked(true);

      Cookies.set(
        "hasAcceptedPrivacy",
        "true",
        acceptanceCookieOptions
      );

      setIsPolicyModalOpen(false);
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
    }
  };

  const handleConfirmDisagree = () => {
    if (pendingToggle === "privacy") {
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

  const handleCancelDisagree = () => {
    setPendingToggle(null);
    setConfirmDisagree(false);
  };

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
              handleToggle("privacy");
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
          aria-checked={isToSChecked}
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
          style={{ color: "red" }}
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
          background:
            canProceed
              ? "green"
              : "gray",
          color: "white",
          border: "none",
          borderRadius: "5px",
          cursor:
            canProceed
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
                  handleAgree("privacy")
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
                onClick={handleDisagree}
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
                onClick={handleDisagree}
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
            <h2>Are you sure?</h2>

            <p>
              Pressing &quot;Yes&quot;
              means you do not want to
              use our website.
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