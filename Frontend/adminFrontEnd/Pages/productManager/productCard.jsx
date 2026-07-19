
// productCard.jsx
import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import EditProductForm from './editProduct';
import DiscountByProductForm from './discountByProduct';

import {
  useProductContext,
} from './ProductsContext';

import {
  toast,
} from 'react-toastify';

import DiscountIcon from '../../assets/Icons/discount.webp';
import TrashIcon from '../../assets/Icons/trash.webp';

import './product_card.css';

/**
 * Normalize an uncertain numeric value.
 *
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
const normalizeNumber = (
  value,
  fallback = 0
) => {
  const parsedValue =
    Number(value);

  return Number.isFinite(
    parsedValue
  )
    ? parsedValue
    : fallback;
};

/**
 * Format a currency value.
 *
 * Product prices are assumed to already be stored in
 * standard currency units rather than Stripe cents.
 *
 * @param {unknown} value
 * @param {string} currency
 * @returns {string}
 */
const formatCurrency = (
  value,
  currency = 'USD'
) => {
  const numericValue =
    normalizeNumber(
      value,
      0
    );

  try {
    return new Intl.NumberFormat(
      'en-US',
      {
        style: 'currency',
        currency,
      }
    ).format(
      numericValue
    );
  } catch (error) {
    return `$${numericValue.toFixed(
      2
    )}`;
  }
};

/**
 * Format a date without allowing an ISO UTC conversion
 * to shift the displayed calendar day.
 *
 * @param {unknown} value
 * @returns {string}
 */
const formatDate = (
  value
) => {
  if (!value) {
    return 'N/A';
  }

  const stringValue =
    String(value);

  const dateMatch =
    stringValue.match(
      /^(\d{4})-(\d{2})-(\d{2})/
    );

  if (dateMatch) {
    const [
      ,
      year,
      month,
      day,
    ] = dateMatch;

    return `${month}/${day}/${year}`;
  }

  const parsedDate =
    new Date(value);

  if (
    Number.isNaN(
      parsedDate.getTime()
    )
  ) {
    return 'N/A';
  }

  return parsedDate.toLocaleDateString(
    'en-US',
    {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    }
  );
};

/**
 * Build a backend upload URL.
 *
 * @param {unknown} filePath
 * @returns {string}
 */
const buildUploadUrl = (
  filePath
) => {
  const normalizedPath =
    String(
      filePath || ''
    )
      .trim()
      .replace(
        /^\/+/,
        ''
      );

  if (!normalizedPath) {
    return '';
  }

  if (
    /^https?:\/\//i.test(
      normalizedPath
    )
  ) {
    return normalizedPath;
  }

  const backendUrl =
    String(
      import.meta.env
        .VITE_BACKEND ||
        ''
    )
      .trim()
      .replace(
        /\/+$/,
        ''
      );

  return (
    `${backendUrl}/uploads/` +
    normalizedPath
  );
};

/**
 * Resolve a usable product ID.
 *
 * @param {object} product
 * @returns {number|string|null}
 */
const getProductId = (
  product
) => {
  return (
    product?.id ??
    product?.productId ??
    product?.product_id ??
    null
  );
};

/**
 * Resolve whether a product has an active discount.
 *
 * @param {object} product
 * @returns {boolean}
 */
const getIsDiscounted = (
  product
) => {
  const rawValue =
    product?.isDiscounted ??
    product?.is_discounted;

  if (
    rawValue === true ||
    rawValue === 1 ||
    rawValue === '1'
  ) {
    return true;
  }

  if (
    typeof rawValue ===
    'string'
  ) {
    return [
      'true',
      'yes',
      'on',
    ].includes(
      rawValue
        .trim()
        .toLowerCase()
    );
  }

  return false;
};

