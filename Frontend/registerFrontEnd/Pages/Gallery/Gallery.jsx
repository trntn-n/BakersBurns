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
  
  import { registerApi } from "../../config/axios";
  import CollageOverlay from "../Home/CollageOverlay";
  
  import "./gallery.css";
  
  const GALLERY_ENDPOINT =
    "/user-gallery/get-gallery";
  
  const normalizeImageList = (
    imageValue
  ) => {
    if (Array.isArray(imageValue)) {
      return imageValue
        .map((image) =>
          String(image || "").trim()
        )
        .filter(Boolean);
    }
  
    if (
      typeof imageValue !== "string"
    ) {
      return [];
    }
  
    const trimmedValue =
      imageValue.trim();
  
    if (!trimmedValue) {
      return [];
    }
  
    try {
      const parsedValue =
        JSON.parse(
          trimmedValue.replace(
            /\\"/g,
            '"'
          )
        );
  
      if (Array.isArray(parsedValue)) {
        return parsedValue
          .map((image) =>
            String(
              image || ""
            ).trim()
          )
          .filter(Boolean);
      }
  
      if (
        typeof parsedValue ===
        "string"
      ) {
        return [
          parsedValue.trim(),
        ].filter(Boolean);
      }
    } catch {
      /*
       * Some older records contain a plain filename
       * rather than a JSON array.
       */
    }
  
    return [trimmedValue];
  };
  
  const getGalleryImageUrl = (
    imageName
  ) => {
    if (!imageName) {
      return "";
    }
  
    const backendUrl =
      (
        import.meta.env
          .VITE_BACKEND || ""
      ).replace(/\/+$/, "");
  
    const normalizedImageName =
      String(imageName).replace(
        /^\/+/,
        ""
      );
  
    return `${backendUrl}/galleryuploads/${normalizedImageName}`;
  };
  
  const normalizeGalleryItem = (
    item,
    index
  ) => {
    const images =
      normalizeImageList(
        item?.image
      );
  
    return {
      ...item,
      id:
        item?.id ??
        `gallery-${index}`,
      title:
        String(
          item?.title ||
          "BakersBurns creation"
        ).trim(),
      description:
        String(
          item?.description || ""
        ).trim(),
      images,
      coverImage:
        images[0] || "",
    };
  };
  
  const Gallery = () => {
    const reduceMotion =
      useReducedMotion();
  
    const [gallery, setGallery] =
      useState([]);
  
    const [selectedIndex, setSelectedIndex] =
      useState(null);
  
    const [loading, setLoading] =
      useState(true);
  
    const [error, setError] =
      useState("");
  
    const selectedItem =
      selectedIndex === null
        ? null
        : gallery[selectedIndex] ||
          null;
  
    const fetchGallery =
      useCallback(async () => {
        try {
          setLoading(true);
          setError("");
  
          const response =
            await registerApi.get(
              GALLERY_ENDPOINT
            );
  
          const galleryData =
            Array.isArray(
              response.data
            )
              ? response.data
              : Array.isArray(
                    response.data
                      ?.gallery
                  )
                ? response.data
                    .gallery
                : [];
  
          setGallery(
            galleryData
              .map(
                normalizeGalleryItem
              )
              .filter(
                (item) =>
                  Boolean(
                    item.coverImage
                  )
              )
          );
        } catch (requestError) {
          console.error(
            "Unable to display gallery:",
            requestError
          );
  
          setGallery([]);
  
          setError(
            requestError.response
              ?.data?.message ||
              "The gallery could not be loaded. Please try again."
          );
        } finally {
          setLoading(false);
        }
      }, []);
  
    useEffect(() => {
      fetchGallery();
    }, [fetchGallery]);
  
    const closeModal =
      useCallback(() => {
        setSelectedIndex(null);
      }, []);
  
    const showPrevious =
      useCallback(() => {
        setSelectedIndex(
          (currentIndex) => {
            if (
              currentIndex === null
            ) {
              return null;
            }
  
            return (
              currentIndex -
              1 +
              gallery.length
            ) % gallery.length;
          }
        );
      }, [gallery.length]);
  
    const showNext =
      useCallback(() => {
        setSelectedIndex(
          (currentIndex) => {
            if (
              currentIndex === null
            ) {
              return null;
            }
  
            return (
              currentIndex + 1
            ) % gallery.length;
          }
        );
      }, [gallery.length]);
  
    useEffect(() => {
      if (!selectedItem) {
        return undefined;
      }
  
      const previousOverflow =
        document.body.style
          .overflow;
  
      document.body.style.overflow =
        "hidden";
  
      const handleKeyDown = (
        event
      ) => {
        if (event.key === "Escape") {
          closeModal();
        } else if (
          event.key ===
          "ArrowLeft"
        ) {
          showPrevious();
        } else if (
          event.key ===
          "ArrowRight"
        ) {
          showNext();
        }
      };
  
      document.addEventListener(
        "keydown",
        handleKeyDown
      );
  
      return () => {
        document.body.style.overflow =
          previousOverflow;
  
        document.removeEventListener(
          "keydown",
          handleKeyDown
        );
      };
    }, [
      closeModal,
      selectedItem,
      showNext,
      showPrevious,
    ]);
  
    const itemMotion =
      useMemo(
        () =>
          reduceMotion
            ? {}
            : {
                initial: {
                  opacity: 0,
                  y: 20,
                },
                whileInView: {
                  opacity: 1,
                  y: 0,
                },
                viewport: {
                  once: true,
                  amount: 0.16,
                },
                transition: {
                  duration: 0.32,
                  ease: "easeOut",
                },
              },
        [reduceMotion]
      );
  
    return (
      <main className="bb-gallery-page">
        <section className="bb-gallery-hero">
          <div
            className="bb-gallery-hero-grid"
            aria-hidden="true"
          />
  
          <div className="bb-gallery-hero-glow bb-gallery-hero-glow--one" />
          <div className="bb-gallery-hero-glow bb-gallery-hero-glow--two" />
  
          <motion.div
            className="bb-gallery-hero-content"
            initial={
              reduceMotion
                ? false
                : {
                    opacity: 0,
                    y: 18,
                  }
            }
            animate={{
              opacity: 1,
              y: 0,
            }}
            transition={{
              duration: 0.48,
            }}
          >
            <span className="bb-gallery-eyebrow">
              Made by hand
            </span>
  
            <h1>
              Our Gallery
            </h1>
  
            <p>
              Explore custom hats,
              burned designs, and
              BakersBurns creations
              made for real customers
              and events.
            </p>
  
            <div
              className="bb-gallery-collage"
              aria-hidden="true"
            >
              <CollageOverlay />
            </div>
          </motion.div>
        </section>
  
        <section
          className="bb-gallery-content"
          aria-labelledby="bb-gallery-collection-title"
        >
          <header className="bb-gallery-section-heading">
            <div>
              <span className="bb-gallery-eyebrow">
                Recent work
              </span>
  
              <h2 id="bb-gallery-collection-title">
                Crafted with character
              </h2>
            </div>
  
            {!loading &&
              !error &&
              gallery.length > 0 && (
                <p>
                  {gallery.length}{" "}
                  {gallery.length === 1
                    ? "creation"
                    : "creations"}
                </p>
              )}
          </header>
  
          {loading ? (
            <div
              className="bb-gallery-state"
              role="status"
              aria-live="polite"
            >
              <span
                className="bb-gallery-spinner"
                aria-hidden="true"
              />
  
              <h3>
                Loading the gallery
              </h3>
  
              <p>
                Gathering our latest
                creations.
              </p>
            </div>
          ) : error ? (
            <div
              className="bb-gallery-state bb-gallery-state--error"
              role="alert"
            >
              <span aria-hidden="true">
                !
              </span>
  
              <h3>
                Gallery unavailable
              </h3>
  
              <p>{error}</p>
  
              <button
                type="button"
                onClick={fetchGallery}
              >
                Try Again
              </button>
            </div>
          ) : gallery.length === 0 ? (
            <div className="bb-gallery-state">
              <span
                className="bb-gallery-state-mark"
                aria-hidden="true"
              >
                B
              </span>
  
              <h3>
                New work is coming
              </h3>
  
              <p>
                There are no gallery
                pieces to display yet.
              </p>
            </div>
          ) : (
            <div className="bb-gallery-grid">
              {gallery.map(
                (item, index) => (
                  <motion.button
                    type="button"
                    className="bb-gallery-card"
                    key={item.id}
                    onClick={() =>
                      setSelectedIndex(
                        index
                      )
                    }
                    aria-label={`Open ${item.title}`}
                    {...itemMotion}
                  >
                    <span className="bb-gallery-card-image-wrap">
                      <img
                        src={getGalleryImageUrl(
                          item.coverImage
                        )}
                        alt={item.title}
                        className="bb-gallery-card-image"
                        loading="lazy"
                        decoding="async"
                      />
  
                      <span className="bb-gallery-card-shade" />
                    </span>
  
                    <span className="bb-gallery-card-content">
                      <span className="bb-gallery-card-index">
                        {String(
                          index + 1
                        ).padStart(
                          2,
                          "0"
                        )}
                      </span>
  
                      <span className="bb-gallery-card-copy">
                        <strong>
                          {item.title}
                        </strong>
  
                        <small>
                          View creation
                        </small>
                      </span>
  
                      <span
                        className="bb-gallery-card-arrow"
                        aria-hidden="true"
                      >
                        ↗
                      </span>
                    </span>
                  </motion.button>
                )
              )}
            </div>
          )}
        </section>
  
        <AnimatePresence>
          {selectedItem && (
            <motion.div
              className="bb-gallery-lightbox-overlay"
              initial={
                reduceMotion
                  ? false
                  : { opacity: 0 }
              }
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 0.18,
              }}
              onMouseDown={(
                event
              ) => {
                if (
                  event.target ===
                  event.currentTarget
                ) {
                  closeModal();
                }
              }}
            >
              <motion.section
                className="bb-gallery-lightbox"
                role="dialog"
                aria-modal="true"
                aria-labelledby="bb-gallery-lightbox-title"
                initial={
                  reduceMotion
                    ? false
                    : {
                        opacity: 0,
                        y: 20,
                        scale: 0.98,
                      }
                }
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                }}
                exit={
                  reduceMotion
                    ? undefined
                    : {
                        opacity: 0,
                        y: 12,
                        scale: 0.985,
                      }
                }
                transition={{
                  duration: 0.2,
                }}
                onMouseDown={(
                  event
                ) =>
                  event.stopPropagation()
                }
              >
                <button
                  type="button"
                  className="bb-gallery-lightbox-close"
                  onClick={closeModal}
                  aria-label="Close gallery image"
                  autoFocus
                >
                  ×
                </button>
  
                <div className="bb-gallery-lightbox-image-wrap">
                  <AnimatePresence
                    mode="wait"
                  >
                    <motion.img
                      key={
                        selectedItem.id
                      }
                      src={getGalleryImageUrl(
                        selectedItem
                          .coverImage
                      )}
                      alt={
                        selectedItem.title
                      }
                      className="bb-gallery-lightbox-image"
                      initial={
                        reduceMotion
                          ? false
                          : {
                              opacity: 0,
                            }
                      }
                      animate={{
                        opacity: 1,
                      }}
                      exit={{
                        opacity: 0,
                      }}
                      transition={{
                        duration: 0.16,
                      }}
                    />
                  </AnimatePresence>
  
                  {gallery.length > 1 && (
                    <>
                      <button
                        type="button"
                        className="bb-gallery-lightbox-nav bb-gallery-lightbox-nav--previous"
                        onClick={
                          showPrevious
                        }
                        aria-label="Previous gallery image"
                      >
                        ‹
                      </button>
  
                      <button
                        type="button"
                        className="bb-gallery-lightbox-nav bb-gallery-lightbox-nav--next"
                        onClick={showNext}
                        aria-label="Next gallery image"
                      >
                        ›
                      </button>
                    </>
                  )}
                </div>
  
                <footer className="bb-gallery-lightbox-details">
                  <div>
                    <span className="bb-gallery-eyebrow">
                      Creation{" "}
                      {selectedIndex + 1}{" "}
                      of {gallery.length}
                    </span>
  
                    <h2 id="bb-gallery-lightbox-title">
                      {
                        selectedItem.title
                      }
                    </h2>
  
                    {selectedItem.description && (
                      <p>
                        {
                          selectedItem.description
                        }
                      </p>
                    )}
                  </div>
  
                  {gallery.length > 1 && (
                    <div className="bb-gallery-lightbox-position">
                      {gallery.map(
                        (item, index) => (
                          <button
                            type="button"
                            key={
                              item.id
                            }
                            className={
                              index ===
                              selectedIndex
                                ? "bb-gallery-lightbox-dot bb-gallery-lightbox-dot--active"
                                : "bb-gallery-lightbox-dot"
                            }
                            onClick={() =>
                              setSelectedIndex(
                                index
                              )
                            }
                            aria-label={`View ${item.title}`}
                            aria-current={
                              index ===
                              selectedIndex
                                ? "true"
                                : undefined
                            }
                          />
                        )
                      )}
                    </div>
                  )}
                </footer>
              </motion.section>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    );
  };
  
  export default Gallery;
  