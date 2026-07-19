
// ProductManagement.jsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  ProductsProvider,
  useProductContext,
} from './ProductsContext';

import {
  adminApi,
} from '../../config/axios';

import {
  toast,
} from 'react-toastify';

import LoadingPage from '../../Components/loading';
import ProductForm from './productForm';
import EditProductForm from './editProduct';
import DiscountByProductForm from './discountByProduct';
import BackToTop from './components/BackToTop';

import DiscountIcon from '../../assets/Icons/discount.webp';
import TrashIcon from '../../assets/Icons/trash.webp';

import './product_management.css';

/* ==================================================
   Normalization helpers
================================================== */

/**
 * Convert an uncertain value into a safe number.
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
 * Convert uncertain boolean values into true or false.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
const normalizeBoolean = (
  value
) => {
  if (
    value === true ||
    value === 1 ||
    value === '1'
  ) {
    return true;
  }

  if (
    value === false ||
    value === 0 ||
    value === '0' ||
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return false;
  }

  if (
    typeof value ===
    'string'
  ) {
    return [
      'true',
      'yes',
      'y',
      'on',
    ].includes(
      value
        .trim()
        .toLowerCase()
    );
  }

  return false;
};

/**
 * Normalize a string for comparisons.
 *
 * @param {unknown} value
 * @returns {string}
 */
const normalizeString = (
  value
) => {
  return String(
    value ?? ''
  )
    .trim()
    .toLowerCase();
};

/**
 * Get the product ID from likely API property names.
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
 * Get the product name.
 *
 * @param {object} product
 * @returns {string}
 */
const getProductName = (
  product
) => {
  return (
    product?.name ??
    product?.productName ??
    product?.product_name ??
    'Untitled product'
  );
};

/**
 * Get the product description.
 *
 * @param {object} product
 * @returns {string}
 */
const getProductDescription = (
  product
) => {
  return (
    product?.description ??
    product?.productDescription ??
    product?.product_description ??
    'No product description is available.'
  );
};

/**
 * Get the product type.
 *
 * @param {object} product
 * @returns {string}
 */
const getProductType = (
  product
) => {
  return String(
    product?.type ??
    product?.productType ??
    product?.product_type ??
    'Uncategorized'
  ).trim();
};

/**
 * Get the base product price.
 *
 * @param {object} product
 * @returns {number}
 */
const getProductPrice = (
  product
) => {
  return normalizeNumber(
    product?.price ??
      product?.productPrice ??
      product?.product_price,
    0
  );
};

/**
 * Get the available inventory quantity.
 *
 * @param {object} product
 * @returns {number}
 */
const getProductQuantity = (
  product
) => {
  return normalizeNumber(
    product?.quantity ??
      product?.stock ??
      product?.inventory ??
      product?.inventoryQuantity ??
      product?.inventory_quantity,
    0
  );
};

/**
 * Determine whether a product is discounted.
 *
 * @param {object} product
 * @returns {boolean}
 */
const getIsDiscounted = (
  product
) => {
  return normalizeBoolean(
    product?.isDiscounted ??
      product?.is_discounted
  );
};

/**
 * Format a product price.
 *
 * Product prices are assumed to be stored in dollars,
 * not Stripe cents.
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
        currency:
          String(
            currency || 'USD'
          ).toUpperCase(),
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
 * Format dates without shifting ISO date-only values
 * into a different day through UTC conversion.
 *
 * @param {unknown} value
 * @returns {string}
 */
const formatDate = (
  value
) => {
  if (!value) {
    return 'Not available';
  }

  const stringValue =
    String(value);

  const dateOnlyMatch =
    stringValue.match(
      /^(\d{4})-(\d{2})-(\d{2})/
    );

  if (dateOnlyMatch) {
    const [
      ,
      year,
      month,
      day,
    ] = dateOnlyMatch;

    return `${month}/${day}/${year}`;
  }

  const parsedDate =
    new Date(value);

  if (
    Number.isNaN(
      parsedDate.getTime()
    )
  ) {
    return 'Not available';
  }

  return parsedDate.toLocaleDateString(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }
  );
};

