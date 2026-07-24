import React, { useEffect, useMemo, useState } from 'react';
import { registerApi } from '../../config/axios';
import './store_menu.css';

const getThumbnailUrl = (thumbnail) => {
  if (!thumbnail) return '';

  const baseUrl =
    import.meta.env.VITE_IMAGE_BASE_URL ||
    import.meta.env.VITE_BACKEND ||
    '';

  return `${baseUrl}/uploads/${thumbnail}`;
};

const normalizeType = (type) => {
  return String(type || '').trim().toLowerCase();
};

const StoreNavbar = ({
  onTypeSelect,
  selectedType = 'All',
  availableTypes = [],
  categoryQuantities = {},
}) => {
  const [productTypes, setProductTypes] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoadingTypes, setIsLoadingTypes] = useState(true);
  const [typeError, setTypeError] = useState('');

  useEffect(() => {
    const fetchProductTypes = async () => {
      setIsLoadingTypes(true);
      setTypeError('');

      try {
        const response = await registerApi.get(
          '/register-store/product-types'
        );

        setProductTypes(
          Array.isArray(response.data) ? response.data : []
        );
      } catch (error) {
        console.error('Error fetching product types:', error);
        setTypeError('Categories are temporarily unavailable.');
      } finally {
        setIsLoadingTypes(false);
      }
    };

    fetchProductTypes();
  }, []);

  /*
   * Create a normalized lookup so capitalization or whitespace
   * differences do not cause valid categories to be excluded.
   */
  const availableTypeLookup = useMemo(() => {
    return new Set(availableTypes.map(normalizeType));
  }, [availableTypes]);

  /*
   * Only keep categories that:
   * 1. Exist in availableTypes.
   * 2. Have a combined quantity greater than zero.
   */
  const visibleProductTypes = useMemo(() => {
    return productTypes.filter((productType) => {
      const type = String(productType?.type || '').trim();

      if (!type) {
        return false;
      }

      const normalizedType = normalizeType(type);

      const matchingQuantityEntry = Object.entries(
        categoryQuantities
      ).find(([categoryType]) => {
        return normalizeType(categoryType) === normalizedType;
      });

      const categoryQuantity = Number(
        matchingQuantityEntry?.[1] || 0
      );

      return (
        availableTypeLookup.has(normalizedType) &&
        categoryQuantity > 0
      );
    });
  }, [
    productTypes,
    availableTypeLookup,
    categoryQuantities,
  ]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleTypeClick = (type) => {
    onTypeSelect(type);
    setIsOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="bb-storemenu-trigger"
        onClick={() => setIsOpen(true)}
        aria-expanded={isOpen}
        aria-controls="bb-storemenu-panel"
      >
        <span
          className="bb-storemenu-trigger__icon"
          aria-hidden="true"
        >
          <span />
          <span />
          <span />
        </span>

        Categories
      </button>

      <div
        className={`bb-storemenu-overlay${
          isOpen ? ' bb-storemenu-overlay--open' : ''
        }`}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setIsOpen(false);
          }
        }}
        aria-hidden={!isOpen}
      >
        <aside
          id="bb-storemenu-panel"
          className={`bb-storemenu-panel${
            isOpen ? ' bb-storemenu-panel--open' : ''
          }`}
          aria-label="Store categories"
        >
          <header className="bb-storemenu-header">
            <div>
              <span className="bb-storemenu-eyebrow">
                Browse the store
              </span>

              <h2>Categories</h2>
            </div>

            <button
              type="button"
              className="bb-storemenu-close"
              onClick={() => setIsOpen(false)}
              aria-label="Close categories menu"
            >
              ×
            </button>
          </header>

          <div className="bb-storemenu-content">
            <button
              type="button"
              className={`bb-storemenu-all${
                selectedType === 'All'
                  ? ' bb-storemenu-all--active'
                  : ''
              }`}
              onClick={() => handleTypeClick('All')}
            >
              <span>All Products</span>
              <strong>View everything</strong>
            </button>

            {isLoadingTypes ? (
              <div className="bb-storemenu-status">
                Loading categories…
              </div>
            ) : typeError ? (
              <div className="bb-storemenu-status bb-storemenu-status--error">
                {typeError}
              </div>
            ) : visibleProductTypes.length > 0 ? (
              <div className="bb-storemenu-list">
                {visibleProductTypes.map(
                  (productType, sectionIndex) => {
                    const type = String(
                      productType.type || ''
                    ).trim();

                    const isActive =
                      normalizeType(selectedType) ===
                      normalizeType(type);

                    const thumbnails = Array.isArray(
                      productType.thumbnails
                    )
                      ? productType.thumbnails.slice(0, 3)
                      : [];

                    return (
                      <button
                        type="button"
                        key={`${type}-${sectionIndex}`}
                        className={`bb-storemenu-category${
                          isActive
                            ? ' bb-storemenu-category--active'
                            : ''
                        }`}
                        onClick={() => handleTypeClick(type)}
                      >
                        <div className="bb-storemenu-category__heading">
                          <span>Shop category</span>
                          <h3>{type}s</h3>
                        </div>

                        <div className="bb-storemenu-thumbnails">
                          {thumbnails.length > 0 ? (
                            thumbnails.map(
                              (thumbnail, thumbIndex) => (
                                <img
                                  key={`${type}-${thumbIndex}`}
                                  src={getThumbnailUrl(thumbnail)}
                                  alt=""
                                  aria-hidden="true"
                                  loading="lazy"
                                />
                              )
                            )
                          ) : (
                            <span className="bb-storemenu-thumbnails__empty">
                              No previews
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  }
                )}
              </div>
            ) : (
              <div className="bb-storemenu-status">
                No categories available.
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
};

export default StoreNavbar;