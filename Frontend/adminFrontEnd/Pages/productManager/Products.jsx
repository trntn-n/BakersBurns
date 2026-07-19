
// ProductManagement.jsx
import React, {
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  ProductsProvider,
  useProductContext,
} from './ProductsContext';

import LoadingPage from '../../Components/loading';
import ProductForm from './productForm';
import DiscountForm from './discountForm';
import ProductList from './productList';
import BackToTop from './components/BackToTop';

import './product_management.css';

/**
 * Convert uncertain numeric values into safe numbers.
 *
 * Product records can sometimes contain numeric strings,
 * null values, or missing properties depending on the
 * backend response.
 *
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
const normalizeNumber = (
  value,
  fallback = 0
) => {
  const parsedValue = Number(value);

  return Number.isFinite(parsedValue)
    ? parsedValue
    : fallback;
};

/**
 * Return the available inventory quantity from a product.
 *
 * This supports several likely property names so the page
 * summary remains usable if older product records use a
 * different naming convention.
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
 * Determine whether a product currently has a discount.
 *
 * @param {object} product
 * @returns {boolean}
 */
const productHasDiscount = (
  product
) => {
  const discount =
    product?.discount;

  if (!discount) {
    return false;
  }

  if (
    typeof discount === 'number' ||
    typeof discount === 'string'
  ) {
    return normalizeNumber(
      discount,
      0
    ) > 0;
  }

  const discountAmount =
    discount?.amount ??
    discount?.percentage ??
    discount?.percent ??
    discount?.discountAmount ??
    discount?.discount_amount ??
    discount?.discountPercentage ??
    discount?.discount_percentage;

  return normalizeNumber(
    discountAmount,
    0
  ) > 0;
};

/**
 * Determine whether a product should be considered
 * out of stock.
 *
 * @param {object} product
 * @returns {boolean}
 */
const productIsOutOfStock = (
  product
) => {
  return getProductQuantity(
    product
  ) <= 0;
};

