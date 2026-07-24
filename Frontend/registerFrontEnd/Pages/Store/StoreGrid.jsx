import React, { useEffect, useState } from 'react';
import { registerApi } from '../../config/axios';
import LoadingPage from '../../Components/loading';
import ProductModal from './ProductModal';
import './storeGrid.css';

const getProductImageUrl = (thumbnail) => {
  if (!thumbnail) return '';

  const baseUrl = import.meta.env.VITE_IMAGE_BASE_URL || '';
  return `${baseUrl}/uploads/${thumbnail}`;
};

const formatPrice = (price) => {
  const parsedPrice = Number.parseFloat(price);
  return Number.isFinite(parsedPrice) ? parsedPrice.toFixed(2) : '0.00';
};

const StoreGrid = () => {
  const [products, setProducts] = useState([]);
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
      setError('We could not load the products. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const openProductPreview = (product) => {
    setSelectedProduct(product);
  };

  const closeProductPreview = () => {
    setSelectedProduct(null);
  };

  if (isLoading) {
    return (
      <div className="bb-storegrid-loading">
        <LoadingPage />
      </div>
    );
  }

  return (
    <section className="bb-storegrid-section" aria-labelledby="bb-storegrid-title">
      <div className="bb-storegrid-section__header">
        <div>
          <span className="bb-storegrid-eyebrow">Featured collection</span>
          <h2 id="bb-storegrid-title">Shop BakersBurns</h2>
        </div>

        <p>
          Explore our currently available products and select an item to view
          more details.
        </p>
      </div>

      {error ? (
        <div className="bb-storegrid-state bb-storegrid-state--error" role="alert">
          <div className="bb-storegrid-state__icon" aria-hidden="true">
            !
          </div>
          <h3>Products unavailable</h3>
          <p>{error}</p>
          <button
            type="button"
            className="bb-storegrid-button"
            onClick={fetchProducts}
          >
            Try again
          </button>
        </div>
      ) : products.length > 0 ? (
        <div className="bb-storegrid-grid">
          {products.map((product) => (
            <article className="bb-storegrid-card" key={product.id}>
              <button
                type="button"
                className="bb-storegrid-card__button"
                onClick={() => openProductPreview(product)}
                aria-label={`View ${product.name}`}
              >
                <div className="bb-storegrid-card__image">
                  {product.thumbnail ? (
                    <img
                      src={getProductImageUrl(product.thumbnail)}
                      alt={product.name}
                      loading="lazy"
                    />
                  ) : (
                    <div className="bb-storegrid-card__placeholder">
                      <span>No image</span>
                    </div>
                  )}
                </div>

                <div className="bb-storegrid-card__content">
                  <span className="bb-storegrid-card__label">
                    View product
                  </span>
                  <h3>{product.name}</h3>
                  <p>${formatPrice(product.price)}</p>
                </div>
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="bb-storegrid-state">
          <div className="bb-storegrid-state__icon" aria-hidden="true">
            0
          </div>
          <h3>No products available</h3>
          <p>Please check back soon for new BakersBurns products.</p>
        </div>
      )}

      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={closeProductPreview}
        />
      )}
    </section>
  );
};

export default StoreGrid;