import React, {
    useEffect,
    useMemo,
    useRef,
    useState,
  } from "react";
  import { motion, useReducedMotion } from "framer-motion";
  import { adminApi } from "../config/axios";
  
  const DEFAULT_EDITS = Object.freeze({
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
  });
  
  const ASPECT_OPTIONS = [
    { value: "original", label: "Original" },
    { value: "1:1", label: "Square" },
    { value: "4:5", label: "Portrait" },
    { value: "16:9", label: "Wide" },
  ];
  
  const MAX_OUTPUT_DIMENSION = 2200;
  const WEBP_QUALITY = 0.9;
  
  const getErrorMessage = (error, fallback) =>
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallback;
  
  const normalizeRotation = (rotation) =>
    ((rotation % 360) + 360) % 360;
  
  const appendCacheBuster = (url) => {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}editor=${Date.now()}`;
  };
  
  const loadCanvasImage = (url) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.decoding = "async";
  
      image.onload = () => resolve(image);
      image.onerror = () =>
        reject(
          new Error(
            "The source image could not be loaded. Verify the image URL and CORS headers."
          )
        );
  
      image.src = appendCacheBuster(url);
    });
  
  const getAspectRatio = (aspect, image, rotation) => {
    if (aspect === "1:1") return 1;
    if (aspect === "4:5") return 4 / 5;
    if (aspect === "16:9") return 16 / 9;
  
    const rotated = Math.abs(rotation % 180) === 90;
    const width = rotated
      ? image.naturalHeight
      : image.naturalWidth;
    const height = rotated
      ? image.naturalWidth
      : image.naturalHeight;
  
    return width / height;
  };
  
  const canvasToBlob = (canvas) =>
    new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob?.size) {
            resolve(blob);
            return;
          }
  
          reject(
            new Error(
              "The browser could not generate the edited image."
            )
          );
        },
        "image/webp",
        WEBP_QUALITY
      );
    });
  
  const renderEditedImage = async (imageUrl, edits) => {
    const image = await loadCanvasImage(imageUrl);
    const rotation = normalizeRotation(edits.rotation);
    const aspectRatio = getAspectRatio(
      edits.aspect,
      image,
      rotation
    );
  
    const outputWidth =
      aspectRatio >= 1
        ? MAX_OUTPUT_DIMENSION
        : Math.round(MAX_OUTPUT_DIMENSION * aspectRatio);
    const outputHeight =
      aspectRatio >= 1
        ? Math.round(MAX_OUTPUT_DIMENSION / aspectRatio)
        : MAX_OUTPUT_DIMENSION;
  
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, outputWidth);
    canvas.height = Math.max(1, outputHeight);
  
    const context = canvas.getContext("2d", {
      alpha: false,
    });
  
    if (!context) {
      throw new Error(
        "Canvas editing is not supported in this browser."
      );
    }
  
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  
    const swapsDimensions =
      Math.abs(rotation % 180) === 90;
    const rotatedWidth = swapsDimensions
      ? image.naturalHeight
      : image.naturalWidth;
    const rotatedHeight = swapsDimensions
      ? image.naturalWidth
      : image.naturalHeight;
  
    const coverScale =
      Math.max(
        canvas.width / rotatedWidth,
        canvas.height / rotatedHeight
      ) * edits.zoom;
  
    const renderedWidth = rotatedWidth * coverScale;
    const renderedHeight = rotatedHeight * coverScale;
    const availablePanX =
      Math.max(0, renderedWidth - canvas.width) / 2;
    const availablePanY =
      Math.max(0, renderedHeight - canvas.height) / 2;
  
    context.save();
    context.translate(
      canvas.width / 2 +
        (edits.panX / 100) * availablePanX,
      canvas.height / 2 +
        (edits.panY / 100) * availablePanY
    );
    context.rotate((rotation * Math.PI) / 180);
    context.scale(
      (edits.flipX ? -1 : 1) * coverScale,
      (edits.flipY ? -1 : 1) * coverScale
    );
    context.filter = [
      `brightness(${edits.brightness}%)`,
      `contrast(${edits.contrast}%)`,
      `saturate(${edits.saturation}%)`,
    ].join(" ");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      image,
      -image.naturalWidth / 2,
      -image.naturalHeight / 2
    );
    context.restore();
  
    return canvasToBlob(canvas);
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
          onChange(Number(event.target.value))
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
    const reduceMotion = useReducedMotion();
    const closeButtonRef = useRef(null);
  
    const [edits, setEdits] = useState({
      ...DEFAULT_EDITS,
    });
    const [imageDimensions, setImageDimensions] =
      useState({ width: 4, height: 3 });
    const [previewLoaded, setPreviewLoaded] =
      useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
  
    const filename = item?.filename || "";
    const title = item?.title || filename || "gallery image";
  
    useEffect(() => {
      setEdits({ ...DEFAULT_EDITS });
      setPreviewLoaded(false);
      setError("");
      closeButtonRef.current?.focus();
    }, [filename]);
  
    useEffect(() => {
      const handleKeyDown = (event) => {
        if (event.key === "Escape" && !saving) {
          onClose();
        }
      };
  
      document.addEventListener("keydown", handleKeyDown);
      return () =>
        document.removeEventListener(
          "keydown",
          handleKeyDown
        );
    }, [onClose, saving]);
  
    const hasEdits = useMemo(
      () =>
        Object.keys(DEFAULT_EDITS).some(
          (key) => edits[key] !== DEFAULT_EDITS[key]
        ),
      [edits]
    );
  
    const previewAspectRatio = useMemo(() => {
      if (edits.aspect === "1:1") return 1;
      if (edits.aspect === "4:5") return 4 / 5;
      if (edits.aspect === "16:9") return 16 / 9;
  
      const rotated =
        Math.abs(edits.rotation % 180) === 90;
  
      return rotated
        ? imageDimensions.height / imageDimensions.width
        : imageDimensions.width / imageDimensions.height;
    }, [
      edits.aspect,
      edits.rotation,
      imageDimensions,
    ]);
  
    const previewStyle = {
      "--bb-photo-brightness": `${edits.brightness}%`,
      "--bb-photo-contrast": `${edits.contrast}%`,
      "--bb-photo-saturation": `${edits.saturation}%`,
      "--bb-photo-rotation": `${edits.rotation}deg`,
      "--bb-photo-scale-x": edits.flipX ? -1 : 1,
      "--bb-photo-scale-y": edits.flipY ? -1 : 1,
      "--bb-photo-zoom": edits.zoom,
      "--bb-photo-pan-x": `${edits.panX}%`,
      "--bb-photo-pan-y": `${edits.panY}%`,
    };
  
    const updateEdit = (property, value) => {
      setError("");
      setEdits((current) => ({
        ...current,
        [property]: value,
      }));
    };
  
    const resetEdits = () => {
      setError("");
      setEdits({ ...DEFAULT_EDITS });
    };
  
    const handleSave = async () => {
      if (!filename || !endpoint || !imageUrl) {
        setError(
          "The editor is missing the image filename, endpoint, or source URL."
        );
        return;
      }
  
      try {
        setSaving(true);
        setError("");
  
        const editedBlob = await renderEditedImage(
          imageUrl,
          edits
        );
        const baseName =
          filename.replace(/\.[^/.]+$/, "") || "gallery-image";
        const editedFile = new File(
          [editedBlob],
          `${baseName}.webp`,
          {
            type: "image/webp",
            lastModified: Date.now(),
          }
        );
        const formData = new FormData();
  
        // This must match upload.single("image") in the Express route.
        formData.append("image", editedFile, editedFile.name);
  
        const response = await adminApi.put(
          `${endpoint}/replace-gallery-items/${encodeURIComponent(
            filename
          )}`,
          formData,
          {
            withCredentials: true,
            headers: {
              // Axios supplies the multipart boundary in the browser.
              "Content-Type": "multipart/form-data",
            },
          }
        );
  
        onSaved(response.data);
      } catch (saveError) {
        console.error(
          "Unable to save edited gallery image:",
          {
            status: saveError?.response?.status,
            response: saveError?.response?.data,
            contentType:
              saveError?.config?.headers?.["Content-Type"],
            error: saveError,
          }
        );
  
        setError(
          getErrorMessage(
            saveError,
            "The edited image could not be saved."
          )
        );
      } finally {
        setSaving(false);
      }
    };
  
    const closeFromBackdrop = (event) => {
      if (
        event.target === event.currentTarget &&
        !saving
      ) {
        onClose();
      }
    };
  
    return (
      <motion.div
        className="bb-photo-editor-backdrop"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onMouseDown={closeFromBackdrop}
      >
        <motion.section
          className="bb-photo-editor"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bb-photo-editor-title"
          initial={
            reduceMotion
              ? false
              : { opacity: 0, y: 16, scale: 0.99 }
          }
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.99 }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className="bb-photo-editor-header">
            <div>
              <span className="bb-admin-gallery-eyebrow">
                Browser photo editor
              </span>
              <h2 id="bb-photo-editor-title">
                Edit {filename}
              </h2>
            </div>
  
            <button
              ref={closeButtonRef}
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
                style={{ aspectRatio: previewAspectRatio }}
                aria-busy={!previewLoaded}
              >
                {!previewLoaded && (
                  <div className="bb-photo-editor-loading">
                    Loading image…
                  </div>
                )}
  
                <img
                  key={`${filename}-${imageUrl}`}
                  src={appendCacheBuster(imageUrl)}
                  crossOrigin="anonymous"
                  alt={`Editing ${title}`}
                  style={previewStyle}
                  onLoad={(event) => {
                    const image = event.currentTarget;
                    setImageDimensions({
                      width: image.naturalWidth || 4,
                      height: image.naturalHeight || 3,
                    });
                    setPreviewLoaded(true);
                    setError("");
                  }}
                  onError={() => {
                    setPreviewLoaded(false);
                    setError(
                      "The preview could not be loaded. Check the gallery URL and CORS configuration."
                    );
                  }}
                />
  
                <div
                  className="bb-photo-editor-grid-overlay"
                  aria-hidden="true"
                />
              </div>
  
              <p className="bb-photo-editor-stage-help">
                Frame the image with the crop, zoom, and position
                controls. Saving creates an optimized WebP
                replacement.
              </p>
            </div>
  
            <aside className="bb-photo-editor-controls">
              <section className="bb-photo-editor-control-group">
                <div className="bb-photo-editor-control-heading">
                  <h3>Crop</h3>
                </div>
  
                <div className="bb-photo-editor-segmented">
                  {ASPECT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={
                        edits.aspect === option.value
                          ? "bb-photo-editor-segmented--active"
                          : ""
                      }
                      onClick={() =>
                        updateEdit("aspect", option.value)
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
  
                <RangeControl
                  label="Zoom"
                  min={1}
                  max={3}
                  step={0.01}
                  value={edits.zoom}
                  onChange={(value) =>
                    updateEdit("zoom", value)
                  }
                />
                <RangeControl
                  label="Horizontal"
                  min={-100}
                  max={100}
                  suffix="%"
                  value={edits.panX}
                  onChange={(value) =>
                    updateEdit("panX", value)
                  }
                />
                <RangeControl
                  label="Vertical"
                  min={-100}
                  max={100}
                  suffix="%"
                  value={edits.panY}
                  onChange={(value) =>
                    updateEdit("panY", value)
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
                        normalizeRotation(edits.rotation - 90)
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
                        normalizeRotation(edits.rotation + 90)
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
                      updateEdit("flipX", !edits.flipX)
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
                      updateEdit("flipY", !edits.flipY)
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
                  value={edits.brightness}
                  onChange={(value) =>
                    updateEdit("brightness", value)
                  }
                />
                <RangeControl
                  label="Contrast"
                  min={40}
                  max={160}
                  suffix="%"
                  value={edits.contrast}
                  onChange={(value) =>
                    updateEdit("contrast", value)
                  }
                />
                <RangeControl
                  label="Saturation"
                  min={0}
                  max={200}
                  suffix="%"
                  value={edits.saturation}
                  onChange={(value) =>
                    updateEdit("saturation", value)
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
              onClick={resetEdits}
              disabled={saving || !hasEdits}
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
                disabled={saving || !previewLoaded}
              >
                {saving
                  ? "Rendering and uploading…"
                  : "Save edited image"}
              </button>
            </div>
          </footer>
        </motion.section>
      </motion.div>
    );
  };
  
  export default PhotoEditor;
  