/**
 * Build a URL for backend-uploaded media.
 *
 * @param {unknown} value
 * @returns {string}
 */
const buildUploadUrl = (
  value
) => {
  const normalizedValue =
    String(
      value || ''
    )
      .trim()
      .replace(
        /^\/+/,
        ''
      );

  if (!normalizedValue) {
    return '';
  }

  if (
    /^https?:\/\//i.test(
      normalizedValue
    )
  ) {
    return normalizedValue;
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
    normalizedValue
  );
};

/**
 * Get the thumbnail filename or URL.
 *
 * @param {object} product
 * @returns {string}
 */
const getProductThumbnail = (
  product
) => {
  return (
    product?.thumbnail ??
    product?.thumbnailUrl ??
    product?.thumbnail_url ??
    ''
  );
};

/**
 * Get the discounted product price.
 *
 * @param {object} product
 * @returns {number|null}
 */
const getDiscountPrice = (
  product
) => {
  const rawPrice =
    product?.discountPrice ??
    product?.discount_price;

  if (
    rawPrice === null ||
    rawPrice === undefined ||
    rawPrice === ''
  ) {
    return null;
  }

  const parsedPrice =
    Number(rawPrice);

  return Number.isFinite(
    parsedPrice
  )
    ? parsedPrice
    : null;
};

/**
 * Create readable discount text.
 *
 * @param {object} product
 * @returns {string}
 */
const getDiscountLabel = (
  product
) => {
  const discountType =
    product?.discountType ??
    product?.discount_type;

  const discountAmount =
    normalizeNumber(
      product?.discountAmount ??
        product?.discount_amount,
      0
    );

  if (
    discountType ===
    'percentage'
  ) {
    return `${discountAmount}% off`;
  }

  if (
    discountAmount > 0
  ) {
    return `${formatCurrency(
      discountAmount
    )} off`;
  }

  return 'Discount active';
};

/* ==================================================
   Main page
================================================== */

