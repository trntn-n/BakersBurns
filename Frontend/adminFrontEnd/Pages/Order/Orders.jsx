import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";

import { adminApi } from "../../config/axios";

import "./orders.css";

const CARRIERS = ["UPS", "FedEx", "USPS", "DHL"];
const PROCESSING_STATUS = "processing";

const EMPTY_ORDER = {
  username: "",
  shippingAddress: "",
  trackingNumber: "",
  carrier: "",
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const formatMoney = (value) => {
  const amount = Number(value);
  return money.format(Number.isFinite(amount) ? amount : 0);
};

const getErrorMessage = (error, fallback) =>
  error?.response?.data?.message ||
  error?.response?.data?.error ||
  fallback;

const getImageUrl = (thumbnail) => {
  if (!thumbnail) return "";
  const backend = (
    import.meta.env.VITE_IMAGE_BASE_URL ||
    import.meta.env.VITE_BACKEND ||
    ""
  ).replace(/\/+$/, "");
  return `${backend}/uploads/${encodeURIComponent(thumbnail)}`;
};

const getTrackingUrl = (carrier, trackingNumber) => {
  const encoded = encodeURIComponent(trackingNumber.trim());
  const links = {
    UPS: `https://www.ups.com/track?tracknum=${encoded}`,
    FedEx: `https://www.fedex.com/fedextrack/?trknbr=${encoded}`,
    USPS: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encoded}`,
    DHL: `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encoded}`,
  };
  return links[carrier] || null;
};

const StatusPill = ({ status }) => {
  const normalized = String(status || "unknown").toLowerCase();
  return (
    <span
      className={`bb-orders-status bb-orders-status--${normalized.replace(
        /[^a-z0-9-]/g,
        "-"
      )}`}
    >
      <span aria-hidden="true" />
      {status || "Unknown"}
    </span>
  );
};

const LoadingState = ({ label = "Loading…" }) => (
  <div className="bb-orders-loading" role="status">
    <span className="bb-orders-spinner" aria-hidden="true" />
    {label}
  </div>
);

const EmptyState = ({ search, onAdd }) => (
  <motion.div
    className="bb-orders-empty"
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
  >
    <span className="bb-orders-empty-icon" aria-hidden="true">
      ◇
    </span>
    <h2>{search ? "No matching orders" : "No orders yet"}</h2>
    <p>
      {search
        ? "Try a different order number, customer, status, or tracking number."
        : "Create the first manual order to begin managing it here."}
    </p>
    {!search && (
      <button
        type="button"
        className="bb-orders-button bb-orders-button--primary"
        onClick={onAdd}
      >
        Create order
      </button>
    )}
  </motion.div>
);

const TrackingEditor = ({
  orderId,
  initialTrackingNumber = "",
  initialCarrier = "",
  onUpdated,
}) => {
  const [trackingNumber, setTrackingNumber] = useState(
    initialTrackingNumber || ""
  );
  const [carrier, setCarrier] = useState(initialCarrier || "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing) {
      setTrackingNumber(initialTrackingNumber || "");
      setCarrier(initialCarrier || "");
    }
  }, [editing, initialCarrier, initialTrackingNumber]);

  const cancel = () => {
    setTrackingNumber(initialTrackingNumber || "");
    setCarrier(initialCarrier || "");
    setError("");
    setEditing(false);
  };

  const save = async () => {
    const cleanTrackingNumber = trackingNumber.trim();
    if (!cleanTrackingNumber || !carrier) {
      setError("Choose a carrier and enter a tracking number.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      await adminApi.put(`/orders/update-tracking/${orderId}`, {
        trackingNumber: cleanTrackingNumber,
        carrier,
      });
      onUpdated(cleanTrackingNumber, carrier);
      setEditing(false);
    } catch (requestError) {
      console.error("Unable to update tracking:", requestError);
      setError(
        getErrorMessage(
          requestError,
          "Tracking could not be updated. Please try again."
        )
      );
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="bb-orders-tracking-editor">
        <div className="bb-orders-field">
          <label htmlFor={`carrier-${orderId}`}>Carrier</label>
          <select
            id={`carrier-${orderId}`}
            value={carrier}
            onChange={(event) => setCarrier(event.target.value)}
            disabled={saving}
          >
            <option value="">Choose carrier</option>
            {CARRIERS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="bb-orders-field">
          <label htmlFor={`tracking-${orderId}`}>Tracking number</label>
          <input
            id={`tracking-${orderId}`}
            value={trackingNumber}
            onChange={(event) =>
              setTrackingNumber(event.target.value)
            }
            placeholder="Enter tracking number"
            autoComplete="off"
            disabled={saving}
          />
        </div>

        {error && (
          <p className="bb-orders-inline-error" role="alert">
            {error}
          </p>
        )}

        <div className="bb-orders-inline-actions">
          <button
            type="button"
            className="bb-orders-button bb-orders-button--ghost"
            onClick={cancel}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="bb-orders-button bb-orders-button--primary"
            onClick={save}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save tracking"}
          </button>
        </div>
      </div>
    );
  }

  if (!trackingNumber) {
    return (
      <button
        type="button"
        className="bb-orders-add-tracking"
        onClick={() => setEditing(true)}
      >
        <span aria-hidden="true">＋</span>
        Add shipment tracking
      </button>
    );
  }

  const trackingUrl = getTrackingUrl(carrier, trackingNumber);

  return (
    <div className="bb-orders-tracking">
      <div>
        <span className="bb-orders-meta-label">Shipment</span>
        <strong>{carrier || "Carrier not selected"}</strong>
        <span>{trackingNumber}</span>
      </div>
      <div className="bb-orders-tracking-actions">
        {trackingUrl && (
          <a
            className="bb-orders-text-link"
            href={trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Track package ↗
          </a>
        )}
        <button
          type="button"
          className="bb-orders-icon-button"
          onClick={() => setEditing(true)}
          aria-label={`Edit tracking for order ${orderId}`}
          title="Edit tracking"
        >
          ✎
        </button>
      </div>
    </div>
  );
};

const EditOrderForm = ({
  editingOrder,
  setEditingOrder,
  updateOrder,
  deleteOrder,
  onCancel,
}) => {
  const [saving, setSaving] = useState(false);

  const updateField = (event) => {
    const { name, value } = event.target;
    setEditingOrder((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const save = async () => {
    try {
      setSaving(true);
      await updateOrder(editingOrder.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bb-orders-edit-form">
      <div className="bb-orders-section-heading">
        <div>
          <h3>Edit order #{editingOrder.id}</h3>
          <p>Update fulfillment and order information.</p>
        </div>
      </div>

      <div className="bb-orders-form-grid">
        <div className="bb-orders-field">
          <label htmlFor={`edit-status-${editingOrder.id}`}>
            Status
          </label>
          <select
            id={`edit-status-${editingOrder.id}`}
            name="status"
            value={editingOrder.status || ""}
            onChange={updateField}
            disabled={saving}
          >
            <option value="">Choose status</option>
            <option value="processing">Processing</option>
            <option value="shipped">Shipped</option>
            <option value="completed">Completed</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>

        <div className="bb-orders-field">
          <label htmlFor={`edit-total-${editingOrder.id}`}>
            Total
          </label>
          <input
            id={`edit-total-${editingOrder.id}`}
            type="number"
            name="total"
            min="0"
            step="0.01"
            value={editingOrder.total ?? ""}
            onChange={updateField}
            disabled={saving}
          />
        </div>

        <div className="bb-orders-field">
          <label htmlFor={`edit-carrier-${editingOrder.id}`}>
            Carrier
          </label>
          <select
            id={`edit-carrier-${editingOrder.id}`}
            name="carrier"
            value={editingOrder.carrier || ""}
            onChange={updateField}
            disabled={saving}
          >
            <option value="">Not assigned</option>
            {CARRIERS.map((carrier) => (
              <option key={carrier} value={carrier}>
                {carrier}
              </option>
            ))}
          </select>
        </div>

        <div className="bb-orders-field">
          <label htmlFor={`edit-tracking-${editingOrder.id}`}>
            Tracking number
          </label>
          <input
            id={`edit-tracking-${editingOrder.id}`}
            name="trackingNumber"
            value={editingOrder.trackingNumber || ""}
            onChange={updateField}
            disabled={saving}
          />
        </div>

        <div className="bb-orders-field bb-orders-field--wide">
          <label htmlFor={`edit-shipping-${editingOrder.id}`}>
            Shipping address
          </label>
          <textarea
            id={`edit-shipping-${editingOrder.id}`}
            name="shippingAddress"
            value={
              typeof editingOrder.shippingAddress === "string"
                ? editingOrder.shippingAddress
                : ""
            }
            onChange={updateField}
            rows="3"
            disabled={saving}
            placeholder={
              typeof editingOrder.shippingAddress === "object"
                ? "This structured address can be viewed in order details."
                : ""
            }
          />
        </div>
      </div>

      <div className="bb-orders-edit-actions">
        <button
          type="button"
          className="bb-orders-button bb-orders-button--danger"
          onClick={() => deleteOrder(editingOrder.id)}
          disabled={saving}
        >
          Delete order
        </button>
        <div>
          <button
            type="button"
            className="bb-orders-button bb-orders-button--ghost"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="bb-orders-button bb-orders-button--primary"
            onClick={save}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
};

const formatAddress = (address) => {
  if (!address) return ["Not available"];
  if (typeof address === "string") return [address];

  return [
    address.line1,
    address.line2,
    [address.city, address.state, address.postal_code]
      .filter(Boolean)
      .join(", ")
      .replace(/, ([^,]+)$/, " $1"),
    address.country,
  ].filter(Boolean);
};

const OrderDetailsModal = ({ orderId, onClose }) => {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await adminApi.get(
          `/orders/${orderId}/details`
        );
        if (active) setOrder(response.data?.order || null);
      } catch (requestError) {
        console.error("Unable to load order details:", requestError);
        if (active) {
          setError(
            getErrorMessage(
              requestError,
              "Order details could not be loaded."
            )
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [orderId]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () =>
      document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const items = Array.isArray(order?.items) ? order.items : [];

  return (
    <motion.div
      className="bb-orders-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.section
        className="bb-orders-modal bb-orders-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bb-orders-details-title"
        initial={{ opacity: 0, y: 18, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.99 }}
      >
        <header className="bb-orders-modal-header">
          <div>
            <span className="bb-orders-eyebrow">
              Order #{orderId}
            </span>
            <h2 id="bb-orders-details-title">Order details</h2>
            <p>
              Customer, fulfillment, addresses, and purchased
              items.
            </p>
          </div>
          <button
            type="button"
            className="bb-orders-close"
            onClick={onClose}
            aria-label="Close order details"
          >
            ×
          </button>
        </header>

        {loading ? (
          <LoadingState label="Loading order details…" />
        ) : error || !order ? (
          <div className="bb-orders-error" role="alert">
            <span aria-hidden="true">!</span>
            {error || "Order details were not found."}
          </div>
        ) : (
          <div className="bb-orders-details-content">
            <div className="bb-orders-details-summary">
              <article>
                <span>Status</span>
                <StatusPill status={order.status} />
              </article>
              <article>
                <span>Total</span>
                <strong>{formatMoney(order.total)}</strong>
              </article>
              <article>
                <span>Customer</span>
                <strong>
                  {order.user?.username ||
                    order.username ||
                    "Guest customer"}
                </strong>
                <small>{order.user?.email || order.email || ""}</small>
              </article>
            </div>

            <div className="bb-orders-details-grid">
              <section className="bb-orders-details-panel">
                <h3>Shipping address</h3>
                <address>
                  {formatAddress(order.shippingAddress).map(
                    (line, index) => (
                      <span key={`${line}-${index}`}>{line}</span>
                    )
                  )}
                </address>
              </section>
              <section className="bb-orders-details-panel">
                <h3>Billing address</h3>
                <address>
                  {order.billingAddress
                    ? formatAddress(order.billingAddress).map(
                        (line, index) => (
                          <span key={`${line}-${index}`}>
                            {line}
                          </span>
                        )
                      )
                    : "Same as shipping address"}
                </address>
              </section>
            </div>

            <section className="bb-orders-details-panel">
              <h3>Shipment</h3>
              <TrackingEditor
                orderId={orderId}
                initialTrackingNumber={order.trackingNumber}
                initialCarrier={order.carrier}
                onUpdated={(trackingNumber, carrier) =>
                  setOrder((current) => ({
                    ...current,
                    trackingNumber,
                    carrier,
                  }))
                }
              />
            </section>

            <section className="bb-orders-details-panel">
              <div className="bb-orders-section-heading">
                <div>
                  <h3>Purchased items</h3>
                  <p>{items.length} line item(s)</p>
                </div>
              </div>
              <div className="bb-orders-table-wrap">
                <table className="bb-orders-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Quantity</th>
                      <th>Price</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => {
                      const product = item.product || {};
                      const price = Number(
                        item.price ?? product.price ?? 0
                      );
                      const quantity = Number(item.quantity) || 0;
                      return (
                        <tr
                          key={`${item.productId || product.id || index}-${index}`}
                        >
                          <td>
                            <div className="bb-orders-table-product">
                              <span className="bb-orders-product-image">
                                {product.thumbnail ? (
                                  <img
                                    src={getImageUrl(product.thumbnail)}
                                    alt=""
                                  />
                                ) : (
                                  "◇"
                                )}
                              </span>
                              <strong>
                                {product.name ||
                                  item.name ||
                                  "Product"}
                              </strong>
                            </div>
                          </td>
                          <td>{quantity}</td>
                          <td>{formatMoney(price)}</td>
                          <td>
                            <strong>
                              {formatMoney(quantity * price)}
                            </strong>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </motion.section>
    </motion.div>
  );
};

const QuickProductModal = ({ onClose, onProductAdded }) => {
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    thumbnail: null,
  });
  const [preview, setPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview]
  );

  const changeThumbnail = (event) => {
    const file = event.target.files?.[0] || null;
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : "");
    setForm((current) => ({ ...current, thumbnail: file }));
  };

  const save = async (event) => {
    event.preventDefault();
    const price = Number(form.price);

    if (
      !form.name.trim() ||
      !form.description.trim() ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      setError(
        "Product name, description, and a price greater than zero are required."
      );
      return;
    }

    try {
      setSaving(true);
      setError("");
      const formData = new FormData();
      formData.append("name", form.name.trim());
      formData.append("description", form.description.trim());
      formData.append("price", String(price));
      formData.append("quantity", "0");
      if (form.thumbnail) {
        formData.append(
          "thumbnail",
          form.thumbnail,
          form.thumbnail.name
        );
      }

      const response = await adminApi.post(
        "/orders/quick-add-product",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );
      await onProductAdded(response.data);
      onClose();
    } catch (requestError) {
      console.error("Unable to create quick product:", requestError);
      setError(
        getErrorMessage(
          requestError,
          "The product could not be created."
        )
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bb-orders-nested-backdrop">
      <motion.form
        className="bb-orders-quick-product"
        onSubmit={save}
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
      >
        <header className="bb-orders-modal-header">
          <div>
            <span className="bb-orders-eyebrow">Order-only item</span>
            <h2>Create product</h2>
            <p>
              This shortcut creates a zero-inventory product for
              manually handled transactions.
            </p>
          </div>
          <button
            type="button"
            className="bb-orders-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close product form"
          >
            ×
          </button>
        </header>

        <div className="bb-orders-quick-product-content">
          <div className="bb-orders-field">
            <label htmlFor="bb-quick-product-name">
              Product name
            </label>
            <input
              id="bb-quick-product-name"
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              required
            />
          </div>
          <div className="bb-orders-field">
            <label htmlFor="bb-quick-product-price">Price</label>
            <input
              id="bb-quick-product-price"
              type="number"
              min="0.01"
              step="0.01"
              value={form.price}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  price: event.target.value,
                }))
              }
              required
            />
          </div>
          <div className="bb-orders-field bb-orders-field--wide">
            <label htmlFor="bb-quick-product-description">
              Description
            </label>
            <textarea
              id="bb-quick-product-description"
              rows="3"
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              required
            />
          </div>
          <div className="bb-orders-field bb-orders-field--wide">
            <label htmlFor="bb-quick-product-thumbnail">
              Thumbnail
            </label>
            <input
              id="bb-quick-product-thumbnail"
              type="file"
              accept="image/*"
              onChange={changeThumbnail}
            />
          </div>
          {preview && (
            <img
              className="bb-orders-upload-preview"
              src={preview}
              alt="Selected product thumbnail preview"
            />
          )}
          <p className="bb-orders-product-note">
            Inventory is intentionally set to 0. Use Product
            Manager when creating a normal storefront product.
          </p>
        </div>

        {error && (
          <div className="bb-orders-error" role="alert">
            <span aria-hidden="true">!</span>
            {error}
          </div>
        )}

        <footer className="bb-orders-modal-footer">
          <span />
          <div>
            <button
              type="button"
              className="bb-orders-button bb-orders-button--ghost"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bb-orders-button bb-orders-button--primary"
              disabled={saving}
            >
              {saving ? "Creating…" : "Create product"}
            </button>
          </div>
        </footer>
      </motion.form>
    </div>
  );
};

const OrderSummary = ({ orderId }) => {
  const [orderDetails, setOrderDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await adminApi.get(
          `/orders/${orderId}/details`
        );
        if (active) {
          setOrderDetails(response.data?.order || null);
        }
      } catch (requestError) {
        console.error("Unable to load order summary:", requestError);
        if (active) {
          setError(
            getErrorMessage(
              requestError,
              "Order items could not be loaded."
            )
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [orderId]);

  if (loading) {
    return <LoadingState label="Loading items…" />;
  }

  if (error) {
    return (
      <p className="bb-orders-inline-error" role="alert">
        {error}
      </p>
    );
  }

  const items = Array.isArray(orderDetails?.items)
    ? orderDetails.items
    : [];

  if (!items.length) {
    return (
      <p className="bb-orders-muted">No item details available.</p>
    );
  }

  return (
    <div className="bb-orders-items" aria-label="Order items">
      {items.map((item, index) => {
        const product = item.product || {};
        const thumbnail = getImageUrl(product.thumbnail);
        return (
          <div
            className="bb-orders-item"
            key={`${item.productId || product.id || "item"}-${index}`}
          >
            <div className="bb-orders-thumbnail">
              {thumbnail ? (
                <img
                  src={thumbnail}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <span aria-hidden="true">◇</span>
              )}
              <b aria-label={`Quantity ${item.quantity || 1}`}>
                {item.quantity || 1}
              </b>
            </div>
            <div>
              <strong>{product.name || item.name || "Product"}</strong>
              {item.price != null && (
                <span>{formatMoney(item.price)}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const AddOrderModal = ({ onClose, onCreated }) => {
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [form, setForm] = useState({ ...EMPTY_ORDER });
  const [manualOverride, setManualOverride] = useState(false);
  const [manualTotal, setManualTotal] = useState(0);
  const [productCreatorOpen, setProductCreatorOpen] =
    useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadOptions = useCallback(async () => {
    try {
      setLoadingOptions(true);
      setError("");
      const [usersResponse, productsResponse] = await Promise.all([
        adminApi.get("/orders/get-users"),
        adminApi.get("/products"),
      ]);
      setUsers(usersResponse.data?.users || []);
      setProducts(
        (productsResponse.data || []).map((product) => ({
          id: product.id,
          name: product.name,
          price: Number(product.price) || 0,
          thumbnail: product.thumbnail,
        }))
      );
    } catch (requestError) {
      console.error("Unable to load order options:", requestError);
      setError(
        getErrorMessage(
          requestError,
          "Customers or products could not be loaded."
        )
      );
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () =>
      document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, saving]);

  const productTotal = useMemo(
    () =>
      selectedProducts.reduce(
        (total, product) =>
          total + product.price * product.quantity,
        0
      ),
    [selectedProducts]
  );

  const orderTotal = manualOverride
    ? Number(manualTotal) || 0
    : productTotal;

  const availableProducts = useMemo(() => {
    const selectedIds = new Set(
      selectedProducts.map((product) => product.id)
    );
    return products.filter(
      (product) => !selectedIds.has(product.id)
    );
  }, [products, selectedProducts]);

  const selectProduct = (product) => {
    setSelectedProducts((current) => [
      ...current,
      { ...product, quantity: 1 },
    ]);
  };

  const removeProduct = (productId) => {
    setSelectedProducts((current) =>
      current.filter((product) => product.id !== productId)
    );
  };

  const changeQuantity = (productId, change) => {
    setSelectedProducts((current) =>
      current.map((product) =>
        product.id === productId
          ? {
              ...product,
              quantity: Math.max(1, product.quantity + change),
            }
          : product
      )
    );
  };

  const createOrder = async (event) => {
    event.preventDefault();

    if (!form.username) {
      setError("Select a customer.");
      return;
    }
    if (!selectedProducts.length) {
      setError("Add at least one product.");
      return;
    }
    if (
      (form.trackingNumber && !form.carrier) ||
      (!form.trackingNumber && form.carrier)
    ) {
      setError(
        "Carrier and tracking number must be entered together."
      );
      return;
    }

    try {
      setSaving(true);
      setError("");
      await adminApi.post("/orders/create", {
        ...form,
        trackingNumber: form.trackingNumber.trim(),
        shippingAddress: form.shippingAddress.trim(),
        orderItems: selectedProducts.map((product) => ({
          productId: product.id,
          quantity: product.quantity,
          price: product.price,
          name: product.name,
        })),
        total: orderTotal,
      });
      await onCreated();
      onClose();
    } catch (requestError) {
      console.error("Unable to create order:", requestError);
      setError(
        getErrorMessage(
          requestError,
          "The order could not be created."
        )
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      className="bb-orders-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) {
          onClose();
        }
      }}
    >
      <motion.form
        className="bb-orders-modal bb-orders-create-modal"
        onSubmit={createOrder}
        initial={{ opacity: 0, y: 18, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.99 }}
      >
        <header className="bb-orders-modal-header">
          <div>
            <span className="bb-orders-eyebrow">Manual order</span>
            <h2>Create a new order</h2>
            <p>Add the customer, products, and shipment details.</p>
          </div>
          <button
            type="button"
            className="bb-orders-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close create order form"
          >
            ×
          </button>
        </header>

        {loadingOptions ? (
          <LoadingState label="Loading customers and products…" />
        ) : (
          <div className="bb-orders-create-layout">
            <section className="bb-orders-form-panel">
              <h3>Order information</h3>
              <div className="bb-orders-form-grid">
                <div className="bb-orders-field bb-orders-field--wide">
                  <label htmlFor="bb-order-customer">Customer</label>
                  <select
                    id="bb-order-customer"
                    value={form.username}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        username: event.target.value,
                      }))
                    }
                    required
                  >
                    <option value="">Choose a customer</option>
                    {users.map((user) => (
                      <option
                        key={`${user.id}-${user.username}`}
                        value={user.username}
                      >
                        {user.username}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bb-orders-field">
                  <label htmlFor="bb-order-carrier">Carrier</label>
                  <select
                    id="bb-order-carrier"
                    value={form.carrier}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        carrier: event.target.value,
                      }))
                    }
                  >
                    <option value="">Not assigned</option>
                    {CARRIERS.map((carrier) => (
                      <option key={carrier} value={carrier}>
                        {carrier}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bb-orders-field">
                  <label htmlFor="bb-order-tracking">
                    Tracking number
                  </label>
                  <input
                    id="bb-order-tracking"
                    value={form.trackingNumber}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        trackingNumber: event.target.value,
                      }))
                    }
                    placeholder="Optional"
                  />
                </div>

                <div className="bb-orders-field bb-orders-field--wide">
                  <label htmlFor="bb-order-address">
                    Shipping address
                  </label>
                  <textarea
                    id="bb-order-address"
                    value={form.shippingAddress}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        shippingAddress: event.target.value,
                      }))
                    }
                    rows="3"
                    placeholder="Street, city, state, and ZIP"
                  />
                </div>
              </div>

              <label className="bb-orders-toggle">
                <input
                  type="checkbox"
                  checked={manualOverride}
                  onChange={(event) => {
                    setManualOverride(event.target.checked);
                    setManualTotal(productTotal);
                  }}
                />
                <span aria-hidden="true" />
                Override calculated total
              </label>

              {manualOverride && (
                <div className="bb-orders-field">
                  <label htmlFor="bb-order-total">
                    Custom total
                  </label>
                  <input
                    id="bb-order-total"
                    type="number"
                    min="0"
                    step="0.01"
                    value={manualTotal}
                    onChange={(event) =>
                      setManualTotal(event.target.value)
                    }
                  />
                </div>
              )}
            </section>

            <section className="bb-orders-product-panel">
              <div className="bb-orders-section-heading">
                <div>
                  <h3>Products</h3>
                  <p>Select products to add to this order.</p>
                </div>
                <button
                  type="button"
                  className="bb-orders-text-button"
                  onClick={() => setProductCreatorOpen(true)}
                >
                  ＋ New product
                </button>
              </div>

              <div className="bb-orders-product-grid">
                {availableProducts.map((product) => (
                  <button
                    type="button"
                    className="bb-orders-product-option"
                    key={product.id}
                    onClick={() => selectProduct(product)}
                  >
                    <span className="bb-orders-product-image">
                      {product.thumbnail ? (
                        <img
                          src={getImageUrl(product.thumbnail)}
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        "◇"
                      )}
                    </span>
                    <span>
                      <strong>{product.name}</strong>
                      <small>{formatMoney(product.price)}</small>
                    </span>
                    <b aria-hidden="true">＋</b>
                  </button>
                ))}
              </div>

              {!availableProducts.length && (
                <p className="bb-orders-muted">
                  Every available product is selected.
                </p>
              )}

              <div className="bb-orders-selected">
                <h3>Selected items</h3>
                {!selectedProducts.length ? (
                  <p className="bb-orders-muted">
                    No products selected yet.
                  </p>
                ) : (
                  selectedProducts.map((product) => (
                    <div
                      className="bb-orders-selected-item"
                      key={product.id}
                    >
                      <div>
                        <strong>{product.name}</strong>
                        <span>{formatMoney(product.price)}</span>
                      </div>
                      <div className="bb-orders-quantity">
                        <button
                          type="button"
                          onClick={() =>
                            changeQuantity(product.id, -1)
                          }
                          disabled={product.quantity <= 1}
                          aria-label={`Decrease ${product.name} quantity`}
                        >
                          −
                        </button>
                        <output>{product.quantity}</output>
                        <button
                          type="button"
                          onClick={() =>
                            changeQuantity(product.id, 1)
                          }
                          aria-label={`Increase ${product.name} quantity`}
                        >
                          ＋
                        </button>
                      </div>
                      <strong>
                        {formatMoney(
                          product.price * product.quantity
                        )}
                      </strong>
                      <button
                        type="button"
                        className="bb-orders-remove"
                        onClick={() => removeProduct(product.id)}
                        aria-label={`Remove ${product.name}`}
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}

        {error && (
          <div className="bb-orders-error" role="alert">
            <span aria-hidden="true">!</span>
            {error}
          </div>
        )}

        <footer className="bb-orders-modal-footer">
          <div className="bb-orders-total">
            <span>Order total</span>
            <strong>{formatMoney(orderTotal)}</strong>
            {manualOverride && <small>Manual override</small>}
          </div>
          <div>
            <button
              type="button"
              className="bb-orders-button bb-orders-button--ghost"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bb-orders-button bb-orders-button--primary"
              disabled={saving || loadingOptions}
            >
              {saving ? "Creating…" : "Create order"}
            </button>
          </div>
        </footer>
      </motion.form>

      {productCreatorOpen && (
        <QuickProductModal
          onProductAdded={async () => {
            setProductCreatorOpen(false);
            await loadOptions();
          }}
          onClose={() => setProductCreatorOpen(false)}
        />
      )}
    </motion.div>
  );
};

const OrderManagement = () => {
  const reduceMotion = useReducedMotion();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [editingOrder, setEditingOrder] = useState({});
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  const fetchOrders = useCallback(async (background = false) => {
    try {
      background ? setRefreshing(true) : setLoading(true);
      setError("");
      const response = await adminApi.get("/orders/get");
      const fetchedOrders = Array.isArray(response.data?.orders)
        ? response.data.orders
        : [];

      setOrders(
        [...fetchedOrders].sort((a, b) => {
          const aProcessing =
            String(a.status).toLowerCase() === PROCESSING_STATUS;
          const bProcessing =
            String(b.status).toLowerCase() === PROCESSING_STATUS;
          if (aProcessing !== bProcessing) {
            return aProcessing ? -1 : 1;
          }
          return Number(b.id) - Number(a.id);
        })
      );
    } catch (requestError) {
      console.error("Unable to fetch orders:", requestError);
      setError(
        getErrorMessage(
          requestError,
          "Orders could not be loaded. Please try again."
        )
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const statusOptions = useMemo(
    () => [
      "all",
      ...new Set(
        orders
          .map((order) => String(order.status || "").toLowerCase())
          .filter(Boolean)
      ),
    ],
    [orders]
  );

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      const status = String(order.status || "").toLowerCase();
      const matchesStatus =
        statusFilter === "all" || status === statusFilter;
      const matchesSearch =
        !query ||
        [
          order.id,
          order.username,
          order.email,
          order.status,
          order.trackingNumber,
          order.carrier,
        ].some((value) =>
          String(value || "").toLowerCase().includes(query)
        );
      return matchesStatus && matchesSearch;
    });
  }, [orders, search, statusFilter]);

  const counts = useMemo(
    () => ({
      total: orders.length,
      processing: orders.filter(
        (order) =>
          String(order.status).toLowerCase() === PROCESSING_STATUS
      ).length,
      shipped: orders.filter((order) =>
        ["shipped", "completed", "delivered"].includes(
          String(order.status).toLowerCase()
        )
      ).length,
    }),
    [orders]
  );

  const deleteOrder = async (orderId) => {
    if (
      !window.confirm(
        `Delete order #${orderId}? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      await adminApi.delete(`/orders/delete/${orderId}`);
      setEditingOrderId(null);
      await fetchOrders(true);
    } catch (requestError) {
      console.error("Unable to delete order:", requestError);
      setError(
        getErrorMessage(requestError, "The order could not be deleted.")
      );
    }
  };

  const updateOrder = async (orderId) => {
    try {
      await adminApi.put(`/orders/update/${orderId}`, editingOrder);
      setEditingOrderId(null);
      await fetchOrders(true);
    } catch (requestError) {
      console.error("Unable to update order:", requestError);
      setError(
        getErrorMessage(requestError, "The order could not be updated.")
      );
    }
  };

  const updateTrackingLocally = (
    orderId,
    trackingNumber,
    carrier
  ) => {
    setOrders((current) =>
      current.map((order) =>
        order.id === orderId
          ? { ...order, trackingNumber, carrier }
          : order
      )
    );
  };

  return (
    <main className="bb-orders-page">
      <div className="bb-orders-background" aria-hidden="true" />

      <section className="bb-orders-shell">
        <header className="bb-orders-hero">
          <div>
            <span className="bb-orders-eyebrow">
              BakersBurns operations
            </span>
            <h1>Order management</h1>
            <p>
              Review purchases, update fulfillment, and keep
              shipment information organized.
            </p>
          </div>
          <div className="bb-orders-hero-actions">
            <button
              type="button"
              className="bb-orders-button bb-orders-button--ghost"
              onClick={() => fetchOrders(true)}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing…" : "↻ Refresh"}
            </button>
            <button
              type="button"
              className="bb-orders-button bb-orders-button--primary"
              onClick={() => setCreateOpen(true)}
            >
              ＋ Create order
            </button>
          </div>
        </header>

        <div className="bb-orders-stats">
          <article>
            <span>All orders</span>
            <strong>{counts.total}</strong>
          </article>
          <article>
            <span>Processing</span>
            <strong>{counts.processing}</strong>
          </article>
          <article>
            <span>Shipped or complete</span>
            <strong>{counts.shipped}</strong>
          </article>
        </div>

        <div className="bb-orders-toolbar">
          <label className="bb-orders-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search order, customer, or tracking…"
              aria-label="Search orders"
            />
          </label>
          <label className="bb-orders-filter">
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value)
              }
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status === "all"
                    ? "All statuses"
                    : status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <div className="bb-orders-error" role="alert">
            <span aria-hidden="true">!</span>
            <div>
              <strong>Something went wrong</strong>
              <p>{error}</p>
            </div>
            <button
              type="button"
              onClick={() => fetchOrders()}
            >
              Try again
            </button>
          </div>
        )}

        {loading ? (
          <LoadingState label="Loading orders…" />
        ) : !filteredOrders.length ? (
          <EmptyState
            search={search || statusFilter !== "all"}
            onAdd={() => setCreateOpen(true)}
          />
        ) : (
          <motion.div
            className="bb-orders-grid"
            initial={reduceMotion ? false : "hidden"}
            animate="visible"
            variants={{
              hidden: {},
              visible: {
                transition: { staggerChildren: 0.045 },
              },
            }}
          >
            {filteredOrders.map((order) => (
              <motion.article
                className="bb-orders-card"
                key={order.id}
                variants={{
                  hidden: { opacity: 0, y: 14 },
                  visible: { opacity: 1, y: 0 },
                }}
              >
                <header className="bb-orders-card-header">
                  <button
                    type="button"
                    className="bb-orders-order-identity"
                    onClick={() => setSelectedOrderId(order.id)}
                    aria-label={`View details for order ${order.id}`}
                  >
                    <span>Order</span>
                    <strong>#{order.id}</strong>
                    <small>
                      {order.username ||
                        order.email ||
                        "Customer unavailable"}
                    </small>
                  </button>
                  <StatusPill status={order.status} />
                </header>

                {editingOrderId === order.id ? (
                  <div className="bb-orders-edit-panel">
                    <EditOrderForm
                      editingOrder={editingOrder}
                      setEditingOrder={setEditingOrder}
                      updateOrder={updateOrder}
                      deleteOrder={deleteOrder}
                      onCancel={() => setEditingOrderId(null)}
                    />
                  </div>
                ) : (
                  <>
                    <OrderSummary orderId={order.id} />
                    <TrackingEditor
                      orderId={order.id}
                      initialTrackingNumber={order.trackingNumber}
                      initialCarrier={order.carrier}
                      onUpdated={(trackingNumber, carrier) =>
                        updateTrackingLocally(
                          order.id,
                          trackingNumber,
                          carrier
                        )
                      }
                    />
                    <footer className="bb-orders-card-footer">
                      <button
                        type="button"
                        className="bb-orders-text-button"
                        onClick={() => setSelectedOrderId(order.id)}
                      >
                        View details
                      </button>
                      <button
                        type="button"
                        className="bb-orders-button bb-orders-button--ghost"
                        onClick={() => {
                          setEditingOrderId(order.id);
                          setEditingOrder({ ...order });
                        }}
                      >
                        Edit order
                      </button>
                    </footer>
                  </>
                )}
              </motion.article>
            ))}
          </motion.div>
        )}
      </section>

      <AnimatePresence>
        {createOpen && (
          <AddOrderModal
            onClose={() => setCreateOpen(false)}
            onCreated={() => fetchOrders(true)}
          />
        )}
      </AnimatePresence>

      {selectedOrderId && (
        <OrderDetailsModal
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
        />
      )}
    </main>
  );
};

export default OrderManagement;
