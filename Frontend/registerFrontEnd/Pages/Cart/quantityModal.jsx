import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { registerApi } from "../../config/axios";
import "./quantityModal.css";

const ADD_TO_CART_ENDPOINT =
  "/register-cart/add-guest-cart";

const getSessionId = () => {
  let sessionId =
    localStorage.getItem(
      "sessionId"
    );

  if (!sessionId) {
    sessionId =
      `guest_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 11)}`;

    localStorage.setItem(
      "sessionId",
      sessionId
    );
  }

  return sessionId;
};

const getProductImageUrl = (
  thumbnail
) => {
  if (!thumbnail) {
    return "";
  }

  const baseUrl =
    import.meta.env
      .VITE_IMAGE_BASE_URL || "";

  return `${baseUrl}/uploads/${thumbnail}`;
};

const formatPrice = (price) => {
  const parsedPrice = Number(price);

  return Number.isFinite(parsedPrice)
    ? parsedPrice.toFixed(2)
    : "0.00";
};

const QuantityModal = ({
  product,
  maxQuantity,
  onClose,
  onViewCart,
}) => {
  const navigate = useNavigate();

  const [quantity, setQuantity] =
    useState(1);

  const [status, setStatus] =
    useState("selecting");

  const [error, setError] =
    useState("");

  const availableQuantity =
    useMemo(() => {
      const parsedQuantity =
        Number(maxQuantity);

      if (
        !Number.isFinite(
          parsedQuantity
        )
      ) {
        return 0;
      }

      return Math.max(
        0,
        Math.floor(
          parsedQuantity
        )
      );
    }, [maxQuantity]);

  const productName =
    product?.name ||
    "Selected product";

  const productImage =
    getProductImageUrl(
      product?.thumbnail
    );

  const isSaving =
    status === "saving";

  const wasAdded =
    status === "added";

  const isUnavailable =
    availableQuantity < 1;

  useEffect(() => {
    const previousOverflow =
      document.body.style
        .overflow;

    document.body.style.overflow =
      "hidden";

    const handleKeyDown = (
      event
    ) => {
      if (
        event.key === "Escape" &&
        !isSaving
      ) {
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
  }, [isSaving, onClose]);

  useEffect(() => {
    setQuantity(
      availableQuantity > 0
        ? 1
        : 0
    );
    setStatus("selecting");
    setError("");
  }, [
    availableQuantity,
    product?.id,
  ]);

  const updateQuantity = (
    nextQuantity
  ) => {
    const parsedQuantity =
      Number.parseInt(
        nextQuantity,
        10
      );

    const normalizedQuantity =
      Number.isFinite(
        parsedQuantity
      )
        ? parsedQuantity
        : 1;

    setQuantity(
      Math.min(
        availableQuantity,
        Math.max(
          1,
          normalizedQuantity
        )
      )
    );
  };

  const handleAddToCart =
    async (event) => {
      event.preventDefault();

      if (
        !product?.id ||
        isUnavailable
      ) {
        setError(
          "This product is not currently available."
        );

        return;
      }

      try {
        setStatus("saving");
        setError("");

        await registerApi.post(
          ADD_TO_CART_ENDPOINT,
          {
            sessionId:
              getSessionId(),
            productId:
              product.id,
            quantity,
          }
        );

        /*
         * Keeps the navbar cart badge in sync with
         * the newly added quantity.
         */
        window.dispatchEvent(
          new Event(
            "cartUpdated"
          )
        );

        setStatus("added");
      } catch (requestError) {
        console.error(
          "Error adding item to cart:",
          requestError
        );

        setError(
          requestError.response
            ?.data?.message ||
            "We could not add this item to your cart. Please try again."
        );

        setStatus("selecting");
      }
    };

  const handleBackdropClick = (
    event
  ) => {
    if (
      event.target ===
        event.currentTarget &&
      !isSaving
    ) {
      onClose?.();
    }
  };

  const handleViewCart = () => {
    onViewCart?.();
    navigate("/cart");
  };

  return (
    <div
      className="bb-quantity-overlay"
      role="presentation"
      onMouseDown={
        handleBackdropClick
      }
    >
      <section
        className={`bb-quantity-modal ${
          wasAdded
            ? "bb-quantity-modal--success"
            : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bb-quantity-title"
      >
        <button
          type="button"
          className="bb-quantity-close"
          onClick={onClose}
          disabled={isSaving}
          aria-label="Close quantity selection"
        >
          ×
        </button>

        {wasAdded ? (
          <div className="bb-quantity-success">
            <span
              className="bb-quantity-success-icon"
              aria-hidden="true"
            >
              ✓
            </span>

            <span className="bb-quantity-eyebrow">
              Added to your cart
            </span>

            <h2 id="bb-quantity-title">
              Ready when you are
            </h2>

            <p>
              <strong>
                {quantity}{" "}
                {quantity === 1
                  ? "item"
                  : "items"}
              </strong>{" "}
              of {productName}{" "}
              {quantity === 1
                ? "is"
                : "are"}{" "}
              now in your cart.
            </p>

            <div className="bb-quantity-actions">
              <button
                type="button"
                className="bb-quantity-button bb-quantity-button--primary"
                onClick={
                  handleViewCart
                }
              >
                View Cart
              </button>

              <button
                type="button"
                className="bb-quantity-button bb-quantity-button--secondary"
                onClick={onClose}
              >
                Keep Shopping
              </button>
            </div>
          </div>
        ) : (
          <>
            <header className="bb-quantity-header">
              <span className="bb-quantity-eyebrow">
                Add to your cart
              </span>

              <h2 id="bb-quantity-title">
                Select Quantity
              </h2>

              <p>
                Choose how many you
                would like before adding
                this item to your cart.
              </p>
            </header>

            <div className="bb-quantity-product">
              <div className="bb-quantity-product-image">
                {productImage ? (
                  <img
                    src={
                      productImage
                    }
                    alt=""
                  />
                ) : (
                  <span
                    aria-hidden="true"
                  >
                    B
                  </span>
                )}
              </div>

              <div className="bb-quantity-product-copy">
                <h3>
                  {productName}
                </h3>

                {product?.price !==
                  undefined && (
                  <p>
                    $
                    {formatPrice(
                      product.price
                    )}
                    {" "}each
                  </p>
                )}
              </div>
            </div>

            {error && (
              <p
                className="bb-quantity-alert"
                role="alert"
              >
                {error}
              </p>
            )}

            <form
              className="bb-quantity-form"
              onSubmit={
                handleAddToCart
              }
            >
              <div className="bb-quantity-picker">
                <button
                  type="button"
                  onClick={() =>
                    updateQuantity(
                      quantity - 1
                    )
                  }
                  disabled={
                    quantity <= 1 ||
                    isSaving ||
                    isUnavailable
                  }
                  aria-label="Decrease quantity"
                >
                  −
                </button>

                <label>
                  <span className="bb-quantity-sr-only">
                    Quantity
                  </span>

                  <input
                    type="number"
                    min="1"
                    max={
                      availableQuantity
                    }
                    value={quantity}
                    onChange={(
                      event
                    ) =>
                      updateQuantity(
                        event.target
                          .value
                      )
                    }
                    disabled={
                      isSaving ||
                      isUnavailable
                    }
                    inputMode="numeric"
                  />
                </label>

                <button
                  type="button"
                  onClick={() =>
                    updateQuantity(
                      quantity + 1
                    )
                  }
                  disabled={
                    quantity >=
                      availableQuantity ||
                    isSaving ||
                    isUnavailable
                  }
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>

              <div className="bb-quantity-availability">
                <span
                  className={
                    isUnavailable
                      ? "bb-quantity-availability-dot bb-quantity-availability-dot--unavailable"
                      : "bb-quantity-availability-dot"
                  }
                  aria-hidden="true"
                />

                <p>
                  {isUnavailable
                    ? "Currently unavailable"
                    : `${availableQuantity} available`}
                </p>
              </div>

              <div className="bb-quantity-total">
                <span>
                  Item total
                </span>

                <strong>
                  $
                  {formatPrice(
                    (Number(
                      product?.price
                    ) || 0) *
                      quantity
                  )}
                </strong>
              </div>

              <div className="bb-quantity-actions">
                <button
                  type="submit"
                  className="bb-quantity-button bb-quantity-button--primary"
                  disabled={
                    isSaving ||
                    isUnavailable
                  }
                >
                  {isSaving ? (
                    <>
                      <span
                        className="bb-quantity-spinner"
                        aria-hidden="true"
                      />
                      Adding...
                    </>
                  ) : (
                    "Add to Cart"
                  )}
                </button>

                <button
                  type="button"
                  className="bb-quantity-button bb-quantity-button--secondary"
                  onClick={onClose}
                  disabled={isSaving}
                >
                  Cancel
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
};

export default QuantityModal;