const ProductManagementContent =
  () => {
    const {
      products,
      productTypes,
      isLoading,
      fetchProducts,
      fetchProductDetails,
      fetchProductMedia,
    } = useProductContext();

    const containerRef =
      useRef(null);

    const [
      formMode,
      setFormMode,
    ] = useState(null);

    const [
      selectedProduct,
      setSelectedProduct,
    ] = useState(null);

    const [
      selectedType,
      setSelectedType,
    ] = useState('');

    const [
      searchTerm,
      setSearchTerm,
    ] = useState('');

    const [
      sortCriteria,
      setSortCriteria,
    ] = useState('name');

    const [
      sortOrder,
      setSortOrder,
    ] = useState('asc');

    const [
      enrichedProducts,
      setEnrichedProducts,
    ] = useState([]);

    const [
      isRefreshingDetails,
      setIsRefreshingDetails,
    ] = useState(false);

    const [
      deleteModalProduct,
      setDeleteModalProduct,
    ] = useState(null);

    const [
      isDeleting,
      setIsDeleting,
    ] = useState(false);

    const safeProducts =
      Array.isArray(products)
        ? products
        : [];

    /**
     * Enrich the list using the existing context methods
     * for product details and product media.
     *
     * The page still works with the basic product response
     * if either method is unavailable or an individual
     * request fails.
     */
    useEffect(() => {
      let isMounted = true;

      const hydrateProducts =
        async () => {
          if (
            safeProducts.length ===
            0
          ) {
            setEnrichedProducts(
              []
            );

            return;
          }

          setIsRefreshingDetails(
            true
          );

          try {
            const hydrated =
              await Promise.all(
                safeProducts.map(
                  async (
                    product
                  ) => {
                    const productId =
                      getProductId(
                        product
                      );

                    let details =
                      null;

                    let media =
                      [];

                    if (
                      productId &&
                      typeof fetchProductDetails ===
                        'function'
                    ) {
                      try {
                        const response =
                          await fetchProductDetails(
                            productId
                          );

                        details =
                          response?.product ??
                          response?.data ??
                          response ??
                          null;
                      } catch (error) {
                        console.error(
                          `Unable to load details for product ${productId}:`,
                          error
                        );
                      }
                    }

                    if (
                      productId &&
                      typeof fetchProductMedia ===
                        'function'
                    ) {
                      try {
                        const response =
                          await fetchProductMedia(
                            productId
                          );

                        media =
                          Array.isArray(
                            response
                          )
                            ? response
                            : Array.isArray(
                                  response?.media
                                )
                              ? response.media
                              : [];
                      } catch (error) {
                        console.error(
                          `Unable to load media for product ${productId}:`,
                          error
                        );
                      }
                    }

                    return {
                      ...product,
                      ...(
                        details ||
                        {}
                      ),
                      adminMedia:
                        media,
                    };
                  }
                )
              );

            if (isMounted) {
              setEnrichedProducts(
                hydrated
              );
            }
          } finally {
            if (isMounted) {
              setIsRefreshingDetails(
                false
              );
            }
          }
        };

      hydrateProducts();

      return () => {
        isMounted = false;
      };
    }, [
      products,
      fetchProductDetails,
      fetchProductMedia,
    ]);

    const availableTypes =
      useMemo(() => {
        const typesFromProducts =
          enrichedProducts
            .map(
              getProductType
            )
            .filter(Boolean);

        const typesFromContext =
          Array.isArray(
            productTypes
          )
            ? productTypes.map(
                (
                  type
                ) => {
                  if (
                    typeof type ===
                    'string'
                  ) {
                    return type;
                  }

                  return (
                    type?.name ??
                    type?.type ??
                    ''
                  );
                }
              )
            : [];

        return [
          ...new Set([
            ...typesFromProducts,
            ...typesFromContext,
          ]),
        ]
          .filter(Boolean)
          .sort(
            (
              typeA,
              typeB
            ) =>
              typeA.localeCompare(
                typeB,
                undefined,
                {
                  sensitivity:
                    'base',
                }
              )
          );
      }, [
        enrichedProducts,
        productTypes,
      ]);

    const displayedProducts =
      useMemo(() => {
        const normalizedSearch =
          normalizeString(
            searchTerm
          );

        const filtered =
          enrichedProducts.filter(
            (
              product
            ) => {
              const matchesType =
                !selectedType ||
                normalizeString(
                  getProductType(
                    product
                  )
                ) ===
                  normalizeString(
                    selectedType
                  );

              if (!matchesType) {
                return false;
              }

              if (
                !normalizedSearch
              ) {
                return true;
              }

              const searchableText = [
                getProductName(
                  product
                ),
                getProductDescription(
                  product
                ),
                getProductType(
                  product
                ),
                product?.sku,
                product?.id,
              ]
                .filter(
                  (
                    value
                  ) =>
                    value !==
                      null &&
                    value !==
                      undefined
                )
                .join(' ')
                .toLowerCase();

              return searchableText.includes(
                normalizedSearch
              );
            }
          );

        return [
          ...filtered,
        ].sort(
          (
            productA,
            productB
          ) => {
            let comparison =
              0;

            switch (
              sortCriteria
            ) {
              case 'price':
                comparison =
                  getProductPrice(
                    productA
                  ) -
                  getProductPrice(
                    productB
                  );
                break;

              case 'quantity':
                comparison =
                  getProductQuantity(
                    productA
                  ) -
                  getProductQuantity(
                    productB
                  );
                break;

              case 'createdAt': {
                const dateA =
                  new Date(
                    productA?.createdAt ??
                      productA?.created_at ??
                      0
                  ).getTime();

                const dateB =
                  new Date(
                    productB?.createdAt ??
                      productB?.created_at ??
                      0
                  ).getTime();

                comparison =
                  (
                    Number.isFinite(
                      dateA
                    )
                      ? dateA
                      : 0
                  ) -
                  (
                    Number.isFinite(
                      dateB
                    )
                      ? dateB
                      : 0
                  );

                break;
              }

              case 'type':
                comparison =
                  getProductType(
                    productA
                  ).localeCompare(
                    getProductType(
                      productB
                    ),
                    undefined,
                    {
                      sensitivity:
                        'base',
                    }
                  );
                break;

              case 'name':
              default:
                comparison =
                  getProductName(
                    productA
                  ).localeCompare(
                    getProductName(
                      productB
                    ),
                    undefined,
                    {
                      numeric: true,
                      sensitivity:
                        'base',
                    }
                  );
            }

            return sortOrder ===
              'desc'
              ? comparison * -1
              : comparison;
          }
        );
      }, [
        enrichedProducts,
        searchTerm,
        selectedType,
        sortCriteria,
        sortOrder,
      ]);

    const summary =
      useMemo(() => {
        const totalProducts =
          enrichedProducts.length;

        const totalInventory =
          enrichedProducts.reduce(
            (
              total,
              product
            ) =>
              total +
              Math.max(
                0,
                getProductQuantity(
                  product
                )
              ),
            0
          );

        const discountedProducts =
          enrichedProducts.filter(
            getIsDiscounted
          ).length;

        const outOfStockProducts =
          enrichedProducts.filter(
            (
              product
            ) =>
              getProductQuantity(
                product
              ) <= 0
          ).length;

        return {
          totalProducts,
          totalInventory,
          discountedProducts,
          outOfStockProducts,
        };
      }, [
        enrichedProducts,
      ]);

    const closeForm =
      () => {
        setFormMode(null);
        setSelectedProduct(
          null
        );
      };

    const openAddForm =
      () => {
        setSelectedProduct(
          null
        );

        setFormMode('add');
      };

    const openEditForm =
      (
        product
      ) => {
        setSelectedProduct(
          product
        );

        setFormMode('edit');
      };

    const openDiscountForm =
      (
        product
      ) => {
        setSelectedProduct(
          product
        );

        setFormMode(
          'discount'
        );
      };

    const handleFormSuccess =
      async () => {
        closeForm();

        if (
          typeof fetchProducts ===
          'function'
        ) {
          await fetchProducts();
        }
      };

    const handleRefresh =
      async () => {
        if (
          typeof fetchProducts !==
          'function'
        ) {
          return;
        }

        await fetchProducts();
      };

    /**
     * Known backend route:
     *
     * DELETE /products/:id
     */
    const handleDeleteProduct =
      async () => {
        const productId =
          getProductId(
            deleteModalProduct
          );

        if (!productId) {
          toast.error(
            'Unable to delete this product because its ID is missing.'
          );

          return;
        }

        try {
          setIsDeleting(
            true
          );

          await adminApi.delete(
            `/products/${productId}`
          );

          toast.success(
            'Product deleted successfully.'
          );

          setDeleteModalProduct(
            null
          );

          if (
            typeof fetchProducts ===
            'function'
          ) {
            await fetchProducts();
          }
        } catch (error) {
          console.error(
            'Error deleting product:',
            error
          );

          const status =
            error?.response?.status;

          const serverMessage =
            error?.response?.data
              ?.message;

          if (
            status === 400 ||
            status === 409
          ) {
            toast.error(
              serverMessage ||
                'This product cannot be deleted because it is associated with an existing order.'
            );
          } else if (
            status === 404
          ) {
            toast.error(
              serverMessage ||
                'This product could not be found. It may already have been deleted.'
            );
          } else {
            toast.error(
              serverMessage ||
                'Failed to delete the product. Please try again.'
            );
          }
        } finally {
          setIsDeleting(
            false
          );
        }
      };

    if (isLoading) {
      return <LoadingPage />;
    }

    return (
      <main
        className="admin-product-workspace-body"
        ref={containerRef}
      >
        <section className="admin-product-workspace-page">
          <div className="admin-product-workspace-shell">
            <header className="admin-product-workspace-header">
              <div className="admin-product-workspace-header__content">
                <span className="admin-product-workspace-eyebrow">
                  Store administration
                </span>

                <h1 className="admin-product-workspace-header__title">
                  Product Manager
                </h1>

                <p className="admin-product-workspace-header__description">
                  Create products, review inventory,
                  manage discounts, inspect media, and
                  update store listings from one
                  administrative workspace.
                </p>
              </div>

              <div className="admin-product-workspace-header__actions">
                <button
                  type="button"
                  className="
                    admin-product-workspace-button
                    admin-product-workspace-button--secondary
                  "
                  onClick={
                    handleRefresh
                  }
                >
                  <span aria-hidden="true">
                    ↻
                  </span>

                  Refresh
                </button>

                <button
                  type="button"
                  className="
                    admin-product-workspace-button
                    admin-product-workspace-button--primary
                    admin-product-workspace-button--large
                  "
                  onClick={
                    openAddForm
                  }
                >
                  <span aria-hidden="true">
                    +
                  </span>

                  Add product
                </button>
              </div>
            </header>

            <section className="admin-product-workspace-summary">
              <article className="admin-product-workspace-summary__card">
                <span>
                  Products
                </span>

                <strong>
                  {
                    summary
                      .totalProducts
                  }
                </strong>

                <small>
                  Catalog entries
                </small>
              </article>

              <article className="admin-product-workspace-summary__card">
                <span>
                  Inventory
                </span>

                <strong>
                  {
                    summary
                      .totalInventory
                  }
                </strong>

                <small>
                  Total available units
                </small>
              </article>

              <article className="admin-product-workspace-summary__card">
                <span>
                  Discounts
                </span>

                <strong>
                  {
                    summary
                      .discountedProducts
                  }
                </strong>

                <small>
                  Discounted products
                </small>
              </article>

              <article
                className={`
                  admin-product-workspace-summary__card
                  ${
                    summary
                      .outOfStockProducts >
                    0
                      ? 'admin-product-workspace-summary__card--warning'
                      : ''
                  }
                `}
              >
                <span>
                  Out of stock
                </span>

                <strong>
                  {
                    summary
                      .outOfStockProducts
                  }
                </strong>

                <small>
                  Products needing attention
                </small>
              </article>
            </section>

            <section className="admin-product-workspace-directory">
              <div className="admin-product-workspace-directory__header">
                <div>
                  <span className="admin-product-workspace-eyebrow">
                    Product directory
                  </span>

                  <h2>
                    Store inventory
                  </h2>

                  <p>
                    Search the catalog, filter by product
                    type, and manage each listing.
                  </p>
                </div>

                <span className="admin-product-workspace-directory__count">
                  {
                    displayedProducts
                      .length
                  }{' '}
                  {
                    displayedProducts
                      .length === 1
                      ? 'result'
                      : 'results'
                  }
                </span>
              </div>

              <div className="admin-product-workspace-controls">
                <label className="admin-product-workspace-control">
                  <span>
                    Search products
                  </span>

                  <input
                    type="search"
                    value={
                      searchTerm
                    }
                    onChange={(
                      event
                    ) =>
                      setSearchTerm(
                        event.target
                          .value
                      )
                    }
                    placeholder="Search by name, type, description, SKU, or ID"
                  />
                </label>

                <label className="admin-product-workspace-control">
                  <span>
                    Product type
                  </span>

                  <select
                    value={
                      selectedType
                    }
                    onChange={(
                      event
                    ) =>
                      setSelectedType(
                        event.target
                          .value
                      )
                    }
                  >
                    <option value="">
                      All product types
                    </option>

                    {availableTypes.map(
                      (
                        type
                      ) => (
                        <option
                          key={
                            type
                          }
                          value={
                            type
                          }
                        >
                          {type}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label className="admin-product-workspace-control">
                  <span>
                    Sort by
                  </span>

                  <select
                    value={
                      sortCriteria
                    }
                    onChange={(
                      event
                    ) =>
                      setSortCriteria(
                        event.target
                          .value
                      )
                    }
                  >
                    <option value="name">
                      Name
                    </option>

                    <option value="type">
                      Product type
                    </option>

                    <option value="price">
                      Price
                    </option>

                    <option value="quantity">
                      Inventory
                    </option>

                    <option value="createdAt">
                      Date created
                    </option>
                  </select>
                </label>

                <label className="admin-product-workspace-control">
                  <span>
                    Order
                  </span>

                  <select
                    value={
                      sortOrder
                    }
                    onChange={(
                      event
                    ) =>
                      setSortOrder(
                        event.target
                          .value
                      )
                    }
                  >
                    <option value="asc">
                      Ascending
                    </option>

                    <option value="desc">
                      Descending
                    </option>
                  </select>
                </label>
              </div>

              {isRefreshingDetails && (
                <div className="admin-product-workspace-refreshing">
                  <span className="admin-product-workspace-spinner" />

                  Loading product details and media…
                </div>
              )}

              <div className="admin-product-workspace-list">
                {displayedProducts.length >
                0 ? (
                  displayedProducts.map(
                    (
                      product
                    ) => {
                      const productId =
                        getProductId(
                          product
                        );

                      const productName =
                        getProductName(
                          product
                        );

                      const productType =
                        getProductType(
                          product
                        );

                      const productPrice =
                        getProductPrice(
                          product
                        );

                      const productQuantity =
                        getProductQuantity(
                          product
                        );

                      const isDiscounted =
                        getIsDiscounted(
                          product
                        );

                      const discountPrice =
                        getDiscountPrice(
                          product
                        );

                      const media =
                        Array.isArray(
                          product
                            ?.adminMedia
                        )
                          ? product
                              .adminMedia
                          : [];

                      const thumbnailUrl =
                        buildUploadUrl(
                          getProductThumbnail(
                            product
                          )
                        );

                      const createdAt =
                        product?.createdAt ??
                        product?.created_at;

                      return (
                        <article
                          key={
                            productId
                          }
                          className="admin-product-workspace-card"
                        >
                          <div className="admin-product-workspace-card__thumbnail">
                            {thumbnailUrl ? (
                              <img
                                src={
                                  thumbnailUrl
                                }
                                alt={`${productName} thumbnail`}
                                loading="lazy"
                              />
                            ) : (
                              <div className="admin-product-workspace-card__thumbnail-placeholder">
                                <span aria-hidden="true">
                                  ◇
                                </span>

                                No thumbnail
                              </div>
                            )}
                          </div>

                          <div className="admin-product-workspace-card__content">
                            <div className="admin-product-workspace-card__heading">
                              <div>
                                <span className="admin-product-workspace-card__type">
                                  {
                                    productType
                                  }
                                </span>

                                <h3>
                                  {
                                    productName
                                  }
                                </h3>
                              </div>

                              <div className="admin-product-workspace-card__status-group">
                                <span
                                  className={`
                                    admin-product-workspace-card__stock
                                    ${
                                      productQuantity >
                                      0
                                        ? 'admin-product-workspace-card__stock--available'
                                        : 'admin-product-workspace-card__stock--empty'
                                    }
                                  `}
                                >
                                  {productQuantity >
                                  0
                                    ? 'In stock'
                                    : 'Out of stock'}
                                </span>

                                <span
                                  className={`
                                    admin-product-workspace-card__discount-status
                                    ${
                                      isDiscounted
                                        ? 'admin-product-workspace-card__discount-status--active'
                                        : ''
                                    }
                                  `}
                                >
                                  {isDiscounted
                                    ? 'Discount active'
                                    : 'No discount'}
                                </span>
                              </div>
                            </div>

                            <p className="admin-product-workspace-card__description">
                              {getProductDescription(
                                product
                              )}
                            </p>

                            <div className="admin-product-workspace-card__details">
                              <div className="admin-product-workspace-card__detail">
                                <span>
                                  Base price
                                </span>

                                <strong>
                                  {formatCurrency(
                                    productPrice,
                                    product?.currency
                                  )}
                                </strong>
                              </div>

                              <div className="admin-product-workspace-card__detail">
                                <span>
                                  Inventory
                                </span>

                                <strong>
                                  {
                                    productQuantity
                                  }{' '}
                                  {
                                    productQuantity ===
                                    1
                                      ? 'unit'
                                      : 'units'
                                  }
                                </strong>
                              </div>

                              <div className="admin-product-workspace-card__detail">
                                <span>
                                  Media
                                </span>

                                <strong>
                                  {
                                    media.length
                                  }{' '}
                                  {
                                    media.length ===
                                    1
                                      ? 'file'
                                      : 'files'
                                  }
                                </strong>
                              </div>

                              <div className="admin-product-workspace-card__detail">
                                <span>
                                  Created
                                </span>

                                <strong>
                                  {formatDate(
                                    createdAt
                                  )}
                                </strong>
                              </div>
                            </div>

                            {isDiscounted && (
                              <div className="admin-product-workspace-card__discount">
                                <img
                                  src={
                                    DiscountIcon
                                  }
                                  alt=""
                                />

                                <div>
                                  <span>
                                    {
                                      getDiscountLabel(
                                        product
                                      )
                                    }
                                  </span>

                                  <strong>
                                    {discountPrice !==
                                    null
                                      ? formatCurrency(
                                          discountPrice,
                                          product?.currency
                                        )
                                      : 'Discounted price unavailable'}
                                  </strong>
                                </div>

                                <div className="admin-product-workspace-card__discount-dates">
                                  <span>
                                    {formatDate(
                                      product?.discountStartDate ??
                                        product?.discount_start_date
                                    )}
                                  </span>

                                  <span aria-hidden="true">
                                    →
                                  </span>

                                  <span>
                                    {formatDate(
                                      product?.discountEndDate ??
                                        product?.discount_end_date
                                    )}
                                  </span>
                                </div>
                              </div>
                            )}

                            {media.length >
                              0 && (
                              <div className="admin-product-workspace-card__media">
                                {media
                                  .slice(
                                    0,
                                    5
                                  )
                                  .map(
                                    (
                                      item,
                                      index
                                    ) => {
                                      const mediaUrl =
                                        buildUploadUrl(
                                          item?.url ??
                                            item?.path ??
                                            item?.filename
                                        );

                                      const mediaType =
                                        String(
                                          item?.type ||
                                            ''
                                        )
                                          .trim()
                                          .toLowerCase();

                                      if (
                                        !mediaUrl
                                      ) {
                                        return null;
                                      }

                                      return (
                                        <div
                                          key={
                                            item?.id ??
                                            `${productId}-${index}`
                                          }
                                          className="admin-product-workspace-card__media-item"
                                        >
                                          {mediaType ===
                                          'video' ? (
                                            <video
                                              src={
                                                mediaUrl
                                              }
                                              muted
                                              playsInline
                                              preload="metadata"
                                            />
                                          ) : (
                                            <img
                                              src={
                                                mediaUrl
                                              }
                                              alt={`${productName} media ${
                                                index +
                                                1
                                              }`}
                                              loading="lazy"
                                            />
                                          )}
                                        </div>
                                      );
                                    }
                                  )}

                                {media.length >
                                  5 && (
                                  <div className="admin-product-workspace-card__media-more">
                                    +
                                    {
                                      media.length -
                                      5
                                    }
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="admin-product-workspace-card__actions">
                            <button
                              type="button"
                              className="
                                admin-product-workspace-button
                                admin-product-workspace-button--secondary
                              "
                              onClick={() =>
                                openEditForm(
                                  product
                                )
                              }
                            >
                              Edit product
                            </button>

                            <button
                              type="button"
                              className="
                                admin-product-workspace-button
                                admin-product-workspace-button--secondary
                              "
                              onClick={() =>
                                openDiscountForm(
                                  product
                                )
                              }
                            >
                              <img
                                src={
                                  DiscountIcon
                                }
                                alt=""
                                className="admin-product-workspace-button__icon-image"
                              />

                              {isDiscounted
                                ? 'Edit discount'
                                : 'Add discount'}
                            </button>

                            <button
                              type="button"
                              className="
                                admin-product-workspace-button
                                admin-product-workspace-button--danger
                              "
                              onClick={() =>
                                setDeleteModalProduct(
                                  product
                                )
                              }
                            >
                              <img
                                src={
                                  TrashIcon
                                }
                                alt=""
                                className="admin-product-workspace-button__icon-image"
                              />

                              Delete
                            </button>
                          </div>
                        </article>
                      );
                    }
                  )
                ) : (
                  <div className="admin-product-workspace-empty">
                    <span
                      className="admin-product-workspace-empty__icon"
                      aria-hidden="true"
                    >
                      ◇
                    </span>

                    <h3>
                      No products found
                    </h3>

                    <p>
                      No products match the current search
                      and filter settings.
                    </p>

                    <div className="admin-product-workspace-empty__actions">
                      <button
                        type="button"
                        className="
                          admin-product-workspace-button
                          admin-product-workspace-button--secondary
                        "
                        onClick={() => {
                          setSearchTerm(
                            ''
                          );

                          setSelectedType(
                            ''
                          );
                        }}
                      >
                        Clear filters
                      </button>

                      <button
                        type="button"
                        className="
                          admin-product-workspace-button
                          admin-product-workspace-button--primary
                        "
                        onClick={
                          openAddForm
                        }
                      >
                        Add product
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </section>

        {formMode && (
          <div className="admin-product-workspace-form-overlay">
            <div className="admin-product-workspace-form-dialog">
              <div className="admin-product-workspace-form-dialog__header">
                <div>
                  <span className="admin-product-workspace-eyebrow">
                    Product editor
                  </span>

                  <h2>
                    {formMode === 'add'
                      ? 'Add product'
                      : formMode ===
                          'edit'
                        ? `Edit ${getProductName(
                            selectedProduct
                          )}`
                        : `Manage discount for ${getProductName(
                            selectedProduct
                          )}`}
                  </h2>
                </div>

                <button
                  type="button"
                  className="admin-product-workspace-form-dialog__close"
                  onClick={
                    closeForm
                  }
                  aria-label="Close product form"
                >
                  ×
                </button>
              </div>

              <div className="admin-product-workspace-form-dialog__content">
                {formMode ===
                  'add' && (
                  <ProductForm
                    productTypes={
                      productTypes
                    }
                    onClose={
                      closeForm
                    }
                    onSuccess={
                      handleFormSuccess
                    }
                    fetchProducts={
                      fetchProducts
                    }
                  />
                )}

                {formMode ===
                  'edit' &&
                  selectedProduct && (
                    <EditProductForm
                      productId={
                        getProductId(
                          selectedProduct
                        )
                      }
                      product={
                        selectedProduct
                      }
                      fetchProducts={
                        fetchProducts
                      }
                      onClose={
                        closeForm
                      }
                      onCancel={
                        closeForm
                      }
                      onSuccess={
                        handleFormSuccess
                      }
                    />
                  )}

                {formMode ===
                  'discount' &&
                  selectedProduct && (
                    <DiscountByProductForm
                      product={
                        selectedProduct
                      }
                      onClose={
                        closeForm
                      }
                      onSuccess={
                        handleFormSuccess
                      }
                    />
                  )}
              </div>
            </div>
          </div>
        )}

        {deleteModalProduct && (
          <div className="admin-product-workspace-delete-modal">
            <div
              className="admin-product-workspace-delete-modal__dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-product-delete-title"
            >
              <div className="admin-product-workspace-delete-modal__icon">
                <img
                  src={
                    TrashIcon
                  }
                  alt=""
                />
              </div>

              <span className="admin-product-workspace-delete-modal__eyebrow">
                Delete product
              </span>

              <h2 id="admin-product-delete-title">
                Delete “
                {getProductName(
                  deleteModalProduct
                )}
                ”?
              </h2>

              <p>
                This cannot be undone. Products associated
                with completed or existing orders may be
                protected from deletion by the backend.
              </p>

              <div className="admin-product-workspace-delete-modal__actions">
                <button
                  type="button"
                  className="
                    admin-product-workspace-button
                    admin-product-workspace-button--secondary
                  "
                  onClick={() =>
                    setDeleteModalProduct(
                      null
                    )
                  }
                  disabled={
                    isDeleting
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="
                    admin-product-workspace-button
                    admin-product-workspace-button--danger-solid
                  "
                  onClick={
                    handleDeleteProduct
                  }
                  disabled={
                    isDeleting
                  }
                >
                  {isDeleting ? (
                    <>
                      <span className="admin-product-workspace-spinner admin-product-workspace-spinner--small" />

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

        <BackToTop
          containerRef={
            containerRef
          }
        />
      </main>
    );
  };

const ProductManagement =
  () => {
    return (
      <ProductsProvider>
        <ProductManagementContent />
      </ProductsProvider>
    );
  };

export default ProductManagement;

