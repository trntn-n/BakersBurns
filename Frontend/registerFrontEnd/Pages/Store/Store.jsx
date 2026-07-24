import React, { useEffect, useMemo, useState } from 'react';
import { registerApi } from '../../config/axios';
import LoadingPage from '../../Components/loading';
import ProductModal from './ProductModal';
import StoreNavbar from './storeMenu';
import './store.css';

const getProductImageUrl = (thumbnail) => {
  if (!thumbnail) return '';

  const baseUrl = import.meta.env.VITE_IMAGE_BASE_URL || '';
  return `${baseUrl}/uploads/${thumbnail}`;
};

const formatPrice = (price) => {
  const parsedPrice = Number.parseFloat(price);
  return Number.isFinite(parsedPrice) ? parsedPrice.toFixed(2) : '0.00';
};

const formatSaleDate = (date) => {
  if (!date) return '';

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return parsedDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const getProductQuantity = (product) => {
  const quantity = Number(product?.quantity);
  return Number.isFinite(quantity) ? quantity : 0;
};

const Store = () => {
  const [products, setProducts] = useState([]);
  const [selectedType, setSelectedType] = useState('All');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchProducts = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await registerApi.get('/register-store/products');
      setProducts(response.data?.products || []);
    } catch (requestError) {
      console.error('Error fetching products:', requestError);
      setError('We could not load the store. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  /*
   * Only products with a quantity greater than zero are considered
   * available for the public store.
   */
  const availableProducts = useMemo(() => {
    return products.filter((product) => getProductQuantity(product) > 0);
  }, [products]);

  /*
   * Add together the product quantities in each category.
   *
   * Example:
   * Shirts:
   *   Product A quantity: 0
   *   Product B quantity: 4
   *
   * Shirts category quantity: 4
   *
   * The Shirts menu item will therefore be rendered.
   */
  const categoryQuantities = useMemo(() => {
    return products.reduce((categoryTotals, product) => {
      const productType = product.type?.trim();
      const productQuantity = getProductQuantity(product);

      if (!productType) {
        return categoryTotals;
      }

      categoryTotals[productType] =
        (categoryTotals[productType] || 0) + productQuantity;

      return categoryTotals;
    }, {});
  }, [products]);

  /*
   * Only include categories whose combined available quantity
   * is greater than zero.
   */
  const availableTypes = useMemo(() => {
    return Object.entries(categoryQuantities)
      .filter(([, totalQuantity]) => totalQuantity > 0)
      .map(([productType]) => productType);
  }, [categoryQuantities]);

  /*
   * If the selected category becomes unavailable after the products
   * are refreshed, return the user to the All category.
   */
  useEffect(() => {
    if (
      selectedType !== 'All' &&
      !availableTypes.includes(selectedType)
    ) {
      setSelectedType('All');
    }
  }, [availableTypes, selectedType]);

  const filteredProducts = useMemo(() => {
    if (selectedType === 'All') {
      return availableProducts;
    }

    return availableProducts.filter(
      (product) => product.type === selectedType
    );
  }, [availableProducts, selectedType]);

  const closeProductPreview = () => {
    setSelectedProduct(null);
  };

  if (isLoading) {
    return (
      <div className="bb-store-loading">
        <LoadingPage />
      </div>
    );
  }

  return (
    <main className="bb-store-page">
      <StoreNavbar
        selectedType={selectedType}
        onTypeSelect={setSelectedType}
        availableTypes={availableTypes}
        categoryQuantities={categoryQuantities}
      />

      <div className="bb-store-shell">
        <header className="bb-store-header">
          <div>
            <span className="bb-store-eyebrow">
              BakersBurns collection
            </span>

            <h1>Store</h1>
          </div>

          <div className="bb-store-header__summary">
            <strong>{selectedType}</strong>

            <span>
              {filteredProducts.length}{' '}
              {filteredProducts.length === 1 ? 'product' : 'products'}
            </span>
          </div>
        </header>

        {error ? (
          <section
            className="bb-store-state bb-store-state--error"
            role="alert"
          >
            <div
              className="bb-store-state__icon"
              aria-hidden="true"
            >
              !
            </div>

            <h2>Store unavailable</h2>

            <p>{error}</p>

            <button
              type="button"
              className="bb-store-button bb-store-button--primary"
              onClick={fetchProducts}
            >
              Try again
            </button>
          </section>
        ) : filteredProducts.length > 0 ? (
          <section
            className="bb-store-grid"
            aria-label={`${selectedType} products`}
          >
            {filteredProducts.map((product) => {
              const isDiscounted = Boolean(product.isDiscounted);

              const saleEndDate = isDiscounted
                ? formatSaleDate(product.discountEndDate)
                : '';

              return (
                <article
                  className="bb-store-card"
                  key={product.id}
                >
                  <button
                    type="button"
                    className="bb-store-card__button"
                    onClick={() => setSelectedProduct(product)}
                    aria-label={`View ${product.name}`}
                  >
                    <div className="bb-store-card__image">
                      {product.thumbnail ? (
                        <img
                          src={getProductImageUrl(product.thumbnail)}
                          alt={product.name}
                          loading="lazy"
                        />
                      ) : (
                        <div className="bb-store-card__placeholder">
                          No image available
                        </div>
                      )}

                      {isDiscounted && (
                        <span className="bb-store-card__discount">
                          {product.discountType === 'percentage'
                            ? `-${formatPrice(
                                product.discountAmount
                              )}%`
                            : `-$${formatPrice(
                                product.discountAmount
                              )}`}
                        </span>
                      )}

                      <span className="bb-store-card__view">
                        View details
                      </span>
                    </div>

                    <div className="bb-store-card__content">
                      <span className="bb-store-card__type">
                        {product.type || 'Product'}
                      </span>

                      <h2>{product.name}</h2>

                      <div className="bb-store-card__price">
                        {isDiscounted ? (
                          <>
                            <span className="bb-store-card__price-original">
                              ${formatPrice(product.price)}
                            </span>

                            <strong>
                              ${formatPrice(product.discountPrice)}
                            </strong>
                          </>
                        ) : (
                          <strong>
                            ${formatPrice(product.price)}
                          </strong>
                        )}
                      </div>

                      {isDiscounted && saleEndDate && (
                        <p className="bb-store-card__sale-date">
                          Sale ends {saleEndDate}
                        </p>
                      )}
                    </div>
                  </button>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="bb-store-state">
            <div
              className="bb-store-state__icon"
              aria-hidden="true"
            >
              0
            </div>

            <h2>No products available</h2>

            <p>
              There are no products currently available in the{' '}
              {selectedType} category.
            </p>

            {selectedType !== 'All' && (
              <button
                type="button"
                className="bb-store-button bb-store-button--secondary"
                onClick={() => setSelectedType('All')}
              >
                View all products
              </button>
            )}
          </section>
        )}
      </div>

      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={closeProductPreview}
        />
      )}
    </main>
  );
};

export default Store;