import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import "./confirmationModal.css";

const ConfirmationModal = ({
  message,
  onClose,
}) => {
  const navigate = useNavigate();

  useEffect(() => {
    const previousOverflow =
      document.body.style
        .overflow;

    document.body.style.overflow =
      "hidden";

    const handleKeyDown = (
      event
    ) => {
      if (event.key === "Escape") {
        onClose?.();
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
  }, [onClose]);

  const handleBackdropClick = (
    event
  ) => {
    if (
      event.target ===
      event.currentTarget
    ) {
      onClose?.();
    }
  };

  const handleGoToCart = () => {
    onClose?.();
    navigate("/cart");
  };

  const handleKeepShopping = () => {
    onClose?.();
    navigate("/store");
  };

  return (
    <div
      className="bb-cart-confirm-overlay"
      role="presentation"
      onMouseDown={
        handleBackdropClick
      }
    >
      <section
        className="bb-cart-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bb-cart-confirm-title"
        aria-describedby="bb-cart-confirm-message"
      >
        <button
          type="button"
          className="bb-cart-confirm-close"
          onClick={onClose}
          aria-label="Close cart confirmation"
        >
          ×
        </button>

        <div
          className="bb-cart-confirm-icon"
          aria-hidden="true"
        >
          ✓
        </div>

        <span className="bb-cart-confirm-eyebrow">
          Added successfully
        </span>

        <h2 id="bb-cart-confirm-title">
          Item Added to Cart
        </h2>

        <p
          id="bb-cart-confirm-message"
          className="bb-cart-confirm-message"
        >
          {message ||
            "Your item is now in your cart."}
        </p>

        <div className="bb-cart-confirm-summary">
          <span aria-hidden="true">
            ◈
          </span>

          <div>
            <strong>
              Your cart has been updated
            </strong>

            <small>
              You can review quantities
              and delivery options from
              your cart.
            </small>
          </div>
        </div>

        <div className="bb-cart-confirm-actions">
          <button
            type="button"
            className="bb-cart-confirm-button bb-cart-confirm-button--primary"
            onClick={
              handleGoToCart
            }
          >
            Go to Cart
          </button>

          <button
            type="button"
            className="bb-cart-confirm-button bb-cart-confirm-button--secondary"
            onClick={
              handleKeepShopping
            }
          >
            Keep Shopping
          </button>
        </div>
      </section>
    </div>
  );
};

export default ConfirmationModal;
