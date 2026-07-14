import React, {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import Cookies from "js-cookie";

import { registerApi } from "../../config/axios";

import UPSRates from "./upsRates";
import TrashIcon from "../../assets/trash.webp";
import CheckoutSummary from "./CheckoutSummary";

import "./cart.css";

const CART_CHECKOUT_ENDPOINT =
  "/register-cart/create-checkout-session";

const cookieOptions = {
  expires: 1,
  path: "/",
  sameSite: "Lax",
  secure:
    window.location.protocol === "https:",
};

/*
 * Dummy tax rate lookup based on ZIP code prefix.
 * Replace this with your actual tax calculation
 * service when available.
 */
const getTaxRateForZip = (zip) => {
  if (!zip || zip.length < 1) {
    return 0;
  }

  if (zip.startsWith("9")) {
    return 0.0725;
  }

  if (zip.startsWith("1")) {
    return 0.08875;
  }

  return 0.06;
};

const getCheckoutUrl = (response) => {
  return (
    response?.data?.url ||
    response?.data?.checkoutUrl ||
    response?.data?.checkout_url ||
    null
  );
};

const CartPage = () => {
  const navigate = useNavigate();

  const [cart, setCart] =
    useState([]);

  const [
    totalPrice,
    setTotalPrice,
  ] = useState(0);

  const [error, setError] =
    useState(null);

  const [loading, setLoading] =
    useState(false);

  const [
    receiverZip,
    setReceiverZip,
  ] = useState("");

  const [
    shippingCost,
    setShippingCost,
  ] = useState(null);

  const [
    zipSubmitted,
    setZipSubmitted,
  ] = useState(false);

  const [
    showSummaryModal,
    setShowSummaryModal,
  ] = useState(false);

  const [
    selectedCarrier,
    setSelectedCarrier,
  ] = useState(null);

  const [
    selectedService,
    setSelectedService,
  ] = useState(null);

  const [
    openCarrier,
    setOpenCarrier,
  ] = useState(null);

  const getSessionId = () => {
    let storedSessionId =
      localStorage.getItem(
        "sessionId"
      );

    if (!storedSessionId) {
      storedSessionId =
        `guest_${Date.now()}_${Math.random()
          .toString(36)
          .substring(2, 11)}`;

      localStorage.setItem(
        "sessionId",
        storedSessionId
      );
    }

    return storedSessionId;
  };

  const [sessionId] = useState(
    () => getSessionId()
  );

  const hasShippingCost =
    shippingCost !== null &&
    shippingCost !== undefined;

  const taxRate = zipSubmitted
    ? getTaxRateForZip(receiverZip)
    : 0;

  const taxAmount =
    hasShippingCost
      ? (
          totalPrice +
          shippingCost
        ) * taxRate
      : 0;

  const grandTotal =
    hasShippingCost
      ? totalPrice +
        shippingCost +
        taxAmount
      : totalPrice;

  const calculateTotal = (
    cartItems
  ) => {
    const total =
      cartItems.reduce(
        (sum, item) => {
          const itemPrice =
            Number(item.price) || 0;

          const itemQuantity =
            Number(item.quantity) || 0;

          return (
            sum +
            itemPrice *
              itemQuantity
          );
        },
        0
      );

    setTotalPrice(total);
  };

  useEffect(() => {
    let isMounted = true;

    const fetchCartItems =
      async () => {
        setLoading(true);
        setError(null);

        try {
          const response =
            await registerApi.post(
              "/register-cart/items",
              {
                sessionId,
              }
            );

          const fetchedCart =
            Array.isArray(
              response.data
                ?.cartDetails
            )
              ? response.data
                  .cartDetails
              : [];

          if (isMounted) {
            setCart(fetchedCart);
            calculateTotal(
              fetchedCart
            );
          }
        } catch (err) {
          console.error(
            "❌ Error fetching cart items:",
            err
          );

          if (isMounted) {
            setError(
              err.response?.data
                ?.message ||
                "Error loading cart items."
            );
          }
        } finally {
          if (isMounted) {
            setLoading(false);
          }
        }
      };

    fetchCartItems();

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  const totalWeight =
    cart.reduce(
      (sum, item) => {
        const itemWeight =
          Number(item.weight) || 0;

        const itemQuantity =
          Number(item.quantity) || 0;

        return (
          sum +
          itemWeight *
            itemQuantity
        );
      },
      0
    );

  const totalDimensions =
    cart.reduce(
      (dimensions, item) => {
        const quantity =
          Number(item.quantity) || 0;

        const length =
          Number(item.length) || 0;

        const width =
          Number(item.width) || 0;

        const height =
          Number(item.height) || 0;

        return {
          length:
            dimensions.length +
            length * quantity,

          width: Math.max(
            dimensions.width,
            width
          ),

          height: Math.max(
            dimensions.height,
            height
          ),
        };
      },
      {
        length: 0,
        width: 0,
        height: 0,
      }
    );

  const handleProceedToCheckout =
    () => {
      if (
        !hasShippingCost ||
        !selectedCarrier
      ) {
        alert(
          "Please select a shipping option before proceeding."
        );

        return;
      }

      setShowSummaryModal(true);
    };

  /*
   * Creates the existing cart Stripe checkout session
   * without showing the privacy/terms page again.
   *
   * This is only called when both acceptance cookies
   * are already set to "true".
   */
  const startCartCheckoutDirectly =
    async (shippingDetails) => {
      try {
        setLoading(true);
        setError(null);

        const updatedShippingDetails =
          {
            ...shippingDetails,
            timestamp: Date.now(),
          };

        /*
         * Preserve the same shippingDetails cookie
         * behavior used by the privacy checkout page.
         */
        Cookies.set(
          "shippingDetails",
          JSON.stringify(
            updatedShippingDetails
          ),
          cookieOptions
        );

        console.log(
          "🚀 Starting direct cart checkout with metadata:",
          updatedShippingDetails
        );

        const response =
          await registerApi.post(
            CART_CHECKOUT_ENDPOINT,
            {
              sessionId,

              metadata: {
                hasAcceptedPrivacy:
                  true,

                hasAcceptedTermsOfService:
                  true,

                ...updatedShippingDetails,
              },
            }
          );

        const checkoutUrl =
          getCheckoutUrl(response);

        if (!checkoutUrl) {
          throw new Error(
            "Checkout URL was not returned."
          );
        }

        /*
         * checkoutType is temporary routing state.
         * The acceptance cookies remain untouched.
         */
        Cookies.remove(
          "checkoutType",
          {
            path: "/",
          }
        );

        Cookies.remove(
          "pendingTicketCheckout",
          {
            path: "/",
          }
        );

        window.location.assign(
          checkoutUrl
        );
      } catch (err) {
        console.error(
          "Failed to start direct cart checkout:",
          err
        );

        setError(
          err.response?.data
            ?.message ||
            err.message ||
            "Failed to initiate checkout."
        );
      } finally {
        setLoading(false);
      }
    };

  const handleConfirmCheckout =
    async () => {
      const shippingDetails = {
        shippingCost,
        selectedCarrier,
        selectedService,
        receiverZip,
        taxAmount,
        grandTotal,
      };

      /*
       * Mark this as a product/cart checkout.
       */
      Cookies.set(
        "checkoutType",
        "cart",
        cookieOptions
      );

      /*
       * Prevent stale event checkout information from
       * being picked up by the privacy page.
       */
      Cookies.remove(
        "pendingTicketCheckout",
        {
          path: "/",
        }
      );

      Cookies.set(
        "shippingDetails",
        JSON.stringify(
          shippingDetails
        ),
        cookieOptions
      );

      const hasAcceptedPrivacy =
        Cookies.get(
          "hasAcceptedPrivacy"
        ) === "true";

      const hasAcceptedTerms =
        Cookies.get(
          "hasAcceptedTerms"
        ) === "true";

      /*
       * Both acceptance cookies already exist.
       * Skip checkout-options and privacy/terms and
       * immediately create the Stripe cart session.
       */
      if (
        hasAcceptedPrivacy &&
        hasAcceptedTerms
      ) {
        await startCartCheckoutDirectly(
          shippingDetails
        );

        return;
      }

      /*
       * Existing behavior for customers who have not
       * accepted both documents.
       */
      navigate(
        "/checkout-options"
      );
    };

  const handleQuantityChange =
    async (
      id,
      requestedQuantity
    ) => {
      const parsedQuantity =
        Number(requestedQuantity);

      const safeQuantity =
        Number.isFinite(
          parsedQuantity
        )
          ? Math.max(
              1,
              parsedQuantity
            )
          : 1;

      try {
        const updatedCart =
          cart.map((item) =>
            item.id === id
              ? {
                  ...item,
                  quantity:
                    safeQuantity,
                }
              : item
          );

        setCart(updatedCart);
        calculateTotal(
          updatedCart
        );

        await registerApi.post(
          "/register-cart/add-guest-cart",
          {
            sessionId,
            productId: id,
            quantity:
              safeQuantity,
          }
        );
      } catch (err) {
        console.error(
          "Error updating quantity:",
          err
        );

        setError(
          err.response?.data
            ?.message ||
            "Failed to update quantity."
        );
      }
    };

  const handleDelete =
    async (id) => {
      try {
        await registerApi.post(
          "/register-cart/delete-cart-item",
          {
            sessionId,
            productId: id,
            quantity: 0,
          }
        );

        const updatedCart =
          cart.filter(
            (item) =>
              item.id !== id
          );

        setCart(updatedCart);
        calculateTotal(
          updatedCart
        );
      } catch (err) {
        console.error(
          "Error deleting item:",
          err
        );

        setError(
          err.response?.data
            ?.message ||
            "Failed to remove item."
        );
      }
    };

  const handleZipSubmit =
    () => {
      const normalizedZip =
        receiverZip.trim();

      if (
        /^\d{5}$/.test(
          normalizedZip
        )
      ) {
        setReceiverZip(
          normalizedZip
        );

        setZipSubmitted(true);
        return;
      }

      alert(
        "Please enter a valid 5-digit ZIP code."
      );
    };

  const handleSelectShipping =
    (
      carrier,
      serviceType,
      cost
    ) => {
      const parsedCost =
        Number(cost);

      if (
        !Number.isFinite(
          parsedCost
        )
      ) {
        setError(
          "The selected shipping rate is invalid."
        );

        return;
      }

      setError(null);
      setSelectedCarrier(
        carrier
      );
      setSelectedService(
        serviceType
      );
      setShippingCost(
        parsedCost
      );
    };

  if (loading && cart.length === 0) {
    return (
      <div className="cart-container empty">
        <h2>
          Loading your cart...
        </h2>
      </div>
    );
  }

  if (
    !loading &&
    cart.length === 0
  ) {
    return (
      <div className="cart-container empty">
        <h2>
          Your cart is empty!
        </h2>

        {error && (
          <p className="cart-error">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() =>
            navigate("/store")
          }
          className="cart-back-button"
        >
          Back to Store
        </button>
      </div>
    );
  }

  return (
    <div className="cart-container">
      <div className="cart-section">
        <h2 className="cart-title">
          Your Cart
        </h2>

        {error && (
          <p
            className="cart-error"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="cart-items">
          {cart.map((item) => {
            const itemPrice =
              Number(item.price) || 0;

            return (
              <div
                key={item.id}
                className="cart-item"
              >
                <div className="cart-item-info">
                  <img
                    src={`${import.meta.env.VITE_IMAGE_BASE_URL}/uploads/${item.thumbnail}`}
                    alt={item.name}
                    className="cart-item-image"
                  />

                  <div className="cart-item-details">
                    <h4 className="cart-item-name">
                      {item.name}
                    </h4>

                    <p className="cart-item-price">
                      $
                      {itemPrice.toFixed(
                        2
                      )}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="delete-icon-button"
                    aria-label={`Remove ${item.name} from cart`}
                    onClick={() =>
                      handleDelete(
                        item.id
                      )
                    }
                  >
                    <img
                      src={TrashIcon}
                      alt=""
                      className="delete-icon"
                    />
                  </button>
                </div>

                <div className="cart-item-quantity-control">
                  <button
                    type="button"
                    className="quantity-button"
                    onClick={() =>
                      handleQuantityChange(
                        item.id,
                        Number(
                          item.quantity
                        ) - 1
                      )
                    }
                  >
                    -
                  </button>

                  <input
                    type="number"
                    min="1"
                    value={
                      item.quantity
                    }
                    onChange={(event) =>
                      handleQuantityChange(
                        item.id,
                        event.target
                          .value
                      )
                    }
                  />

                  <button
                    type="button"
                    className="quantity-button"
                    onClick={() =>
                      handleQuantityChange(
                        item.id,
                        Number(
                          item.quantity
                        ) + 1
                      )
                    }
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="shipping-section">
          <label htmlFor="zip">
            Enter ZIP Code:
          </label>

          <input
            type="text"
            id="zip"
            value={receiverZip}
            onChange={(event) =>
              setReceiverZip(
                event.target.value
              )
            }
            placeholder="Enter your ZIP code"
            disabled={
              zipSubmitted
            }
            maxLength={5}
            inputMode="numeric"
          />

          <button
            type="button"
            className="zip-button"
            onClick={
              handleZipSubmit
            }
            disabled={
              zipSubmitted
            }
          >
            {zipSubmitted
              ? "ZIP Code Submitted"
              : "Submit ZIP Code"}
          </button>
        </div>

        {zipSubmitted && (
          <div className="carrier-buttons">
            <p>
              Please select a
              carrier
            </p>

            <UPSRates
              receiverZip={
                receiverZip
              }
              totalWeight={
                totalWeight
              }
              totalDimensions={
                totalDimensions
              }
              onSelectRate={(
                serviceType,
                cost
              ) =>
                handleSelectShipping(
                  "UPS",
                  serviceType,
                  cost
                )
              }
              isOpen={
                openCarrier ===
                "UPS"
              }
              onToggle={() =>
                setOpenCarrier(
                  openCarrier ===
                    "UPS"
                    ? null
                    : "UPS"
                )
              }
            />
          </div>
        )}

        <div className="shipping-summary">
          <h3>
            Shipping Cost:{" "}
            {hasShippingCost
              ? `$${shippingCost.toFixed(
                  2
                )}`
              : "Not Selected"}
          </h3>

          {hasShippingCost && (
            <>
              <h4>
                Tax (
                {(
                  taxRate * 100
                ).toFixed(2)}
                %): $
                {taxAmount.toFixed(
                  2
                )}
              </h4>

              <h3>
                Grand Total: $
                {grandTotal.toFixed(
                  2
                )}
              </h3>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={
            handleProceedToCheckout
          }
          disabled={
            !hasShippingCost ||
            loading
          }
          className={`proceed-checkout ${
            !hasShippingCost ||
            loading
              ? "disabled"
              : ""
          }`}
        >
          {loading
            ? "Processing..."
            : "Proceed to Checkout"}
        </button>

        {showSummaryModal && (
          <CheckoutSummary
            cart={cart}
            shippingCost={
              shippingCost
            }
            taxAmount={
              taxAmount
            }
            grandTotal={
              grandTotal
            }
            selectedCarrier={
              selectedCarrier
            }
            selectedService={
              selectedService
            }
            receiverZip={
              receiverZip
            }
            onClose={() =>
              setShowSummaryModal(
                false
              )
            }
            onConfirm={
              handleConfirmCheckout
            }
          />
        )}
      </div>
    </div>
  );
};

export default CartPage;