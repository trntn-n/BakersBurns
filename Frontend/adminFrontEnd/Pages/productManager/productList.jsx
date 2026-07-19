
// productList.jsx
import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import ProductCard from './productCard';
import SortingControls from './sortingControls';

import {
  useProductContext,
} from './ProductsContext';

import {
  adminApi,
} from '../../config/axios';

import './product_list.css';

/**
 * Safely normalize an uncertain numeric value.
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
 * Safely normalize a string before comparisons.
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
 * Resolve the product type from possible backend field
 * names.
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
      ''
  ).trim();
};

/**
 * Resolve a sortable product value.
 *
 * This allows the list to support common snake_case and
 * camelCase backend field names.
 *
 * @param {object} product
 * @param {string} criteria
 * @returns {unknown}
 */
const getSortableValue = (
  product,
  criteria
) => {
  switch (criteria) {
    case 'price':
      return normalizeNumber(
        product?.price ??
          product?.productPrice ??
          product?.product_price,
        0
      );

    case 'quantity':
      return normalizeNumber(
        product?.quantity ??
          product?.stock ??
          product?.inventory ??
          product?.inventoryQuantity ??
          product?.inventory_quantity,
        0
      );

    case 'createdAt':
      return (
        product?.createdAt ??
        product?.created_at ??
        ''
      );

    case 'type':
      return getProductType(
        product
      );

    case 'name':
    default:
      return (
        product?.name ??
        product?.productName ??
        product?.product_name ??
        ''
      );
  }
};

/**
 * Compare two products using the active sorting rules.
 *
 * @param {object} productA
 * @param {object} productB
 * @param {string} criteria
 * @param {'asc'|'desc'} order
 * @returns {number}
 */
const compareProducts = (
  productA,
  productB,
  criteria,
  order
) => {
  let valueA =
    getSortableValue(
      productA,
      criteria
    );

  let valueB =
    getSortableValue(
      productB,
      criteria
    );

  let comparison = 0;

  if (
    criteria === 'price' ||
    criteria === 'quantity'
  ) {
    comparison =
      normalizeNumber(
        valueA,
        0
      ) -
      normalizeNumber(
        valueB,
        0
      );
  } else if (
    criteria === 'createdAt'
  ) {
    const dateA =
      new Date(
        valueA
      ).getTime();

    const dateB =
      new Date(
        valueB
      ).getTime();

    const safeDateA =
      Number.isFinite(dateA)
        ? dateA
        : 0;

    const safeDateB =
      Number.isFinite(dateB)
        ? dateB
        : 0;

    comparison =
      safeDateA -
      safeDateB;
  } else {
    comparison =
      normalizeString(
        valueA
      ).localeCompare(
        normalizeString(
          valueB
        ),
        undefined,
        {
          numeric: true,
          sensitivity: 'base',
        }
      );
  }

  return order === 'desc'
    ? comparison * -1
    : comparison;
};