const ProductCard = ({
  product,
  onDeleteProduct,
  onEditProduct,
  onAddDiscount,
  isDeleting = false,
}) => {
  const [
    isEditingProduct,
    setIsEditingProduct,
  ] = useState(false);

  const [
    isEditingDiscount,
    setIsEditingDiscount,
  ] = useState(false);

  const [
    media,
    setMedia,
  ] = useState([]);

  const [
    isLoadingMedia,
    setIsLoadingMedia,
  ] = useState(false);

  const [
    mediaError,
    setMediaError,
  ] = useState('');

  const [
    productDetails,
    setProductDetails,
  ] = useState(null);

  const [
    isLoadingDetails,
    setIsLoadingDetails,
  ] = useState(false);

  const [
    detailsError,
    setDetailsError,
  ] = useState('');

  const [
    showConfirmModal,
    setShowConfirmModal,
  ] = useState(false);

  const [
    isSubmittingDelete,
    setIsSubmittingDelete,
  ] = useState(false);

  const {
    fetchProducts,
    fetchProductDetails,
    fetchProductMedia,
  } = useProductContext();

  const productId =
    getProductId(
      product
    );

  const productName =
    product?.name ??
    product?.productName ??
    product?.product_name ??
    'Untitled product';

  const productPrice =
    product?.price ??
    product?.productPrice ??
    product?.product_price ??
    0;

  const productCurrency =
    String(
      product?.currency ||
      'USD'
    ).toUpperCase();

  const thumbnail =
    product?.thumbnail ??
    product?.thumbnailUrl ??
    product?.thumbnail_url ??
    '';

  const thumbnailUrl =
    buildUploadUrl(
      thumbnail
    );

  const isDiscounted =
    getIsDiscounted(
      product
    );

  const discountType =
    product?.discountType ??
    product?.discount_type ??
    '';

  const discountAmount =
    product?.discountAmount ??
    product?.discount_amount ??
    0;

  const discountStartDate =
    product?.discountStartDate ??
    product?.discount_start_date ??
    null;

  const discountEndDate =
    product?.discountEndDate ??
    product?.discount_end_date ??
    null;

  const discountPrice =
    product?.discountPrice ??
    product?.discount_price ??
    null;

  const isDeletePending =
    isDeleting ||
    isSubmittingDelete;

  const displayedDetails =
    productDetails ||
    product ||
    {};

  const productDescription =
    displayedDetails
      ?.description ||
    displayedDetails
      ?.productDescription ||
    displayedDetails
      ?.product_description ||
    'No description available.';

  const productType =
    displayedDetails?.type ||
    displayedDetails
      ?.productType ||
    displayedDetails
      ?.product_type ||
    'Not specified';

  const productQuantity =
    normalizeNumber(
      displayedDetails
        ?.quantity ??
      displayedDetails
        ?.stock ??
      displayedDetails
        ?.inventory ??
      displayedDetails
        ?.inventoryQuantity ??
      displayedDetails
        ?.inventory_quantity,
      0
    );

  const formattedDiscount =
    useMemo(() => {
      if (
        discountType ===
        'percentage'
      ) {
        return `${normalizeNumber(
          discountAmount,
          0
        )}%`;
      }

      return formatCurrency(
        discountAmount,
        productCurrency
      );
    }, [
      discountType,
      discountAmount,
      productCurrency,
    ]);

  /**
   * Fetch the product media.
   */
  useEffect(() => {
    let isMounted = true;

    const loadMedia =
      async () => {
        if (
          !productId ||
          typeof fetchProductMedia !==
            'function'
        ) {
          if (isMounted) {
            setMedia([]);
          }

          return;
        }

        setIsLoadingMedia(
          true
        );

        setMediaError('');

        try {
          const mediaData =
            await fetchProductMedia(
              productId
            );

          if (!isMounted) {
            return;
          }

          setMedia(
            Array.isArray(
              mediaData
            )
              ? mediaData
              : Array.isArray(
                    mediaData?.media
                  )
                ? mediaData.media
                : []
          );
        } catch (error) {
          console.error(
            'Error fetching product media:',
            error
          );

          if (isMounted) {
            setMedia([]);
            setMediaError(
              'Unable to load product media.'
            );
          }
        } finally {
          if (isMounted) {
            setIsLoadingMedia(
              false
            );
          }
        }
      };

    loadMedia();

    return () => {
      isMounted = false;
    };
  }, [
    productId,
    fetchProductMedia,
  ]);

  /**
   * Fetch the extended product details.
   */
  useEffect(() => {
    let isMounted = true;

    const loadProductDetails =
      async () => {
        if (
          !productId ||
          typeof fetchProductDetails !==
            'function'
        ) {
          if (isMounted) {
            setProductDetails(
              product || null
            );
          }

          return;
        }

        setIsLoadingDetails(
          true
        );

        setDetailsError('');

        try {
          const details =
            await fetchProductDetails(
              productId
            );

          if (!isMounted) {
            return;
          }

          setProductDetails(
            details?.product ||
            details?.data ||
            details ||
            product ||
            null
          );
        } catch (error) {
          console.error(
            'Error fetching product details:',
            error
          );

          if (isMounted) {
            setProductDetails(
              product || null
            );

            setDetailsError(
              'Unable to load the latest product details.'
            );
          }
        } finally {
          if (isMounted) {
            setIsLoadingDetails(
              false
            );
          }
        }
      };

    loadProductDetails();

    return () => {
      isMounted = false;
    };
  }, [
    productId,
    product,
    fetchProductDetails,
  ]);

  /**
   * Prevent the page behind the confirmation modal from
   * scrolling.
   */
  useEffect(() => {
    if (!showConfirmModal) {
      return undefined;
    }

    const previousOverflow =
      document.body.style
        .overflow;

    document.body.style
      .overflow = 'hidden';

    return () => {
      document.body.style
        .overflow =
        previousOverflow;
    };
  }, [
    showConfirmModal,
  ]);

  /**
   * Close the confirmation modal when Escape is pressed.
   */
  useEffect(() => {
    if (!showConfirmModal) {
      return undefined;
    }

    const handleKeyDown =
      (
        event
      ) => {
        if (
          event.key ===
          'Escape'
        ) {
          setShowConfirmModal(
            false
          );
        }
      };

    window.addEventListener(
      'keydown',
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        'keydown',
        handleKeyDown
      );
    };
  }, [
    showConfirmModal,
  ]);

  /**
   * Open the product editor.
   *
   * Prefer the parent callback when supplied. Otherwise,
   * use the existing embedded EditProductForm.
   */
  const handleEditProduct =
    () => {
      if (
        typeof onEditProduct ===
        'function'
      ) {
        onEditProduct(
          product
        );

        return;
      }

      setIsEditingProduct(
        true
      );
    };

  /**
   * Open the discount editor.
   *
   * Prefer the parent callback when supplied. Otherwise,
   * use the existing embedded DiscountByProductForm.
   */
  const handleEditDiscount =
    () => {
      if (
        typeof onAddDiscount ===
        'function'
      ) {
        onAddDiscount(
          product
        );

        return;
      }

      setIsEditingDiscount(
        true
      );
    };

  /**
   * Close the embedded product editor.
   */
  const handleCancelEdit =
    () => {
      setIsEditingProduct(
        false
      );
    };

  /**
   * Refresh products after an embedded editor completes.
   */
  const handleEmbeddedFormSuccess =
    async () => {
      setIsEditingProduct(
        false
      );

      setIsEditingDiscount(
        false
      );

      if (
        typeof fetchProducts ===
        'function'
      ) {
        await fetchProducts();
      }
    };

  /**
   * Delete the product after confirmation.
   */
  const handleDeleteConfirm =
    async () => {
      if (
        isDeletePending ||
        typeof onDeleteProduct !==
          'function'
      ) {
        return;
      }

      try {
        setIsSubmittingDelete(
          true
        );

        await onDeleteProduct(
          productId
        );

        setShowConfirmModal(
          false
        );
      } catch (error) {
        /*
         * ProductList normally owns the visible deletion
         * error message. This toast is only a fallback for
         * standalone ProductCard usage.
         */
        console.error(
          'Error deleting product:',
          error
        );

        toast.error(
          error?.response?.data
            ?.message ||
          'Failed to delete the product. It may be associated with an existing order.'
        );
      } finally {
        setIsSubmittingDelete(
          false
        );
      }
    };

  if (!product) {
    return (
      <article className="product-card-admin product-card-admin--invalid">
        <div className="product-card-admin__empty-message">
          Product information is unavailable.
        </div>
      </article>
    );
  }

  if (
    isEditingProduct &&
    typeof onEditProduct !==
      'function'
  ) {
    return (
      <div className="product-card-admin__form-host">
        <EditProductForm
          productId={
            productId
          }
          fetchProducts={
            fetchProducts
          }
          onClose={
            handleCancelEdit
          }
          onCancel={
            handleCancelEdit
          }
          onSuccess={
            handleEmbeddedFormSuccess
          }
        />
      </div>
    );
  }

  if (
    isEditingDiscount &&
    typeof onAddDiscount !==
      'function'
  ) {
    return (
      <div className="product-card-admin__form-host">
        <DiscountByProductForm
          product={
            product
          }
          onClose={() =>
            setIsEditingDiscount(
              false
            )
          }
          onSuccess={
            handleEmbeddedFormSuccess
          }
        />
      </div>
    );
  }

  return (
    <article className="product-card-admin">
      <div className="product-card-admin__image-section">
        {thumbnailUrl ? (
          <img
            src={
              thumbnailUrl
            }
            alt={`${productName} thumbnail`}
            className="product-card-admin__thumbnail"
            loading="lazy"
          />
        ) : (
          <div className="product-card-admin__thumbnail-placeholder">
            <span
              className="product-card-admin__thumbnail-placeholder-icon"
              aria-hidden="true"
            >
              ◇
            </span>

            <span>
              No thumbnail
            </span>
          </div>
        )}

        <div className="product-card-admin__image-overlay">
          <span className="product-card-admin__type-badge">
            {productType}
          </span>

          <span
            className={`
              product-card-admin__stock-badge
              ${
                productQuantity > 0
                  ? 'product-card-admin__stock-badge--available'
                  : 'product-card-admin__stock-badge--empty'
              }
            `}
          >
            {productQuantity > 0
              ? `${productQuantity} in stock`
              : 'Out of stock'}
          </span>
        </div>
      </div>

      <div className="product-card-admin__body">
        <header className="product-card-admin__header">
          <div className="product-card-admin__heading">
            <span className="product-card-admin__eyebrow">
              Product
            </span>

            <h3 className="product-card-admin__name">
              {productName}
            </h3>
          </div>

          <strong className="product-card-admin__price">
            {formatCurrency(
              productPrice,
              productCurrency
            )}
          </strong>
        </header>

        <div className="product-card-admin__details">
          {isLoadingDetails ? (
            <div className="product-card-admin__loading-state">
              <span className="product-card-admin__spinner" />

              <span>
                Loading product details…
              </span>
            </div>
          ) : (
            <>
              {detailsError && (
                <p className="product-card-admin__inline-warning">
                  {detailsError}
                </p>
              )}

              <p className="product-card-admin__description">
                {productDescription}
              </p>

              <dl className="product-card-admin__detail-grid">
                <div className="product-card-admin__detail-item">
                  <dt>
                    Type
                  </dt>

                  <dd>
                    {productType}
                  </dd>
                </div>

                <div className="product-card-admin__detail-item">
                  <dt>
                    Quantity
                  </dt>

                  <dd>
                    {productQuantity}
                  </dd>
                </div>

                <div className="product-card-admin__detail-item">
                  <dt>
                    Base price
                  </dt>

                  <dd>
                    {formatCurrency(
                      productPrice,
                      productCurrency
                    )}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </div>

        <section className="product-card-admin__discount-section">
          {isDiscounted ? (
            <div className="product-card-admin__discount-card">
              <div className="product-card-admin__discount-header">
                <div className="product-card-admin__discount-value">
                  <div className="product-card-admin__discount-icon-wrapper">
                    <img
                      src={
                        DiscountIcon
                      }
                      alt=""
                      className="product-card-admin__discount-icon"
                    />

                    <span className="product-card-admin__discount-amount">
                      {
                        formattedDiscount
                      }
                    </span>
                  </div>

                  <div>
                    <span className="product-card-admin__discount-label">
                      Active discount
                    </span>

                    <strong className="product-card-admin__discounted-price">
                      {discountPrice !==
                      null
                        ? formatCurrency(
                            discountPrice,
                            productCurrency
                          )
                        : 'Price unavailable'}
                    </strong>
                  </div>
                </div>

                <button
                  type="button"
                  className="product-card-admin__discount-button"
                  onClick={
                    handleEditDiscount
                  }
                  disabled={
                    isDeletePending
                  }
                >
                  Edit discount
                </button>
              </div>

              <div className="product-card-admin__discount-dates">
                <div>
                  <span>
                    Starts
                  </span>

                  <strong>
                    {formatDate(
                      discountStartDate
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Ends
                  </span>

                  <strong>
                    {formatDate(
                      discountEndDate
                    )}
                  </strong>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="product-card-admin__add-discount-button"
              onClick={
                handleEditDiscount
              }
              disabled={
                isDeletePending
              }
            >
              <img
                src={
                  DiscountIcon
                }
                className="product-card-admin__add-discount-icon"
                alt=""
              />

              <span>
                Add discount
              </span>
            </button>
          )}
        </section>

        <section className="product-card-admin__media-section">
          <div className="product-card-admin__section-heading">
            <div>
              <span className="product-card-admin__eyebrow">
                Gallery
              </span>

              <h4>
                Product media
              </h4>
            </div>

            <span className="product-card-admin__media-count">
              {media.length}
            </span>
          </div>

          {isLoadingMedia ? (
            <div className="product-card-admin__loading-state product-card-admin__loading-state--media">
              <span className="product-card-admin__spinner" />

              <span>
                Loading media…
              </span>
            </div>
          ) : mediaError ? (
            <p className="product-card-admin__inline-warning">
              {mediaError}
            </p>
          ) : media.length > 0 ? (
            <div className="product-card-admin__media-grid">
              {media.map(
                (
                  item,
                  index
                ) => {
                  const mediaId =
                    item?.id ??
                    `${productId}-${index}`;

                  const mediaType =
                    String(
                      item?.type ||
                      ''
                    )
                      .trim()
                      .toLowerCase();

                  const mediaUrl =
                    buildUploadUrl(
                      item?.url ??
                      item?.path ??
                      item?.filename
                    );

                  if (!mediaUrl) {
                    return null;
                  }

                  return (
                    <div
                      key={
                        mediaId
                      }
                      className="product-card-admin__media-item"
                    >
                      {mediaType ===
                      'video' ? (
                        <video
                          className="product-card-admin__media-preview"
                          src={
                            mediaUrl
                          }
                          muted
                          loop
                          playsInline
                          preload="metadata"
                          controls
                        >
                          Your browser does not support
                          the video tag.
                        </video>
                      ) : (
                        <img
                          src={
                            mediaUrl
                          }
                          alt={`${productName} media ${
                            index +
                            1
                          }`}
                          className="product-card-admin__media-preview"
                          loading="lazy"
                        />
                      )}
                    </div>
                  );
                }
              )}
            </div>
          ) : (
            <div className="product-card-admin__no-media">
              No additional media available.
            </div>
          )}
        </section>
      </div>

      <footer className="product-card-admin__footer">
        <button
          type="button"
          className="product-card-admin__edit-button"
          onClick={
            handleEditProduct
          }
          disabled={
            isDeletePending
          }
        >
          Edit product
        </button>

        <button
          type="button"
          className="product-card-admin__delete-button"
          onClick={() =>
            setShowConfirmModal(
              true
            )
          }
          disabled={
            isDeletePending
          }
          aria-label={`Delete ${productName}`}
        >
          <img
            src={
              TrashIcon
            }
            alt=""
            className="product-card-admin__delete-icon"
          />

          <span>
            Delete
          </span>
        </button>
      </footer>

      {showConfirmModal && (
        <div
          className="product-card-admin-modal"
          role="presentation"
          onMouseDown={
            (
              event
            ) => {
              if (
                event.target ===
                event.currentTarget &&
                !isDeletePending
              ) {
                setShowConfirmModal(
                  false
                );
              }
            }
          }
        >
          <div
            className="product-card-admin-modal__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`product-delete-title-${productId}`}
            aria-describedby={`product-delete-description-${productId}`}
          >
            <div className="product-card-admin-modal__icon">
              <img
                src={
                  TrashIcon
                }
                alt=""
              />
            </div>

            <div className="product-card-admin-modal__content">
              <span className="product-card-admin-modal__eyebrow">
                Delete product
              </span>

              <h3
                id={`product-delete-title-${productId}`}
              >
                Delete “{productName}”?
              </h3>

              <p
                id={`product-delete-description-${productId}`}
              >
                This action cannot be undone. Products
                connected to existing orders may not be
                eligible for deletion.
              </p>
            </div>

            <div className="product-card-admin-modal__actions">
              <button
                type="button"
                className="product-card-admin-modal__cancel"
                onClick={() =>
                  setShowConfirmModal(
                    false
                  )
                }
                disabled={
                  isDeletePending
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="product-card-admin-modal__confirm"
                onClick={
                  handleDeleteConfirm
                }
                disabled={
                  isDeletePending
                }
              >
                {isDeletePending ? (
                  <>
                    <span className="product-card-admin__spinner product-card-admin__spinner--small" />

                    Deleting…
                  </>
                ) : (
                  'Yes, delete product'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
};

export default ProductCard;