const ProductManagementContent = () => {
  const {
    products,
    productTypes,
    isLoading,
    fetchProducts,
    handleDeleteProduct,
    applyDiscount,
  } = useProductContext();

  const [
    showAddProductForm,
    setShowAddProductForm,
  ] = useState(false);

  const [
    editingProduct,
    setEditingProduct,
  ] = useState(null);

  const [
    editingDiscount,
    setEditingDiscount,
  ] = useState(null);

  const containerRef =
    useRef(null);

  const safeProducts =
    Array.isArray(products)
      ? products
      : [];

  const productSummary =
    useMemo(() => {
      const totalProducts =
        safeProducts.length;

      const totalUnits =
        safeProducts.reduce(
          (
            total,
            product
          ) => {
            return (
              total +
              Math.max(
                0,
                getProductQuantity(
                  product
                )
              )
            );
          },
          0
        );

      const discountedProducts =
        safeProducts.filter(
          productHasDiscount
        ).length;

      const outOfStockProducts =
        safeProducts.filter(
          productIsOutOfStock
        ).length;

      return {
        totalProducts,
        totalUnits,
        discountedProducts,
        outOfStockProducts,
      };
    }, [
      safeProducts,
    ]);

  /**
   * Open a blank product form.
   */
  const openAddProductForm =
    () => {
      setEditingProduct(null);
      setShowAddProductForm(true);
    };

  /**
   * Open the product form with an existing product.
   *
   * The existing ProductForm API is preserved. The
   * editing product is also supplied as a prop in case
   * the form supports prop-based editing.
   *
   * @param {object} product
   */
  const openEditProductForm =
    (
      product
    ) => {
      setEditingProduct(
        product
      );

      setShowAddProductForm(
        true
      );
    };

  /**
   * Close and reset the product form state.
   */
  const closeProductForm =
    () => {
      setShowAddProductForm(
        false
      );

      setEditingProduct(
        null
      );
    };

  /**
   * Open the discount editor for a product.
   *
   * @param {object} product
   */
  const openDiscountForm =
    (
      product
    ) => {
      setEditingDiscount({
        productId:
          product.id,
        ...(
          product.discount ||
          {}
        ),
      });
    };

  /**
   * Close and reset the discount form.
   */
  const closeDiscountForm =
    () => {
      setEditingDiscount(
        null
      );
    };

  /**
   * Save a discount and close the form after the
   * operation completes successfully.
   *
   * This works whether applyDiscount is synchronous or
   * returns a Promise.
   *
   * @param {object} discountData
   */
  const handleSaveDiscount =
    async (
      discountData
    ) => {
      await applyDiscount(
        discountData
      );

      closeDiscountForm();
    };

  /**
   * Refresh the current product collection.
   */
  const handleRefreshProducts =
    async () => {
      if (
        typeof fetchProducts !==
        'function'
      ) {
        return;
      }

      await fetchProducts();
    };

  if (isLoading) {
    return <LoadingPage />;
  }

  return (
    <main
      className="product-admin-body"
      ref={containerRef}
    >
      <section className="product-admin-page">
        <div className="product-admin-page__shell">
          <header className="product-admin-header">
            <div className="product-admin-header__content">
              <span className="product-admin-eyebrow">
                Store administration
              </span>

              <h1 className="product-admin-header__title">
                Product Manager
              </h1>

              <p className="product-admin-header__description">
                Add products, update inventory,
                manage pricing, and create
                product-specific discounts from one
                place.
              </p>
            </div>

            <div className="product-admin-header__actions">
              <button
                type="button"
                className="
                  product-admin-button
                  product-admin-button--secondary
                "
                onClick={
                  handleRefreshProducts
                }
              >
                <span
                  className="product-admin-button__icon"
                  aria-hidden="true"
                >
                  ↻
                </span>

                Refresh
              </button>

              <button
                type="button"
                className="
                  product-admin-button
                  product-admin-button--primary
                  product-admin-button--large
                "
                onClick={
                  openAddProductForm
                }
              >
                <span
                  className="product-admin-button__icon"
                  aria-hidden="true"
                >
                  +
                </span>

                Add product
              </button>
            </div>
          </header>

          <section
            className="product-admin-summary"
            aria-label="Product inventory summary"
          >
            <article className="product-admin-summary-card">
              <span className="product-admin-summary-card__label">
                Products
              </span>

              <strong className="product-admin-summary-card__value">
                {
                  productSummary
                    .totalProducts
                }
              </strong>

              <span className="product-admin-summary-card__description">
                Total catalog entries
              </span>
            </article>

            <article className="product-admin-summary-card">
              <span className="product-admin-summary-card__label">
                Inventory
              </span>

              <strong className="product-admin-summary-card__value">
                {
                  productSummary
                    .totalUnits
                }
              </strong>

              <span className="product-admin-summary-card__description">
                Units currently available
              </span>
            </article>

            <article className="product-admin-summary-card">
              <span className="product-admin-summary-card__label">
                Discounts
              </span>

              <strong className="product-admin-summary-card__value">
                {
                  productSummary
                    .discountedProducts
                }
              </strong>

              <span className="product-admin-summary-card__description">
                Products with active offers
              </span>
            </article>

            <article
              className={`
                product-admin-summary-card
                ${
                  productSummary
                    .outOfStockProducts > 0
                    ? 'product-admin-summary-card--warning'
                    : ''
                }
              `}
            >
              <span className="product-admin-summary-card__label">
                Out of stock
              </span>

              <strong className="product-admin-summary-card__value">
                {
                  productSummary
                    .outOfStockProducts
                }
              </strong>

              <span className="product-admin-summary-card__description">
                Products needing attention
              </span>
            </article>
          </section>

          <section className="product-admin-directory">
            <div className="product-admin-directory__header">
              <div>
                <span className="product-admin-eyebrow">
                  Product directory
                </span>

                <h2 className="product-admin-directory__title">
                  Store inventory
                </h2>

                <p className="product-admin-directory__description">
                  Review existing products and use
                  their controls to edit details,
                  update discounts, or remove an
                  item.
                </p>
              </div>

              <span className="product-admin-directory__count">
                {
                  productSummary
                    .totalProducts
                }{' '}
                {
                  productSummary
                    .totalProducts === 1
                    ? 'product'
                    : 'products'
                }
              </span>
            </div>

            <div className="product-admin-directory__content">
              {safeProducts.length === 0 ? (
                <div className="product-admin-empty-state">
                  <div
                    className="product-admin-empty-state__icon"
                    aria-hidden="true"
                  >
                    +
                  </div>

                  <h3>
                    No products found
                  </h3>

                  <p>
                    Create your first product to
                    begin building the store
                    inventory.
                  </p>

                  <button
                    type="button"
                    className="
                      product-admin-button
                      product-admin-button--primary
                    "
                    onClick={
                      openAddProductForm
                    }
                  >
                    Add first product
                  </button>
                </div>
              ) : (
                <div className="product-admin-list-wrapper">
                  <ProductList
                    products={
                      safeProducts
                    }
                    onDeleteProduct={
                      handleDeleteProduct
                    }
                    onEditProduct={
                      openEditProductForm
                    }
                    onAddDiscount={
                      openDiscountForm
                    }
                  />
                </div>
              )}
            </div>
          </section>
        </div>
      </section>

      {showAddProductForm && (
        <div className="product-admin-overlay-host">
          <ProductForm
            productTypes={
              productTypes
            }
            product={
              editingProduct
            }
            editingProduct={
              editingProduct
            }
            onClose={
              closeProductForm
            }
          />
        </div>
      )}

      {editingDiscount && (
        <div className="product-admin-overlay-host">
          <DiscountForm
            discount={
              editingDiscount
            }
            onSave={
              handleSaveDiscount
            }
            onClose={
              closeDiscountForm
            }
          />
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

const ProductManagement = () => {
  return (
    <ProductsProvider>
      <ProductManagementContent />
    </ProductsProvider>
  );
};

export default ProductManagement;