const ProductList = ({
  products: productsProp,
  onDeleteProduct,
  onEditProduct,
  onAddDiscount,
}) => {
  const {
    products: contextProducts,
    fetchProducts,
  } = useProductContext();

  /*
   * Prefer products passed by the parent page, but retain
   * context support so ProductList can still be rendered
   * independently elsewhere.
   */
  const products =
    Array.isArray(
      productsProp
    )
      ? productsProp
      : Array.isArray(
            contextProducts
          )
        ? contextProducts
        : [];

  const [
    sortCriteria,
    setSortCriteria,
  ] = useState('name');

  const [
    sortOrder,
    setSortOrder,
  ] = useState('asc');

  const [
    selectedType,
    setSelectedType,
  ] = useState('');

  const [
    errorMessage,
    setErrorMessage,
  ] = useState('');

  const [
    successMessage,
    setSuccessMessage,
  ] = useState('');

  const [
    deletingProductId,
    setDeletingProductId,
  ] = useState(null);

  /**
   * Automatically clear success messages after a short
   * period so old alerts do not remain on screen.
   */
  useEffect(() => {
    if (!successMessage) {
      return undefined;
    }

    const timeoutId =
      window.setTimeout(
        () => {
          setSuccessMessage('');
        },
        5000
      );

    return () => {
      window.clearTimeout(
        timeoutId
      );
    };
  }, [
    successMessage,
  ]);

  /**
   * Automatically clear error messages after a slightly
   * longer period.
   */
  useEffect(() => {
    if (!errorMessage) {
      return undefined;
    }

    const timeoutId =
      window.setTimeout(
        () => {
          setErrorMessage('');
        },
        8000
      );

    return () => {
      window.clearTimeout(
        timeoutId
      );
    };
  }, [
    errorMessage,
  ]);

  /**
   * Build the product type filter options.
   */
  const productTypes =
    useMemo(() => {
      return [
        ...new Set(
          products
            .map(
              getProductType
            )
            .filter(Boolean)
        ),
      ].sort(
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
      products,
    ]);

  /**
   * Filter and sort products without maintaining a
   * duplicated filteredProducts state.
   */
  const displayedProducts =
    useMemo(() => {
      const filteredProducts =
        selectedType
          ? products.filter(
              (product) =>
                normalizeString(
                  getProductType(
                    product
                  )
                ) ===
                normalizeString(
                  selectedType
                )
            )
          : products;

      return [
        ...filteredProducts,
      ].sort(
        (
          productA,
          productB
        ) =>
          compareProducts(
            productA,
            productB,
            sortCriteria,
            sortOrder
          )
      );
    }, [
      products,
      selectedType,
      sortCriteria,
      sortOrder,
    ]);

  /**
   * Change the sorting field.
   *
   * Selecting the same criterion toggles the direction.
   * Selecting a different criterion starts ascending.
   *
   * @param {string} criteria
   */
  const handleSort = (
    criteria
  ) => {
    if (
      criteria ===
      sortCriteria
    ) {
      setSortOrder(
        (
          previousOrder
        ) =>
          previousOrder ===
          'asc'
            ? 'desc'
            : 'asc'
      );

      return;
    }

    setSortCriteria(
      criteria
    );

    setSortOrder('asc');
  };

  /**
   * Filter products by product type.
   *
   * @param {string} type
   */
  const handleFilterByType =
    (
      type
    ) => {
      setSelectedType(
        type || ''
      );
    };

  /**
   * Delete one product.
   *
   * If the parent supplies onDeleteProduct, use that
   * existing handler. Otherwise, fall back to this
   * component's original API deletion logic.
   *
   * @param {number|string} id
   */
  const handleDeleteProduct =
    async (
      id
    ) => {
      if (
        id === null ||
        id === undefined ||
        id === ''
      ) {
        setErrorMessage(
          'Unable to delete this product because its ID is missing.'
        );

        return;
      }

      try {
        setDeletingProductId(
          id
        );

        setErrorMessage('');
        setSuccessMessage('');

        if (
          typeof onDeleteProduct ===
          'function'
        ) {
          await onDeleteProduct(
            id
          );
        } else {
          await adminApi.delete(
            `/products/${id}`
          );

          if (
            typeof fetchProducts ===
            'function'
          ) {
            await fetchProducts();
          }
        }

        setSuccessMessage(
          'Product deleted successfully.'
        );
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
          setErrorMessage(
            serverMessage ||
              'This product cannot be deleted because it is associated with an existing order.'
          );
        } else if (
          status === 404
        ) {
          setErrorMessage(
            serverMessage ||
              'This product could not be found. It may have already been deleted.'
          );
        } else {
          setErrorMessage(
            serverMessage ||
              'Failed to delete the product. Please try again.'
          );
        }
      } finally {
        setDeletingProductId(
          null
        );
      }
    };

  const hasActiveFilter =
    Boolean(
      selectedType
    );

  const clearFilter = () => {
    setSelectedType('');
  };

  return (
    <section className="product-list-admin">
      <div
        className="
          product-list-admin__alerts
        "
        aria-live="polite"
        aria-atomic="true"
      >
        {successMessage && (
          <div
            className="
              product-list-admin-alert
              product-list-admin-alert--success
            "
            role="status"
          >
            <div className="product-list-admin-alert__content">
              <span
                className="product-list-admin-alert__icon"
                aria-hidden="true"
              >
                ✓
              </span>

              <span>
                {successMessage}
              </span>
            </div>

            <button
              type="button"
              className="product-list-admin-alert__close"
              onClick={() =>
                setSuccessMessage('')
              }
              aria-label="Dismiss success message"
            >
              ×
            </button>
          </div>
        )}

        {errorMessage && (
          <div
            className="
              product-list-admin-alert
              product-list-admin-alert--error
            "
            role="alert"
          >
            <div className="product-list-admin-alert__content">
              <span
                className="product-list-admin-alert__icon"
                aria-hidden="true"
              >
                !
              </span>

              <span>
                {errorMessage}
              </span>
            </div>

            <button
              type="button"
              className="product-list-admin-alert__close"
              onClick={() =>
                setErrorMessage('')
              }
              aria-label="Dismiss error message"
            >
              ×
            </button>
          </div>
        )}
      </div>

      <div className="product-list-admin__toolbar">
        <div className="product-list-admin__toolbar-heading">
          <div>
            <span className="product-list-admin__eyebrow">
              Catalog controls
            </span>

            <h3 className="product-list-admin__toolbar-title">
              Sort and filter
            </h3>
          </div>

          <div className="product-list-admin__results">
            <strong>
              {
                displayedProducts
                  .length
              }
            </strong>

            <span>
              {
                displayedProducts
                  .length === 1
                  ? 'result'
                  : 'results'
              }
            </span>
          </div>
        </div>

        <div className="product-list-admin__sorting-host">
          <SortingControls
            onSort={
              handleSort
            }
            sortCriteria={
              sortCriteria
            }
            sortOrder={
              sortOrder
            }
            productTypes={
              productTypes
            }
            selectedType={
              selectedType
            }
            onFilterByType={
              handleFilterByType
            }
          />
        </div>

        {hasActiveFilter && (
          <div className="product-list-admin__active-filter">
            <span>
              Showing product type:
            </span>

            <strong>
              {selectedType}
            </strong>

            <button
              type="button"
              className="product-list-admin__clear-filter"
              onClick={
                clearFilter
              }
            >
              Clear filter
            </button>
          </div>
        )}
      </div>

      {displayedProducts.length >
      0 ? (
        <div className="product-list-admin__grid">
          {displayedProducts.map(
            (
              product
            ) => {
              const productId =
                product?.id ??
                product?.productId ??
                product?.product_id;

              return (
                <article
                  key={
                    productId
                  }
                  className={`
                    product-list-admin__item
                    ${
                      deletingProductId ===
                      productId
                        ? 'product-list-admin__item--deleting'
                        : ''
                    }
                  `}
                >
                  {deletingProductId ===
                    productId && (
                    <div
                      className="product-list-admin__deleting-overlay"
                      role="status"
                    >
                      <span className="product-list-admin__spinner" />

                      <span>
                        Deleting product…
                      </span>
                    </div>
                  )}

                  <ProductCard
                    product={
                      product
                    }
                    onDeleteProduct={
                      handleDeleteProduct
                    }
                    onEditProduct={
                      onEditProduct
                    }
                    onAddDiscount={
                      onAddDiscount
                    }
                    isDeleting={
                      deletingProductId ===
                      productId
                    }
                  />
                </article>
              );
            }
          )}
        </div>
      ) : (
        <div className="product-list-admin__empty-state">
          <div
            className="product-list-admin__empty-icon"
            aria-hidden="true"
          >
            ◇
          </div>

          <h3>
            {hasActiveFilter
              ? 'No matching products'
              : 'No products available'}
          </h3>

          <p>
            {hasActiveFilter
              ? `There are no products assigned to the "${selectedType}" type.`
              : 'Products will appear here after they are added to the catalog.'}
          </p>

          {hasActiveFilter && (
            <button
              type="button"
              className="product-list-admin__empty-button"
              onClick={
                clearFilter
              }
            >
              Show all products
            </button>
          )}
        </div>
      )}
    </section>
  );
};

export default ProductList;

