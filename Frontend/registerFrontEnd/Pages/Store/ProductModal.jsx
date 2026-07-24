import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerApi } from '../../config/axios';
import QuantityModal from '../Cart/quantityModal';
import './product-modal.css';

const getMediaUrl = (mediaPath) => {
  if (!mediaPath) return '';

  const baseUrl = import.meta.env.VITE_IMAGE_BASE_URL || '';
  return `${baseUrl}/uploads/${mediaPath}`;
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

const formatMeasurement = (value) => {
  const parsedValue = Number.parseFloat(value);

  if (!Number.isFinite(parsedValue)) {
    return {
      inches: '—',
      centimeters: '—',
    };
  }

  return {
    inches: parsedValue,
    centimeters: (parsedValue * 2.54).toFixed(2),
  };
};

const ProductModal = ({ product, onClose }) => {
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [media, setMedia] = useState([]);
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [mediaError, setMediaError] = useState('');
  const touchStartX = useRef(null);
  const navigate = useNavigate();

  const isDiscounted = Boolean(product?.isDiscounted);
  const saleEndDate = isDiscounted
    ? formatSaleDate(product?.discountEndDate)
    : '';

  const dimensions = useMemo(
    () => ({
      length: formatMeasurement(product?.length),
      width: formatMeasurement(product?.width),
      height: formatMeasurement(product?.height),
    }),
    [product?.height, product?.length, product?.width]
  );

  useEffect(() => {
    setCurrentMediaIndex(0);
    setMediaError('');

    const fetchMedia = async () => {
      setLoadingMedia(true);

      try {
        const response = await registerApi.get(
          `/register-store/products/${product.id}/media`
        );

        const mediaData = Array.isArray(response.data)
          ? [...response.data]
          : [];

        const orderedMedia = [
          ...(product.thumbnail
            ? [
                {
                  id: 'thumbnail',
                  url: product.thumbnail,
                  type: 'image',
                  order: 0,
                },
              ]
            : []),
          ...mediaData.sort(
            (firstMedia, secondMedia) =>
              Number(firstMedia.order || 0) -
              Number(secondMedia.order || 0)
          ),
        ];

        setMedia(orderedMedia);
      } catch (error) {
        console.error('Error fetching product media:', error);
        setMediaError('Additional product media could not be loaded.');

        setMedia(
          product.thumbnail
            ? [
                {
                  id: 'thumbnail',
                  url: product.thumbnail,
                  type: 'image',
                  order: 0,
                },
              ]
            : []
        );
      } finally {
        setLoadingMedia(false);
      }
    };

    fetchMedia();
  }, [product.id, product.thumbnail]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape' && !showQuantityModal) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.body.classList.add('bb-productmodal-body-locked');

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.classList.remove('bb-productmodal-body-locked');
    };
  }, [onClose, showQuantityModal]);

  const currentMedia = media[currentMediaIndex] || null;
  const hasMultipleMedia = media.length > 1;
  const isOutOfStock = Number(product?.quantity || 0) <= 0;

  const handleNextSlide = () => {
    setCurrentMediaIndex((currentIndex) =>
      currentIndex < media.length - 1 ? currentIndex + 1 : currentIndex
    );
  };

  const handlePrevSlide = () => {
    setCurrentMediaIndex((currentIndex) =>
      currentIndex > 0 ? currentIndex - 1 : currentIndex
    );
  };

  const handleTouchStart = (event) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event) => {
    if (touchStartX.current === null) return;

    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const difference = touchStartX.current - endX;

    if (difference > 50) {
      handleNextSlide();
    } else if (difference < -50) {
      handlePrevSlide();
    }

    touchStartX.current = null;
  };

  const handleOverlayMouseDown = (event) => {
    if (event.target === event.currentTarget && !showQuantityModal) {
      onClose();
    }
  };

  return (
    <div
      className="bb-productmodal-overlay"
      role="presentation"
      onMouseDown={handleOverlayMouseDown}
    >
      <section
        className="bb-productmodal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bb-productmodal-title"
      >
        <button
          type="button"
          className="bb-productmodal-close"
          onClick={onClose}
          aria-label="Close product details"
        >
          ×
        </button>

        <div className="bb-productmodal-layout">
          <div className="bb-productmodal-gallery">
            <div
              className="bb-productmodal-media-frame"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {loadingMedia ? (
                <div className="bb-productmodal-media-state">
                  <div className="bb-productmodal-spinner" aria-hidden="true" />
                  <span>Loading media…</span>
                </div>
              ) : currentMedia ? (
                currentMedia.type === 'video' ? (
                  <video
                    src={getMediaUrl(currentMedia.url)}
                    controls
                    className="bb-productmodal-media"
                  />
                ) : (
                  <img
                    src={getMediaUrl(currentMedia.url)}
                    alt={`${product.name} view ${currentMediaIndex + 1}`}
                    className="bb-productmodal-media"
                  />
                )
              ) : (
                <div className="bb-productmodal-media-state">
                  <span>No media available</span>
                </div>
              )}

              {hasMultipleMedia && (
                <>
                  <button
                    type="button"
                    className="bb-productmodal-gallery-arrow bb-productmodal-gallery-arrow--previous"
                    onClick={handlePrevSlide}
                    disabled={currentMediaIndex === 0}
                    aria-label="Previous product image"
                  >
                    ‹
                  </button>

                  <button
                    type="button"
                    className="bb-productmodal-gallery-arrow bb-productmodal-gallery-arrow--next"
                    onClick={handleNextSlide}
                    disabled={currentMediaIndex === media.length - 1}
                    aria-label="Next product image"
                  >
                    ›
                  </button>
                </>
              )}
            </div>

            <div className="bb-productmodal-gallery-footer">
              <span>
                {media.length > 0
                  ? `${currentMediaIndex + 1} of ${media.length}`
                  : 'No media'}
              </span>

              {mediaError && (
                <small className="bb-productmodal-media-warning">
                  {mediaError}
                </small>
              )}
            </div>

            {hasMultipleMedia && (
              <div
                className="bb-productmodal-thumbnails"
                aria-label="Product media thumbnails"
              >
                {media.map((mediaItem, index) => (
                  <button
                    type="button"
                    key={mediaItem.id || `${mediaItem.url}-${index}`}
                    className={`bb-productmodal-thumbnail${
                      index === currentMediaIndex
                        ? ' bb-productmodal-thumbnail--active'
                        : ''
                    }`}
                    onClick={() => setCurrentMediaIndex(index)}
                    aria-label={`View product media ${index + 1}`}
                    aria-current={
                      index === currentMediaIndex ? 'true' : undefined
                    }
                  >
                    {mediaItem.type === 'video' ? (
                      <span className="bb-productmodal-thumbnail__video">
                        ▶
                      </span>
                    ) : (
                      <img
                        src={getMediaUrl(mediaItem.url)}
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
                      />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bb-productmodal-content">
            <header className="bb-productmodal-header">
              <span className="bb-productmodal-eyebrow">
                {product.type || 'BakersBurns product'}
              </span>

              <h1 id="bb-productmodal-title">{product.name}</h1>

              <div className="bb-productmodal-price-block">
                {isDiscounted ? (
                  <>
                    <span className="bb-productmodal-price-original">
                      ${formatPrice(product.price)}
                    </span>
                    <strong className="bb-productmodal-price-active">
                      ${formatPrice(product.discountPrice)}
                    </strong>
                  </>
                ) : (
                  <strong className="bb-productmodal-price-active">
                    ${formatPrice(product.price)}
                  </strong>
                )}
              </div>

              {isDiscounted && saleEndDate && (
                <p className="bb-productmodal-sale">
                  Sale ends {saleEndDate}
                </p>
              )}
            </header>

            <div className="bb-productmodal-description">
              <h2>Description</h2>
              <p>{product.description || 'No description is available.'}</p>
            </div>

            <dl className="bb-productmodal-details">
              <div className="bb-productmodal-detail">
                <dt>Length</dt>
                <dd>
                  {dimensions.length.centimeters} cm
                  <span>{dimensions.length.inches} in</span>
                </dd>
              </div>

              <div className="bb-productmodal-detail">
                <dt>Width</dt>
                <dd>
                  {dimensions.width.centimeters} cm
                  <span>{dimensions.width.inches} in</span>
                </dd>
              </div>

              <div className="bb-productmodal-detail">
                <dt>Height</dt>
                <dd>
                  {dimensions.height.centimeters} cm
                  <span>{dimensions.height.inches} in</span>
                </dd>
              </div>

              <div className="bb-productmodal-detail">
                <dt>Weight</dt>
                <dd>
                  {product.weight ?? '—'} lbs
                </dd>
              </div>

              <div className="bb-productmodal-detail bb-productmodal-detail--inventory">
                <dt>Availability</dt>
                <dd>
                  <span
                    className={`bb-productmodal-stock${
                      isOutOfStock
                        ? ' bb-productmodal-stock--out'
                        : ' bb-productmodal-stock--available'
                    }`}
                  >
                    {isOutOfStock
                      ? 'Out of stock'
                      : `${product.quantity} available`}
                  </span>
                </dd>
              </div>
            </dl>

            <div className="bb-productmodal-actions">
              <button
                type="button"
                className="bb-productmodal-button bb-productmodal-button--primary"
                onClick={() => setShowQuantityModal(true)}
                disabled={isOutOfStock}
              >
                {isOutOfStock ? 'Currently unavailable' : 'Choose quantity'}
              </button>

              <button
                type="button"
                className="bb-productmodal-button bb-productmodal-button--secondary"
                onClick={onClose}
              >
                Continue shopping
              </button>
            </div>
          </div>
        </div>
      </section>

      {showQuantityModal && (
        <QuantityModal
          product={product}
          maxQuantity={product.quantity}
          onClose={() => setShowQuantityModal(false)}
          onAddToCart={() => console.log('Added to cart')}
          onViewCart={() => navigate('/cart')}
        />
      )}
    </div>
  );
};

export default ProductModal;