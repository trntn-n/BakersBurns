import React, {
    useEffect,
    useMemo,
    useRef,
    useState,
  } from "react";
  
  import {
    motion,
    useReducedMotion,
  } from "framer-motion";
  
  import { adminApi } from "../config/axios";
  
  const DEFAULT_EDITS = {
    aspect: "original",
    brightness: 100,
    contrast: 100,
    saturation: 100,
    rotation: 0,
    flipX: false,
    flipY: false,
    zoom: 1,
    panX: 0,
    panY: 0,
  };
  
  const ASPECT_OPTIONS = [
    {
      value: "original",
      label: "Original",
    },
    {
      value: "1:1",
      label: "Square",
    },
    {
      value: "4:5",
      label: "Portrait",
    },
    {
      value: "16:9",
      label: "Wide",
    },
  ];
  
  const getErrorMessage = (
    error,
    fallback
  ) =>
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    fallback;
  
  const loadCanvasImage = (url) =>
    new Promise((resolve, reject) => {
      const image = new Image();
  
      image.crossOrigin = "anonymous";
      image.onload = () =>
        resolve(image);
      image.onerror = () =>
        reject(
          new Error(
            "The image could not be loaded into the editor."
          )
        );
  
      const separator =
        url.includes("?") ? "&" : "?";
      image.src = `${url}${separator}editor=${Date.now()}`;
    });
  
  const getAspectRatio = (
    aspect,
    image,
    rotation
  ) => {
    if (aspect === "1:1") {
      return 1;
    }
  
    if (aspect === "4:5") {
      return 4 / 5;
    }
  
    if (aspect === "16:9") {
      return 16 / 9;
    }
  
    const swapsDimensions =
      Math.abs(rotation % 180) === 90;
    const width = swapsDimensions
      ? image.naturalHeight
      : image.naturalWidth;
    const height = swapsDimensions
      ? image.naturalWidth
      : image.naturalHeight;
  
    return width / height;
  };
  
  const renderEditedImage = async (
    imageUrl,
    edits
  ) => {
    const image =
      await loadCanvasImage(imageUrl);
  
    const aspectRatio =
      getAspectRatio(
        edits.aspect,
        image,
        edits.rotation
      );
  
    const maximumDimension = 2200;
    const outputWidth =
      aspectRatio >= 1
        ? maximumDimension
        : Math.round(
            maximumDimension *
              aspectRatio
          );
    const outputHeight =
      aspectRatio >= 1
        ? Math.round(
            maximumDimension /
              aspectRatio
          )
        : maximumDimension;
  
    const canvas =
      document.createElement(
        "canvas"
      );
    canvas.width = Math.max(
      1,
      outputWidth
    );
    canvas.height = Math.max(
      1,
      outputHeight
    );
  
    const context =
      canvas.getContext("2d", {
        alpha: false,
      });
  
    if (!context) {
      throw new Error(
        "Canvas editing is not supported in this browser."
      );
    }
  
    context.fillStyle = "#ffffff";
    context.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );
  
    const radians =
      (edits.rotation * Math.PI) /
      180;
    const swapsDimensions =
      Math.abs(
        edits.rotation % 180
      ) === 90;
  
    const rotatedWidth =
      swapsDimensions
        ? image.naturalHeight
        : image.naturalWidth;
    const rotatedHeight =
      swapsDimensions
        ? image.naturalWidth
        : image.naturalHeight;
  
    const coverScale =
      Math.max(
        canvas.width /
          rotatedWidth,
        canvas.height /
          rotatedHeight
      ) * edits.zoom;
  
    const renderedWidth =
      rotatedWidth * coverScale;
    const renderedHeight =
      rotatedHeight * coverScale;
    const availablePanX =
      Math.max(
        0,
        renderedWidth -
          canvas.width
      ) / 2;
    const availablePanY =
      Math.max(
        0,
        renderedHeight -
          canvas.height
      ) / 2;
  
    context.save();
    context.translate(
      canvas.width / 2 +
        (edits.panX / 100) *
          availablePanX,
      canvas.height / 2 +
        (edits.panY / 100) *
          availablePanY
    );
    context.rotate(radians);
    context.scale(
      (edits.flipX ? -1 : 1) *
        coverScale,
      (edits.flipY ? -1 : 1) *
        coverScale
    );
    context.filter = [
      `brightness(${edits.brightness}%)`,
      `contrast(${edits.contrast}%)`,
      `saturate(${edits.saturation}%)`,
    ].join(" ");
    context.imageSmoothingEnabled =
      true;
    context.imageSmoothingQuality =
      "high";
  
    context.drawImage(
      image,
      -image.naturalWidth / 2,
      -image.naturalHeight / 2
    );
    context.restore();
  
    const blob = await new Promise(
      (resolve) =>
        canvas.toBlob(
          resolve,
          "image/webp",
          0.9
        )
    );
  
    if (!blob) {
      throw new Error(
        "The edited image could not be generated."
      );
    }
  
    return blob;
  };
  
  const RangeControl = ({
    label,
    min,
    max,
    step = 1,
    suffix = "",
    value,
    onChange,
  }) => (
    <label className="bb-photo-editor-range">
      <span>
        <strong>{label}</strong>
        <output>
          {value}
          {suffix}
        </output>
      </span>
  
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) =>
          onChange(
            Number(
              event.target.value
            )
          )
        }
      />
    </label>
  );
  
  const PhotoEditor = ({
    item,
    endpoint,
    imageUrl,
    onClose,
    onSaved,
  }) => {
    const reduceMotion =
      useReducedMotion();
    const previewImageRef =
      useRef(null);
  
    const [edits, setEdits] =
      useState(DEFAULT_EDITS);
    const [imageDimensions, setImageDimensions] =
      useState({
        width: 4,
        height: 3,
      });
    const [saving, setSaving] =
      useState(false);
    const [error, setError] =
      useState("");
  
    useEffect(() => {
      setEdits(DEFAULT_EDITS);
      setError("");
    }, [item.filename]);
  
    const updateEdit = (
      property,
      value
    ) => {
      setEdits((current) => ({
        ...current,
        [property]: value,
      }));
    };
  
    const previewAspectRatio =
      useMemo(() => {
        if (edits.aspect === "1:1") {
          return 1;
        }
  
        if (edits.aspect === "4:5") {
          return 4 / 5;
        }
  
        if (
          edits.aspect === "16:9"
        ) {
          return 16 / 9;
        }
  
        const swapsDimensions =
          Math.abs(
            edits.rotation % 180
          ) === 90;
  
        return swapsDimensions
          ? imageDimensions.height /
              imageDimensions.width
          : imageDimensions.width /
              imageDimensions.height;
      }, [
        edits.aspect,
        edits.rotation,
        imageDimensions,
      ]);
  
    const previewStyle = {
      "--bb-photo-brightness":
        `${edits.brightness}%`,
      "--bb-photo-contrast":
        `${edits.contrast}%`,
      "--bb-photo-saturation":
        `${edits.saturation}%`,
      "--bb-photo-rotation":
        `${edits.rotation}deg`,
      "--bb-photo-scale-x":
        edits.flipX ? -1 : 1,
      "--bb-photo-scale-y":
        edits.flipY ? -1 : 1,
      "--bb-photo-zoom": edits.zoom,
      "--bb-photo-pan-x":
        `${edits.panX}%`,
      "--bb-photo-pan-y":
        `${edits.panY}%`,
    };
  
    const handleSave = async () => {
      try {
        setSaving(true);
        setError("");
  
        const editedBlob =
          await renderEditedImage(
            imageUrl,
            edits
          );
  
        const baseName =
          item.filename.replace(
            /\.[^/.]+$/,
            ""
          );
        const editedFile = new File(
          [editedBlob],
          `${baseName}.webp`,
          {
            type: "image/webp",
          }
        );
        const formData =
          new FormData();
  
        formData.append(
          "image",
          editedFile
        );
  
        const response =
          await adminApi.put(
            `${endpoint}/replace-gallery-items/${encodeURIComponent(
              item.filename
            )}`,
            formData,
            {
              withCredentials: true,
            }
          );
  
        onSaved(response.data);
      } catch (saveError) {
        console.error(
          "Unable to save edited gallery image:",
          saveError
        );
  
        setError(
          getErrorMessage(
            saveError,
            saveError.message ||
              "The edited image could not be saved."
          )
        );
      } finally {
        setSaving(false);
      }
    };
  
    return (
      <motion.div
        className="bb-photo-editor-backdrop"
        initial={
          reduceMotion
            ? false
            : { opacity: 0 }
        }
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.section
          className="bb-photo-editor"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bb-photo-editor-title"
          initial={
            reduceMotion
              ? false
              : {
                  opacity: 0,
                  y: 16,
                  scale: 0.99,
                }
          }
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
          }}
          exit={{
            opacity: 0,
            y: 12,
            scale: 0.99,
          }}
        >
          <header className="bb-photo-editor-header">
            <div>
              <span className="bb-admin-gallery-eyebrow">
                Browser photo editor
              </span>
              <h2 id="bb-photo-editor-title">
                Edit {item.filename}
              </h2>
            </div>
  
            <button
              type="button"
              className="bb-admin-gallery-modal-close"
              onClick={onClose}
              disabled={saving}
              aria-label="Close photo editor"
            >
              ×
            </button>
          </header>
  
          <div className="bb-photo-editor-layout">
            <div className="bb-photo-editor-canvas-column">
              <div
                className="bb-photo-editor-stage"
                style={{
                  aspectRatio:
                    previewAspectRatio,
                }}
              >
                <img
                  ref={previewImageRef}
                  src={imageUrl}
                  crossOrigin="anonymous"
                  alt={`Editing ${item.title}`}
                  style={previewStyle}
                  onLoad={(event) =>
                    setImageDimensions({
                      width:
                        event.currentTarget
                          .naturalWidth,
                      height:
                        event.currentTarget
                          .naturalHeight,
                    })
                  }
                />
  
                <div
                  className="bb-photo-editor-grid-overlay"
                  aria-hidden="true"
                />
              </div>
  
              <p className="bb-photo-editor-stage-help">
                Use zoom and position
                controls to frame the crop.
                Saving creates an optimized
                WebP replacement.
              </p>
            </div>
  
            <aside className="bb-photo-editor-controls">
              <section className="bb-photo-editor-control-group">
                <div className="bb-photo-editor-control-heading">
                  <h3>Crop</h3>
                </div>
  
                <div className="bb-photo-editor-segmented">
                  {ASPECT_OPTIONS.map(
                    (option) => (
                      <button
                        key={
                          option.value
                        }
                        type="button"
                        className={
                          edits.aspect ===
                          option.value
                            ? "bb-photo-editor-segmented--active"
                            : ""
                        }
                        onClick={() =>
                          updateEdit(
                            "aspect",
                            option.value
                          )
                        }
                      >
                        {option.label}
                      </button>
                    )
                  )}
                </div>
  
                <RangeControl
                  label="Zoom"
                  min={1}
                  max={3}
                  step={0.01}
                  value={edits.zoom}
                  onChange={(value) =>
                    updateEdit(
                      "zoom",
                      value
                    )
                  }
                />
  
                <RangeControl
                  label="Horizontal"
                  min={-100}
                  max={100}
                  suffix="%"
                  value={edits.panX}
                  onChange={(value) =>
                    updateEdit(
                      "panX",
                      value
                    )
                  }
                />
  
                <RangeControl
                  label="Vertical"
                  min={-100}
                  max={100}
                  suffix="%"
                  value={edits.panY}
                  onChange={(value) =>
                    updateEdit(
                      "panY",
                      value
                    )
                  }
                />
              </section>
  
              <section className="bb-photo-editor-control-group">
                <div className="bb-photo-editor-control-heading">
                  <h3>Transform</h3>
                </div>
  
                <div className="bb-photo-editor-action-grid">
                  <button
                    type="button"
                    onClick={() =>
                      updateEdit(
                        "rotation",
                        (edits.rotation -
                          90 +
                          360) %
                          360
                      )
                    }
                  >
                    ↶ Rotate
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateEdit(
                        "rotation",
                        (edits.rotation +
                          90) %
                          360
                      )
                    }
                  >
                    ↷ Rotate
                  </button>
                  <button
                    type="button"
                    className={
                      edits.flipX
                        ? "bb-photo-editor-action--active"
                        : ""
                    }
                    onClick={() =>
                      updateEdit(
                        "flipX",
                        !edits.flipX
                      )
                    }
                  >
                    ⇋ Flip X
                  </button>
                  <button
                    type="button"
                    className={
                      edits.flipY
                        ? "bb-photo-editor-action--active"
                        : ""
                    }
                    onClick={() =>
                      updateEdit(
                        "flipY",
                        !edits.flipY
                      )
                    }
                  >
                    ⇅ Flip Y
                  </button>
                </div>
              </section>
  
              <section className="bb-photo-editor-control-group">
                <div className="bb-photo-editor-control-heading">
                  <h3>Adjust</h3>
                </div>
  
                <RangeControl
                  label="Brightness"
                  min={40}
                  max={160}
                  suffix="%"
                  value={
                    edits.brightness
                  }
                  onChange={(value) =>
                    updateEdit(
                      "brightness",
                      value
                    )
                  }
                />
                <RangeControl
                  label="Contrast"
                  min={40}
                  max={160}
                  suffix="%"
                  value={
                    edits.contrast
                  }
                  onChange={(value) =>
                    updateEdit(
                      "contrast",
                      value
                    )
                  }
                />
                <RangeControl
                  label="Saturation"
                  min={0}
                  max={200}
                  suffix="%"
                  value={
                    edits.saturation
                  }
                  onChange={(value) =>
                    updateEdit(
                      "saturation",
                      value
                    )
                  }
                />
              </section>
            </aside>
          </div>
  
          {error && (
            <div
              className="bb-photo-editor-error"
              role="alert"
            >
              {error}
            </div>
          )}
  
          <footer className="bb-photo-editor-footer">
            <button
              type="button"
              className="bb-admin-gallery-button bb-admin-gallery-button--secondary"
              onClick={() =>
                setEdits(
                  DEFAULT_EDITS
                )
              }
              disabled={saving}
            >
              Reset edits
            </button>
  
            <div>
              <button
                type="button"
                className="bb-admin-gallery-button bb-admin-gallery-button--secondary"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="bb-admin-gallery-button bb-admin-gallery-button--primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving
                  ? "Rendering…"
                  : "Save edited image"}
              </button>
            </div>
          </footer>
        </motion.section>
      </motion.div>
    );
  };
  
  export default PhotoEditor;
  