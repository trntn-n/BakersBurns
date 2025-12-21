import React, { useState, useEffect } from 'react';
import { registerApi } from '../../config/axios';
import LoadingPage from '../../Components/loading';
import ProductModal from './ProductModal';
import './storeGrid.css';

const StoreGrid = () => {
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch products on mount
  useEffect(() => {
    const fetchProducts = async () => {
      setIsLoading(true);
      try {
        const response = await registerApi.get('/register-store/products');
        setProducts(response.data.products || []);
      } catch (err) {
        console.error('Error fetching products:', err);
        setError('Failed to load products. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchProducts();
  }, []);

  const openProductPreview = (product) => {
    setSelectedProduct(product);
  };

  const closeProductPreview = () => {
    setSelectedProduct(null);
  };

  if (isLoading) {
    return <LoadingPage />;
  }

  if (error) {
    return <div className="store-grid-error">{error}</div>;
  }

  return (
    <div className="store-grid-container">
      {selectedProduct && (
        <ProductModal product={selectedProduct} onClose={closeProductPreview} />
      )}
      <div className="store-grid">
        {products.length > 0 ? (
          products.map((product) => (
            <div
              key={product.id}
              className="store-grid-item"
              onClick={() => openProductPreview(product)}
            >
              <div className="store-grid-item-image">
                <img
                  src={`${import.meta.env.VITE_IMAGE_BASE_URL}/uploads/${product.thumbnail}`}
                  alt={product.name}
                />
              </div>
              <div className="store-grid-item-info">
                <h3 >{product.name}</h3>
                <p className="title">${parseFloat(product.price).toFixed(2)}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="store-grid-no-products">No products available.</p>
        )}
      </div>
    </div>
  );
};

export default StoreGrid;
