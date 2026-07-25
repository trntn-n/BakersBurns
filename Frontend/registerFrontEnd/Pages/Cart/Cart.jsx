import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import Cookies from "js-cookie";

import { registerApi } from "../../config/axios";
import UPSRates from "./upsRates";
import "./cart.css";

const CART_ITEMS_ENDPOINT = "/register-cart/items";
const CART_UPDATE_ENDPOINT = "/register-cart/add-guest-cart";
const CART_DELETE_ENDPOINT = "/register-cart/delete-cart-item";
const SHIPPING_UPDATE_ENDPOINT = "/register-cart/update-shipping";
const CHECKOUT_ENDPOINT = "/register-cart/create-checkout-session";

const cookieOptions = {
  expires: 1,
  path: "/",
  sameSite: "Lax",
  secure: window.location.protocol === "https:",
};

const steps = [
  { id: "cart", label: "Cart" },
  { id: "delivery", label: "Delivery" },
  { id: "review", label: "Review" },
  { id: "checkout", label: "Checkout" },
];

const getSessionId = () => {
  let sessionId = localStorage.getItem("sessionId");

  if (!sessionId) {
    sessionId = `guest_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 11)}`;
    localStorage.setItem("sessionId", sessionId);
  }

  return sessionId;
};

const getTaxRateForZip = (zip) => {
  if (!zip) return 0;
  if (zip.startsWith("9")) return 0.0725;
  if (zip.startsWith("1")) return 0.08875;
  return 0.06;
};

const getCheckoutUrl = (response) =>
  response?.data?.url ||
  response?.data?.checkoutUrl ||
  response?.data?.checkout_url ||
  null;

const money = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
};

const getImageUrl = (thumbnail) => {
  if (!thumbnail) return "";
  const baseUrl = import.meta.env.VITE_IMAGE_BASE_URL || "";
  return `${baseUrl}/uploads/${thumbnail}`;
};

const panelMotion = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.22, ease: "easeOut" },
};

const ModalShell = ({ children, label, onClose }) => {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <motion.div
      className="bb-checkout-modal-backdrop"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={onClose}
    >
      <motion.div
        className="bb-checkout-modal"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        initial={reduceMotion ? false : { opacity: 0, y: 22, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.2 }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
};

/*
 * Import this named component from the Store/ProductModal:
 * import { ProductQuantityModal } from "../Cart/CartCheckoutFlow";
 */
export const ProductQuantityModal = ({
  product,
  maxQuantity,
  onClose,
  onViewCart,
}) => {
  const navigate = useNavigate();
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState("selecting");
  const [error, setError] = useState("");

  const safeMaximum = Math.max(1, Number(maxQuantity) || 1);

  const updateQuantity = (nextQuantity) => {
    const parsed = Number.parseInt(nextQuantity, 10);
    setQuantity(Math.min(safeMaximum, Math.max(1, parsed || 1)));
  };

  const handleAddToCart = async () => {
    try {
      setStatus("saving");
      setError("");

      await registerApi.post(CART_UPDATE_ENDPOINT, {
        sessionId: getSessionId(),
        productId: product.id,
        quantity,
      });

      window.dispatchEvent(new Event("cartUpdated"));
      setStatus("added");
    } catch (requestError) {
      console.error("Error adding item to cart:", requestError);
      setError(
        requestError.response?.data?.message ||
          "We could not add this item. Please try again."
      );
      setStatus("selecting");
    }
  };

  const handleViewCart = () => {
    onViewCart?.();
    navigate("/cart");
  };

  return (
    <AnimatePresence>
      <ModalShell
        label={status === "added" ? "Item added to cart" : "Select quantity"}
        onClose={onClose}
      >
        {status === "added" ? (
          <div className="bb-checkout-added">
            <span className="bb-checkout-added-icon" aria-hidden="true">
              ✓
            </span>
            <span className="bb-checkout-eyebrow">Added to your cart</span>
            <h2>{product.name}</h2>
            <p>
              {quantity} {quantity === 1 ? "item is" : "items are"} ready in
              your cart.
            </p>
            <div className="bb-checkout-modal-actions">
              <button
                type="button"
                className="bb-checkout-button bb-checkout-button--primary"
                onClick={handleViewCart}
              >
                View cart
              </button>
              <button
                type="button"
                className="bb-checkout-button bb-checkout-button--secondary"
                onClick={onClose}
              >
                Keep shopping
              </button>
            </div>
          </div>
        ) : (
          <>
            <span className="bb-checkout-eyebrow">Choose your quantity</span>
            <h2 className="bb-checkout-modal-title">{product.name}</h2>

            {error && (
              <p className="bb-checkout-alert" role="alert">
                {error}
              </p>
            )}

            <div className="bb-checkout-quantity-picker">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => updateQuantity(quantity - 1)}
                disabled={quantity <= 1 || status === "saving"}
              >
                −
              </button>
              <label>
                <span className="bb-checkout-sr-only">Quantity</span>
                <input
                  type="number"
                  min="1"
                  max={safeMaximum}
                  value={quantity}
                  onChange={(event) => updateQuantity(event.target.value)}
                  disabled={status === "saving"}
                />
              </label>
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() => updateQuantity(quantity + 1)}
                disabled={quantity >= safeMaximum || status === "saving"}
              >
                +
              </button>
            </div>

            <p className="bb-checkout-stock">{safeMaximum} available</p>

            <div className="bb-checkout-modal-actions">
              <button
                type="button"
                className="bb-checkout-button bb-checkout-button--primary"
                onClick={handleAddToCart}
                disabled={status === "saving"}
              >
                {status === "saving" ? "Adding…" : "Add to cart"}
              </button>
              <button
                type="button"
                className="bb-checkout-button bb-checkout-button--secondary"
                onClick={onClose}
                disabled={status === "saving"}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </ModalShell>
    </AnimatePresence>
  );
};

const CartCheckoutFlow = () => {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [sessionId] = useState(getSessionId);
  const [cart, setCart] = useState([]);
  const [activeStep, setActiveStep] = useState("cart");
  const [receiverZip, setReceiverZip] = useState("");
  const [zipSubmitted, setZipSubmitted] = useState(false);
  const [selectedCarrier, setSelectedCarrier] = useState("");
  const [selectedService, setSelectedService] = useState("");
  const [shippingCost, setShippingCost] = useState(null);
  const [openCarrier, setOpenCarrier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState(null);
  const [error, setError] = useState("");

  const subtotal = useMemo(
    () =>
      cart.reduce(
        (sum, item) =>
          sum + (Number(item.price) || 0) * (Number(item.quantity) || 0),
        0
      ),
    [cart]
  );

  const totalWeight = useMemo(
    () =>
      cart.reduce(
        (sum, item) =>
          sum + (Number(item.weight) || 0) * (Number(item.quantity) || 0),
        0
      ),
    [cart]
  );

  const totalDimensions = useMemo(
    () =>
      cart.reduce(
        (dimensions, item) => {
          const quantity = Number(item.quantity) || 0;
          return {
            length:
              dimensions.length + (Number(item.length) || 0) * quantity,
            width: Math.max(dimensions.width, Number(item.width) || 0),
            height: Math.max(dimensions.height, Number(item.height) || 0),
          };
        },
        { length: 0, width: 0, height: 0 }
      ),
    [cart]
  );

  const hasShipping = Number.isFinite(shippingCost);
  const taxRate = zipSubmitted ? getTaxRateForZip(receiverZip) : 0;
  const taxAmount = hasShipping
    ? (subtotal + shippingCost) * taxRate
    : 0;
  const grandTotal = hasShipping
    ? subtotal + shippingCost + taxAmount
    : subtotal;

  useEffect(() => {
    let mounted = true;

    const fetchCart = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await registerApi.post(CART_ITEMS_ENDPOINT, {
          sessionId,
        });
        const items = Array.isArray(response.data?.cartDetails)
          ? response.data.cartDetails
          : [];

        if (mounted) setCart(items);
      } catch (requestError) {
        console.error("Error loading cart:", requestError);
        if (mounted) {
          setError(
            requestError.response?.data?.message ||
              "We could not load your cart."
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchCart();
    return () => {
      mounted = false;
    };
  }, [sessionId]);

  const resetDeliverySelection = () => {
    setSelectedCarrier("");
    setSelectedService("");
    setShippingCost(null);
    setOpenCarrier(null);
  };

  const handleQuantityChange = async (item, nextQuantity) => {
    const maximum = Number(item.maxQuantity ?? item.max_quantity);
    const cappedMaximum = Number.isFinite(maximum) && maximum > 0
      ? maximum
      : Number.POSITIVE_INFINITY;
    const quantity = Math.min(
      cappedMaximum,
      Math.max(1, Number.parseInt(nextQuantity, 10) || 1)
    );
    const previousCart = cart;
    const updatedCart = cart.map((cartItem) =>
      cartItem.id === item.id ? { ...cartItem, quantity } : cartItem
    );

    setCart(updatedCart);
    setUpdatingItemId(item.id);
    resetDeliverySelection();

    try {
      await registerApi.post(CART_UPDATE_ENDPOINT, {
        sessionId,
        productId: item.id,
        quantity,
      });
      window.dispatchEvent(new Event("cartUpdated"));
    } catch (requestError) {
      console.error("Error updating quantity:", requestError);
      setCart(previousCart);
      setError(
        requestError.response?.data?.message ||
          "We could not update that quantity."
      );
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleDelete = async (item) => {
    const previousCart = cart;
    setCart((currentCart) =>
      currentCart.filter((cartItem) => cartItem.id !== item.id)
    );
    setUpdatingItemId(item.id);
    resetDeliverySelection();

    try {
      await registerApi.post(CART_DELETE_ENDPOINT, {
        sessionId,
        productId: item.id,
        quantity: 0,
      });
      window.dispatchEvent(new Event("cartUpdated"));
    } catch (requestError) {
      console.error("Error removing item:", requestError);
      setCart(previousCart);
      setError(
        requestError.response?.data?.message ||
          "We could not remove that item."
      );
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleZipSubmit = (event) => {
    event.preventDefault();
    const zip = receiverZip.trim();

    if (!/^\d{5}$/.test(zip)) {
      setError("Enter a valid 5-digit ZIP code.");
      return;
    }

    setError("");
    setReceiverZip(zip);
    setZipSubmitted(true);
    resetDeliverySelection();
  };

  const editZip = () => {
    setZipSubmitted(false);
    resetDeliverySelection();
  };

  const handleSelectShipping = (carrier, service, cost) => {
    const parsedCost = Number(cost);

    if (!Number.isFinite(parsedCost)) {
      setError("The selected shipping rate is invalid.");
      return;
    }

    setError("");
    setSelectedCarrier(carrier);
    setSelectedService(service);
    setShippingCost(parsedCost);
  };

  const shippingDetails = {
    shippingCost,
    selectedCarrier,
    selectedService,
    receiverZip,
    taxAmount,
    grandTotal,
  };

  const storeCheckoutState = async () => {
    const detailsWithTimestamp = {
      ...shippingDetails,
      timestamp: Date.now(),
    };

    await registerApi.post(SHIPPING_UPDATE_ENDPOINT, {
      sessionId,
      shippingDetails: detailsWithTimestamp,
    });

    Cookies.set("checkoutType", "cart", cookieOptions);
    Cookies.set(
      "shippingDetails",
      JSON.stringify(detailsWithTimestamp),
      cookieOptions
    );
    Cookies.remove("pendingTicketCheckout", { path: "/" });

    return detailsWithTimestamp;
  };

  const startStripeCheckout = async (details) => {
    const response = await registerApi.post(CHECKOUT_ENDPOINT, {
      sessionId,
      metadata: {
        hasAcceptedPrivacy: true,
        hasAcceptedTermsOfService: true,
        ...details,
      },
    });
    const checkoutUrl = getCheckoutUrl(response);

    if (!checkoutUrl) {
      throw new Error("Checkout URL was not returned.");
    }

    Cookies.remove("checkoutType", { path: "/" });
    Cookies.remove("pendingTicketCheckout", { path: "/" });
    window.location.assign(checkoutUrl);
  };

  const handleCheckoutChoice = async (choice) => {
    if (!hasShipping || !selectedCarrier) {
      setError("Select a shipping option before checking out.");
      setActiveStep("delivery");
      return;
    }

    try {
      setProcessing(true);
      setError("");
      const details = await storeCheckoutState();
      const acceptedPrivacy = Cookies.get("hasAcceptedPrivacy") === "true";
      const acceptedTerms = Cookies.get("hasAcceptedTerms") === "true";

      if (acceptedPrivacy && acceptedTerms) {
        await startStripeCheckout(details);
        return;
      }

      if (choice === "signup") {
        navigate("/sign-up");
      } else if (choice === "login") {
        navigate("/login");
      } else {
        navigate("/accept-privacy-terms");
      }
    } catch (requestError) {
      console.error("Checkout could not be started:", requestError);
      setError(
        requestError.response?.data?.message ||
          requestError.message ||
          "Checkout could not be started. Please try again."
      );
    } finally {
      setProcessing(false);
    }
  };

  const activeStepIndex = steps.findIndex((step) => step.id === activeStep);

  const goToStep = (stepId) => {
    const nextIndex = steps.findIndex((step) => step.id === stepId);
    const deliveryUnlocked = cart.length > 0;
    const reviewUnlocked = deliveryUnlocked && hasShipping;
    const checkoutUnlocked = reviewUnlocked;

    if (
      nextIndex === 0 ||
      (nextIndex === 1 && deliveryUnlocked) ||
      (nextIndex === 2 && reviewUnlocked) ||
      (nextIndex === 3 && checkoutUnlocked)
    ) {
      setError("");
      setActiveStep(stepId);
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    }
  };

  if (loading && cart.length === 0) {
    return (
      <main className="bb-checkout-page">
        <div className="bb-checkout-state" aria-live="polite">
          <span className="bb-checkout-spinner" aria-hidden="true" />
          <h1>Loading your cart</h1>
          <p>Getting everything ready for checkout.</p>
        </div>
      </main>
    );
  }

  if (!loading && cart.length === 0) {
    return (
      <main className="bb-checkout-page">
        <div className="bb-checkout-state">
          <span className="bb-checkout-state-icon" aria-hidden="true">
            B
          </span>
          <span className="bb-checkout-eyebrow">Your basket</span>
          <h1>Your cart is empty</h1>
          <p>Add something you love and come back when you are ready.</p>
          {error && (
            <p className="bb-checkout-alert" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className="bb-checkout-button bb-checkout-button--primary"
            onClick={() => navigate("/store")}
          >
            Browse the store
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="bb-checkout-page">
      <div className="bb-checkout-shell">
        <header className="bb-checkout-header">
          <div>
            <span className="bb-checkout-eyebrow">Secure checkout</span>
            <h1>Your order</h1>
            <p>Review your cart, choose delivery, and continue securely.</p>
          </div>
          <button
            type="button"
            className="bb-checkout-text-button"
            onClick={() => navigate("/store")}
          >
            Continue shopping
          </button>
        </header>

        <nav className="bb-checkout-steps" aria-label="Checkout progress">
          {steps.map((step, index) => {
            const complete = index < activeStepIndex;
            const active = step.id === activeStep;
            const locked =
              (step.id === "review" || step.id === "checkout") && !hasShipping;

            return (
              <button
                type="button"
                key={step.id}
                className={[
                  "bb-checkout-step",
                  active ? "bb-checkout-step--active" : "",
                  complete ? "bb-checkout-step--complete" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => goToStep(step.id)}
                disabled={locked}
                aria-current={active ? "step" : undefined}
              >
                <span>{complete ? "✓" : index + 1}</span>
                {step.label}
              </button>
            );
          })}
        </nav>

        {error && (
          <p className="bb-checkout-alert" role="alert">
            {error}
          </p>
        )}

        <div className="bb-checkout-layout">
          <section className="bb-checkout-workspace">
            <AnimatePresence mode="wait" initial={false}>
              {activeStep === "cart" && (
                <motion.div
                  key="cart"
                  {...(reduceMotion ? {} : panelMotion)}
                  className="bb-checkout-panel"
                >
                  <div className="bb-checkout-panel-heading">
                    <div>
                      <span className="bb-checkout-eyebrow">Step 1</span>
                      <h2>Review your cart</h2>
                    </div>
                    <span>{cart.length} {cart.length === 1 ? "item" : "items"}</span>
                  </div>

                  <div className="bb-checkout-items">
                    {cart.map((item) => {
                      const quantity = Number(item.quantity) || 1;
                      const itemPrice = Number(item.price) || 0;

                      return (
                        <article className="bb-checkout-item" key={item.id}>
                          <div className="bb-checkout-item-image-wrap">
                            {item.thumbnail ? (
                              <img
                                src={getImageUrl(item.thumbnail)}
                                alt={item.name}
                                className="bb-checkout-item-image"
                              />
                            ) : (
                              <span aria-hidden="true">B</span>
                            )}
                          </div>

                          <div className="bb-checkout-item-copy">
                            <h3>{item.name}</h3>
                            <p>${money(itemPrice)} each</p>
                            <strong>${money(itemPrice * quantity)}</strong>
                          </div>

                          <div className="bb-checkout-item-controls">
                            <div className="bb-checkout-inline-quantity">
                              <button
                                type="button"
                                aria-label={`Decrease ${item.name} quantity`}
                                disabled={
                                  quantity <= 1 || updatingItemId === item.id
                                }
                                onClick={() =>
                                  handleQuantityChange(item, quantity - 1)
                                }
                              >
                                −
                              </button>
                              <input
                                type="number"
                                min="1"
                                value={quantity}
                                aria-label={`${item.name} quantity`}
                                disabled={updatingItemId === item.id}
                                onChange={(event) =>
                                  handleQuantityChange(item, event.target.value)
                                }
                              />
                              <button
                                type="button"
                                aria-label={`Increase ${item.name} quantity`}
                                disabled={updatingItemId === item.id}
                                onClick={() =>
                                  handleQuantityChange(item, quantity + 1)
                                }
                              >
                                +
                              </button>
                            </div>
                            <button
                              type="button"
                              className="bb-checkout-remove"
                              onClick={() => handleDelete(item)}
                              disabled={updatingItemId === item.id}
                            >
                              Remove
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <div className="bb-checkout-panel-actions">
                    <button
                      type="button"
                      className="bb-checkout-button bb-checkout-button--primary"
                      onClick={() => goToStep("delivery")}
                    >
                      Continue to delivery
                    </button>
                  </div>
                </motion.div>
              )}

              {activeStep === "delivery" && (
                <motion.div
                  key="delivery"
                  {...(reduceMotion ? {} : panelMotion)}
                  className="bb-checkout-panel"
                >
                  <div className="bb-checkout-panel-heading">
                    <div>
                      <span className="bb-checkout-eyebrow">Step 2</span>
                      <h2>Choose delivery</h2>
                    </div>
                  </div>

                  <form className="bb-checkout-zip-form" onSubmit={handleZipSubmit}>
                    <label htmlFor="bb-checkout-zip">Delivery ZIP code</label>
                    <div>
                      <input
                        id="bb-checkout-zip"
                        type="text"
                        inputMode="numeric"
                        autoComplete="postal-code"
                        maxLength={5}
                        value={receiverZip}
                        disabled={zipSubmitted}
                        placeholder="80521"
                        onChange={(event) =>
                          setReceiverZip(
                            event.target.value.replace(/\D/g, "").slice(0, 5)
                          )
                        }
                      />
                      {zipSubmitted ? (
                        <button
                          type="button"
                          className="bb-checkout-button bb-checkout-button--secondary"
                          onClick={editZip}
                        >
                          Edit ZIP
                        </button>
                      ) : (
                        <button
                          type="submit"
                          className="bb-checkout-button bb-checkout-button--primary"
                        >
                          Find rates
                        </button>
                      )}
                    </div>
                    <p>Used to calculate available shipping and estimated tax.</p>
                  </form>

                  {zipSubmitted && (
                    <div className="bb-checkout-rates">
                      <div className="bb-checkout-rates-heading">
                        <h3>Available shipping</h3>
                        {hasShipping && (
                          <span>
                            Selected: {selectedCarrier} {selectedService}
                          </span>
                        )}
                      </div>
                      <UPSRates
                        receiverZip={receiverZip}
                        totalWeight={totalWeight}
                        totalDimensions={totalDimensions}
                        onSelectRate={(service, cost) =>
                          handleSelectShipping("UPS", service, cost)
                        }
                        isOpen={openCarrier === "UPS"}
                        onToggle={() =>
                          setOpenCarrier(openCarrier === "UPS" ? null : "UPS")
                        }
                      />
                    </div>
                  )}

                  <div className="bb-checkout-panel-actions">
                    <button
                      type="button"
                      className="bb-checkout-button bb-checkout-button--secondary"
                      onClick={() => goToStep("cart")}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      className="bb-checkout-button bb-checkout-button--primary"
                      disabled={!hasShipping}
                      onClick={() => goToStep("review")}
                    >
                      Review order
                    </button>
                  </div>
                </motion.div>
              )}

              {activeStep === "review" && (
                <motion.div
                  key="review"
                  {...(reduceMotion ? {} : panelMotion)}
                  className="bb-checkout-panel"
                >
                  <div className="bb-checkout-panel-heading">
                    <div>
                      <span className="bb-checkout-eyebrow">Step 3</span>
                      <h2>Review your order</h2>
                    </div>
                  </div>

                  <dl className="bb-checkout-review-list">
                    {cart.map((item) => (
                      <div key={item.id}>
                        <dt>
                          {item.quantity} × {item.name}
                        </dt>
                        <dd>
                          $
                          {money(
                            (Number(item.price) || 0) *
                              (Number(item.quantity) || 0)
                          )}
                        </dd>
                      </div>
                    ))}
                    <div>
                      <dt>Delivery</dt>
                      <dd>
                        {selectedCarrier} {selectedService} · ${money(shippingCost)}
                      </dd>
                    </div>
                    <div>
                      <dt>ZIP code</dt>
                      <dd>{receiverZip}</dd>
                    </div>
                  </dl>

                  <div className="bb-checkout-panel-actions">
                    <button
                      type="button"
                      className="bb-checkout-button bb-checkout-button--secondary"
                      onClick={() => goToStep("delivery")}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      className="bb-checkout-button bb-checkout-button--primary"
                      onClick={() => goToStep("checkout")}
                    >
                      Continue
                    </button>
                  </div>
                </motion.div>
              )}

              {activeStep === "checkout" && (
                <motion.div
                  key="checkout"
                  {...(reduceMotion ? {} : panelMotion)}
                  className="bb-checkout-panel"
                >
                  <div className="bb-checkout-panel-heading">
                    <div>
                      <span className="bb-checkout-eyebrow">Step 4</span>
                      <h2>How would you like to continue?</h2>
                    </div>
                  </div>

                  <div className="bb-checkout-choice-grid">
                    <button
                      type="button"
                      onClick={() => handleCheckoutChoice("guest")}
                      disabled={processing}
                    >
                      <span>Fastest</span>
                      <strong>Guest checkout</strong>
                      <small>Continue without signing in.</small>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCheckoutChoice("signup")}
                      disabled={processing}
                    >
                      <span>New here?</span>
                      <strong>Create an account</strong>
                      <small>Save access to orders and account features.</small>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCheckoutChoice("login")}
                      disabled={processing}
                    >
                      <span>Welcome back</span>
                      <strong>Log in</strong>
                      <small>Continue with your existing account.</small>
                    </button>
                  </div>

                  {processing && (
                    <p className="bb-checkout-processing" aria-live="polite">
                      <span className="bb-checkout-spinner" aria-hidden="true" />
                      Preparing secure checkout…
                    </p>
                  )}

                  <div className="bb-checkout-panel-actions">
                    <button
                      type="button"
                      className="bb-checkout-button bb-checkout-button--secondary"
                      onClick={() => goToStep("review")}
                      disabled={processing}
                    >
                      Back
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          <aside className="bb-checkout-summary" aria-label="Order total">
            <span className="bb-checkout-eyebrow">Order summary</span>
            <h2>${money(grandTotal)}</h2>
            <dl>
              <div>
                <dt>Subtotal</dt>
                <dd>${money(subtotal)}</dd>
              </div>
              <div>
                <dt>Shipping</dt>
                <dd>{hasShipping ? `$${money(shippingCost)}` : "Select rate"}</dd>
              </div>
              <div>
                <dt>Estimated tax</dt>
                <dd>{hasShipping ? `$${money(taxAmount)}` : "—"}</dd>
              </div>
              <div className="bb-checkout-summary-total">
                <dt>Total</dt>
                <dd>${money(grandTotal)}</dd>
              </div>
            </dl>
            <p>
              Secure checkout. Final payment is completed through Stripe.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
};

export default CartCheckoutFlow;
