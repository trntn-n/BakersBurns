import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import PropTypes from "prop-types";
import { AnimatePresence, motion } from "framer-motion";
import imageCompression from "browser-image-compression";

import MediaUploader from "../../Components/desktopMediaUploader";
import LoadingPage from "../../Components/loading";
import { useProductContext } from "./ProductsContext";

import "./product_form.css";

const ProductForm = ({ product = {}, onClose }) => {
  const {
    fetchProducts,
    addProductWithMedia,
    fetchProductTypes,
    productTypes,
  } = useProductContext();

  const [newProduct, setNewProduct] = useState({
    name: product.name || "",
    description: product.description || "",
    price: product.price || 0,
    type: product.type || "",
    newType: "",
    quantity: product.quantity || 1,
    length: product.length || 0,
    width: product.width || 0,
    height: product.height || 0,
    weight: product.weight || 0,
    unit: product.unit || "standard",
    thumbnail: null,
  });

  const [mediaPreviews, setMediaPreviews] = useState([]);
  const [isAddingNewType, setIsAddingNewType] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [missingFields, setMissingFields] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCompressingThumbnail, setIsCompressingThumbnail] =
    useState(false);
  const [thumbnailPreview, setThumbnailPreview] = useState("");

  const nameRef = useRef(null);
  const descriptionRef = useRef(null);
  const priceRef = useRef(null);
  const quantityRef = useRef(null);
  const typeRef = useRef(null);
  const newTypeRef = useRef(null);
  const thumbnailRef = useRef(null);
  const lengthRef = useRef(null);
  const widthRef = useRef(null);
  const heightRef = useRef(null);
  const weightRef = useRef(null);

  const inputRefs = {
    name: nameRef,
    description: descriptionRef,
    price: priceRef,
    quantity: quantityRef,
    type: typeRef,
    newType: newTypeRef,
    thumbnail: thumbnailRef,
    length: lengthRef,
    width: widthRef,
    height: heightRef,
    weight: weightRef,
  };

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        await Promise.all([
          fetchProducts(),
          fetchProductTypes(),
        ]);
      } catch (error) {
        console.error(
          "Error loading product form data:",
          error
        );

        setErrorMessage(
          "Some product information could not be loaded."
        );
      }
    };

    loadInitialData();
  }, [fetchProductTypes, fetchProducts]);

  useEffect(() => {
    return () => {
      if (thumbnailPreview) {
        URL.revokeObjectURL(thumbnailPreview);
      }
    };
  }, [thumbnailPreview]);

  const updateProductField = useCallback(
    (field, value) => {
      setNewProduct((previousProduct) => ({
        ...previousProduct,
        [field]: value,
      }));

      setMissingFields((previousFields) =>
        previousFields.filter(
          (missingField) => missingField !== field
        )
      );

      if (errorMessage) {
        setErrorMessage("");
      }
    },
    [errorMessage]
  );

  const getFieldClassName = (field) => {
    const baseClassName =
      "bb-product-form__control";

    return missingFields.includes(field)
      ? `${baseClassName} ${baseClassName}--invalid`
      : baseClassName;
  };

  const validateFields = () => {
    const missing = [];

    if (!newProduct.name.trim()) {
      missing.push("name");
    }

    if (!newProduct.description.trim()) {
      missing.push("description");
    }

    if (
      !Number.isFinite(Number(newProduct.price)) ||
      Number(newProduct.price) <= 0
    ) {
      missing.push("price");
    }

    if (
      !Number.isInteger(Number(newProduct.quantity)) ||
      Number(newProduct.quantity) <= 0
    ) {
      missing.push("quantity");
    }

    if (!newProduct.thumbnail) {
      missing.push("thumbnail");
    }

    if (
      !Number.isFinite(Number(newProduct.length)) ||
      Number(newProduct.length) <= 0
    ) {
      missing.push("length");
    }

    if (
      !Number.isFinite(Number(newProduct.width)) ||
      Number(newProduct.width) <= 0
    ) {
      missing.push("width");
    }

    if (
      !Number.isFinite(Number(newProduct.height)) ||
      Number(newProduct.height) <= 0
    ) {
      missing.push("height");
    }

    if (
      !Number.isFinite(Number(newProduct.weight)) ||
      Number(newProduct.weight) <= 0
    ) {
      missing.push("weight");
    }

    if (isAddingNewType) {
      if (!newProduct.newType.trim()) {
        missing.push("newType");
      }
    } else if (!newProduct.type.trim()) {
      missing.push("type");
    }

    return missing;
  };

  const focusFirstMissingField = (missing) => {
    const firstMissingField = missing[0];
    const targetRef = inputRefs[firstMissingField];

    if (!targetRef?.current) {
      return;
    }

    targetRef.current.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    targetRef.current.focus();
  };

  const handleSave = async () => {
    setErrorMessage("");
    setSuccessMessage("");

    const missing = validateFields();

    if (missing.length > 0) {
      setMissingFields(missing);
      setErrorMessage(
        "Please complete all required product information."
      );
      focusFirstMissingField(missing);
      return;
    }

    setIsLoading(true);

    try {
      const selectedType = isAddingNewType
        ? newProduct.newType.trim()
        : newProduct.type.trim();

      const productData = {
        ...newProduct,
        name: newProduct.name.trim(),
        description: newProduct.description.trim(),
        type: selectedType,
        price: Number(newProduct.price),
        quantity: Number(newProduct.quantity),
        length: Number(newProduct.length),
        width: Number(newProduct.width),
        height: Number(newProduct.height),
        weight: Number(newProduct.weight),
        unit: newProduct.unit || "standard",
      };

      await addProductWithMedia(
        productData,
        mediaPreviews
      );

      await fetchProducts();

      setSuccessMessage(
        product.id
          ? "Product updated successfully."
          : "Product added successfully."
      );

      window.setTimeout(() => {
        setSuccessMessage("");
        onClose();
      }, 3000);
    } catch (error) {
      console.error("Error saving product:", error);

      setErrorMessage(
        error?.response?.data?.message ||
          "The product could not be saved. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleNumberFocus = (field) => {
    if (Number(newProduct[field]) === 0) {
      updateProductField(field, "");
    }
  };

  const handleNumberBlur =
    (field, defaultValue = 0) =>
    (event) => {
      if (event.target.value.trim() === "") {
        updateProductField(field, defaultValue);
      }
    };

  const handleNumberChange =
    (field, parser = Number) =>
    (event) => {
      const rawValue = event.target.value;

      if (rawValue === "") {
        updateProductField(field, "");
        return;
      }

      const parsedValue = parser(rawValue);

      updateProductField(
        field,
        Number.isNaN(parsedValue)
          ? ""
          : parsedValue
      );
    };

  const handleProductTypeChange = (event) => {
    const selectedValue = event.target.value;

    setMissingFields((previousFields) =>
      previousFields.filter(
        (field) =>
          field !== "type" &&
          field !== "newType"
      )
    );

    if (selectedValue === "new") {
      setIsAddingNewType(true);

      setNewProduct((previousProduct) => ({
        ...previousProduct,
        type: "",
        newType: "",
      }));

      return;
    }

    setIsAddingNewType(false);

    setNewProduct((previousProduct) => ({
      ...previousProduct,
      type: selectedValue,
      newType: "",
    }));
  };

  const handleThumbnailChange = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setErrorMessage("");
    setIsCompressingThumbnail(true);

    try {
      const compressionOptions = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: "image/webp",
      };

      const compressedFile = await imageCompression(
        file,
        compressionOptions
      );

      const webpFile = new File(
        [compressedFile],
        file.name.replace(/\.[^.]+$/, ".webp"),
        {
          type: "image/webp",
          lastModified: Date.now(),
        }
      );

      if (thumbnailPreview) {
        URL.revokeObjectURL(thumbnailPreview);
      }

      setThumbnailPreview(
        URL.createObjectURL(webpFile)
      );

      updateProductField("thumbnail", webpFile);
    } catch (error) {
      console.error(
        "Thumbnail compression failed:",
        error
      );

      if (thumbnailPreview) {
        URL.revokeObjectURL(thumbnailPreview);
      }

      setThumbnailPreview(URL.createObjectURL(file));
      updateProductField("thumbnail", file);
    } finally {
      setIsCompressingThumbnail(false);
    }
  };

  const handleCancel = () => {
    if (isLoading) {
      return;
    }

    onClose();
  };

  return (
    <section
      className="bb-product-form"
      aria-labelledby="bb-product-form-title"
    >
      <AnimatePresence>
        {successMessage && (
          <motion.div
            className="bb-product-form__toast bb-product-form__toast--success"
            initial={{
              opacity: 0,
              y: -16,
              scale: 0.98,
            }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
            }}
            exit={{
              opacity: 0,
              y: -16,
              scale: 0.98,
            }}
            transition={{ duration: 0.25 }}
            role="status"
            aria-live="polite"
          >
            <span
              className="bb-product-form__toast-icon"
              aria-hidden="true"
            >
              ✓
            </span>

            <span>{successMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="bb-product-form__loading">
          <LoadingPage />
        </div>
      ) : (
        <div className="bb-product-form__container">
          <header className="bb-product-form__header">
            <div>
              <p className="bb-product-form__eyebrow">
                Product Management
              </p>

              <h2
                id="bb-product-form-title"
                className="bb-product-form__title"
              >
                {product.id
                  ? "Edit Product"
                  : "Add New Product"}
              </h2>

              <p className="bb-product-form__subtitle">
                Enter the product details, shipping
                information, thumbnail, and additional
                media.
              </p>
            </div>

            <button
              type="button"
              className="bb-product-form__close-button"
              onClick={handleCancel}
              aria-label="Close product form"
            >
              ×
            </button>
          </header>

          {errorMessage && (
            <div
              className="bb-product-form__alert"
              role="alert"
            >
              <span
                className="bb-product-form__alert-icon"
                aria-hidden="true"
              >
                !
              </span>

              <span>{errorMessage}</span>
            </div>
          )}

          <div className="bb-product-form__content">
            <section className="bb-product-form__card">
              <div className="bb-product-form__section-header">
                <div className="bb-product-form__section-number">
                  1
                </div>

                <div>
                  <h3 className="bb-product-form__section-title">
                    Basic Information
                  </h3>

                  <p className="bb-product-form__section-description">
                    Add the customer-facing product name,
                    description, price, and inventory.
                  </p>
                </div>
              </div>

              <div className="bb-product-form__field-grid">
                <div className="bb-product-form__field bb-product-form__field--full">
                  <label
                    className="bb-product-form__label"
                    htmlFor="bb-product-form-name"
                  >
                    Product Name
                    <span className="bb-product-form__required">
                      *
                    </span>
                  </label>

                  <input
                    id="bb-product-form-name"
                    ref={nameRef}
                    type="text"
                    className={getFieldClassName("name")}
                    value={newProduct.name}
                    placeholder="Enter the product name"
                    autoComplete="off"
                    onChange={(event) =>
                      updateProductField(
                        "name",
                        event.target.value
                      )
                    }
                    aria-invalid={missingFields.includes(
                      "name"
                    )}
                  />

                  {missingFields.includes("name") && (
                    <p className="bb-product-form__field-error">
                      A product name is required.
                    </p>
                  )}
                </div>

                <div className="bb-product-form__field bb-product-form__field--full">
                  <label
                    className="bb-product-form__label"
                    htmlFor="bb-product-form-description"
                  >
                    Description
                    <span className="bb-product-form__required">
                      *
                    </span>
                  </label>

                  <textarea
                    id="bb-product-form-description"
                    ref={descriptionRef}
                    className={`${getFieldClassName(
                      "description"
                    )} bb-product-form__textarea`}
                    value={newProduct.description}
                    placeholder="Describe the product, materials, features, or other useful details"
                    rows={5}
                    onChange={(event) =>
                      updateProductField(
                        "description",
                        event.target.value
                      )
                    }
                    aria-invalid={missingFields.includes(
                      "description"
                    )}
                  />

                  {missingFields.includes(
                    "description"
                  ) && (
                    <p className="bb-product-form__field-error">
                      A product description is required.
                    </p>
                  )}
                </div>

                <div className="bb-product-form__field">
                  <label
                    className="bb-product-form__label"
                    htmlFor="bb-product-form-price"
                  >
                    Price
                    <span className="bb-product-form__required">
                      *
                    </span>
                  </label>

                  <div className="bb-product-form__input-wrapper">
                    <span className="bb-product-form__input-prefix">
                      $
                    </span>

                    <input
                      id="bb-product-form-price"
                      ref={priceRef}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      className={`${getFieldClassName(
                        "price"
                      )} bb-product-form__control--with-prefix`}
                      placeholder="0.00"
                      value={
                        newProduct.price === 0
                          ? ""
                          : newProduct.price
                      }
                      onFocus={() =>
                        handleNumberFocus("price")
                      }
                      onBlur={handleNumberBlur(
                        "price",
                        0
                      )}
                      onChange={handleNumberChange(
                        "price",
                        parseFloat
                      )}
                      aria-invalid={missingFields.includes(
                        "price"
                      )}
                    />
                  </div>

                  {missingFields.includes("price") && (
                    <p className="bb-product-form__field-error">
                      Enter a price greater than zero.
                    </p>
                  )}
                </div>

                <div className="bb-product-form__field">
                  <label
                    className="bb-product-form__label"
                    htmlFor="bb-product-form-quantity"
                  >
                    Quantity
                    <span className="bb-product-form__required">
                      *
                    </span>
                  </label>

                  <input
                    id="bb-product-form-quantity"
                    ref={quantityRef}
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    className={getFieldClassName(
                      "quantity"
                    )}
                    placeholder="Enter available quantity"
                    value={
                      newProduct.quantity === 0
                        ? ""
                        : newProduct.quantity
                    }
                    onFocus={() =>
                      handleNumberFocus("quantity")
                    }
                    onBlur={handleNumberBlur(
                      "quantity",
                      1
                    )}
                    onChange={handleNumberChange(
                      "quantity",
                      (value) =>
                        Number.parseInt(value, 10)
                    )}
                    aria-invalid={missingFields.includes(
                      "quantity"
                    )}
                  />

                  {missingFields.includes(
                    "quantity"
                  ) && (
                    <p className="bb-product-form__field-error">
                      Enter a quantity of at least one.
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="bb-product-form__card">
              <div className="bb-product-form__section-header">
                <div className="bb-product-form__section-number">
                  2
                </div>

                <div>
                  <h3 className="bb-product-form__section-title">
                    Classification
                  </h3>

                  <p className="bb-product-form__section-description">
                    Select an existing product type or
                    create a new one.
                  </p>
                </div>
              </div>

              <div className="bb-product-form__field-grid">
                <div
                  className={
                    isAddingNewType
                      ? "bb-product-form__field"
                      : "bb-product-form__field bb-product-form__field--full"
                  }
                >
                  <label
                    className="bb-product-form__label"
                    htmlFor="bb-product-form-type"
                  >
                    Product Type
                    <span className="bb-product-form__required">
                      *
                    </span>
                  </label>

                  <select
                    id="bb-product-form-type"
                    ref={typeRef}
                    className={getFieldClassName("type")}
                    value={
                      isAddingNewType
                        ? "new"
                        : newProduct.type
                    }
                    onChange={handleProductTypeChange}
                    aria-invalid={missingFields.includes(
                      "type"
                    )}
                  >
                    <option value="">
                      Select a product type
                    </option>

                    {productTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}

                    <option value="new">
                      + Create a new type
                    </option>
                  </select>

                  {missingFields.includes("type") && (
                    <p className="bb-product-form__field-error">
                      Select a product type.
                    </p>
                  )}
                </div>

                <AnimatePresence initial={false}>
                  {isAddingNewType && (
                    <motion.div
                      className="bb-product-form__field"
                      initial={{
                        opacity: 0,
                        height: 0,
                      }}
                      animate={{
                        opacity: 1,
                        height: "auto",
                      }}
                      exit={{
                        opacity: 0,
                        height: 0,
                      }}
                      transition={{ duration: 0.2 }}
                    >
                      <label
                        className="bb-product-form__label"
                        htmlFor="bb-product-form-new-type"
                      >
                        New Type Name
                        <span className="bb-product-form__required">
                          *
                        </span>
                      </label>

                      <input
                        id="bb-product-form-new-type"
                        ref={newTypeRef}
                        type="text"
                        className={getFieldClassName(
                          "newType"
                        )}
                        value={newProduct.newType}
                        placeholder="Enter the new product type"
                        autoComplete="off"
                        onChange={(event) =>
                          updateProductField(
                            "newType",
                            event.target.value
                          )
                        }
                        aria-invalid={missingFields.includes(
                          "newType"
                        )}
                      />

                      {missingFields.includes(
                        "newType"
                      ) && (
                        <p className="bb-product-form__field-error">
                          Enter a name for the new product
                          type.
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>

            <section className="bb-product-form__card">
              <div className="bb-product-form__section-header">
                <div className="bb-product-form__section-number">
                  3
                </div>

                <div>
                  <h3 className="bb-product-form__section-title">
                    Shipping Details
                  </h3>

                  <p className="bb-product-form__section-description">
                    Enter the packaged dimensions and
                    weight used for shipping calculations.
                  </p>
                </div>
              </div>

              <div className="bb-product-form__field-grid">
                <div className="bb-product-form__field bb-product-form__field--full">
                  <span className="bb-product-form__label">
                    Package Dimensions
                    <span className="bb-product-form__required">
                      *
                    </span>
                  </span>

                  <div className="bb-product-form__dimensions-grid">
                    <div className="bb-product-form__field">
                      <label
                        className="bb-product-form__compact-label"
                        htmlFor="bb-product-form-length"
                      >
                        Length
                      </label>

                      <input
                        id="bb-product-form-length"
                        ref={lengthRef}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        className={getFieldClassName(
                          "length"
                        )}
                        placeholder="0"
                        value={
                          newProduct.length === 0
                            ? ""
                            : newProduct.length
                        }
                        onFocus={() =>
                          handleNumberFocus("length")
                        }
                        onBlur={handleNumberBlur(
                          "length",
                          0
                        )}
                        onChange={handleNumberChange(
                          "length",
                          parseFloat
                        )}
                        aria-invalid={missingFields.includes(
                          "length"
                        )}
                      />
                    </div>

                    <div className="bb-product-form__field">
                      <label
                        className="bb-product-form__compact-label"
                        htmlFor="bb-product-form-width"
                      >
                        Width
                      </label>

                      <input
                        id="bb-product-form-width"
                        ref={widthRef}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        className={getFieldClassName(
                          "width"
                        )}
                        placeholder="0"
                        value={
                          newProduct.width === 0
                            ? ""
                            : newProduct.width
                        }
                        onFocus={() =>
                          handleNumberFocus("width")
                        }
                        onBlur={handleNumberBlur(
                          "width",
                          0
                        )}
                        onChange={handleNumberChange(
                          "width",
                          parseFloat
                        )}
                        aria-invalid={missingFields.includes(
                          "width"
                        )}
                      />
                    </div>

                    <div className="bb-product-form__field">
                      <label
                        className="bb-product-form__compact-label"
                        htmlFor="bb-product-form-height"
                      >
                        Height
                      </label>

                      <input
                        id="bb-product-form-height"
                        ref={heightRef}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        className={getFieldClassName(
                          "height"
                        )}
                        placeholder="0"
                        value={
                          newProduct.height === 0
                            ? ""
                            : newProduct.height
                        }
                        onFocus={() =>
                          handleNumberFocus("height")
                        }
                        onBlur={handleNumberBlur(
                          "height",
                          0
                        )}
                        onChange={handleNumberChange(
                          "height",
                          parseFloat
                        )}
                        aria-invalid={missingFields.includes(
                          "height"
                        )}
                      />
                    </div>
                  </div>

                  {[
                    "length",
                    "width",
                    "height",
                  ].some((field) =>
                    missingFields.includes(field)
                  ) && (
                    <p className="bb-product-form__field-error">
                      Enter a value greater than zero for
                      each dimension.
                    </p>
                  )}
                </div>

                <div className="bb-product-form__field">
                  <label
                    className="bb-product-form__label"
                    htmlFor="bb-product-form-weight"
                  >
                    Package Weight
                    <span className="bb-product-form__required">
                      *
                    </span>
                  </label>

                  <input
                    id="bb-product-form-weight"
                    ref={weightRef}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    className={getFieldClassName("weight")}
                    placeholder="Enter package weight"
                    value={
                      newProduct.weight === 0
                        ? ""
                        : newProduct.weight
                    }
                    onFocus={() =>
                      handleNumberFocus("weight")
                    }
                    onBlur={handleNumberBlur(
                      "weight",
                      0
                    )}
                    onChange={handleNumberChange(
                      "weight",
                      parseFloat
                    )}
                    aria-invalid={missingFields.includes(
                      "weight"
                    )}
                  />

                  {missingFields.includes("weight") && (
                    <p className="bb-product-form__field-error">
                      Enter a weight greater than zero.
                    </p>
                  )}
                </div>

                <div className="bb-product-form__field">
                  <label
                    className="bb-product-form__label"
                    htmlFor="bb-product-form-unit"
                  >
                    Measurement System
                  </label>

                  <select
                    id="bb-product-form-unit"
                    className="bb-product-form__control"
                    value={newProduct.unit}
                    onChange={(event) =>
                      updateProductField(
                        "unit",
                        event.target.value
                      )
                    }
                  >
                    <option value="standard">
                      Standard — inches and pounds
                    </option>

                    <option value="metric">
                      Metric — centimeters and kilograms
                    </option>
                  </select>
                </div>
              </div>
            </section>

            <section className="bb-product-form__card">
              <div className="bb-product-form__section-header">
                <div className="bb-product-form__section-number">
                  4
                </div>

                <div>
                  <h3 className="bb-product-form__section-title">
                    Product Thumbnail
                  </h3>

                  <p className="bb-product-form__section-description">
                    Choose the primary image shown in
                    product listings and checkout.
                  </p>
                </div>
              </div>

              <div
                className={`bb-product-form__upload-panel ${
                  missingFields.includes("thumbnail")
                    ? "bb-product-form__upload-panel--invalid"
                    : ""
                }`}
              >
                <div className="bb-product-form__thumbnail-layout">
                  {thumbnailPreview ? (
                    <div className="bb-product-form__thumbnail-preview">
                      <img
                        src={thumbnailPreview}
                        alt="Selected product thumbnail preview"
                      />
                    </div>
                  ) : (
                    <div className="bb-product-form__upload-icon">
                      <span aria-hidden="true">↑</span>
                    </div>
                  )}

                  <div className="bb-product-form__upload-content">
                    <label
                      className="bb-product-form__upload-label"
                      htmlFor="bb-product-form-thumbnail"
                    >
                      {thumbnailPreview
                        ? "Change thumbnail"
                        : "Choose thumbnail"}
                    </label>

                    <p className="bb-product-form__upload-help">
                      JPEG, PNG, GIF, or WebP. The image
                      will be compressed and converted to
                      WebP when possible.
                    </p>

                    {newProduct.thumbnail && (
                      <p className="bb-product-form__selected-file">
                        {newProduct.thumbnail.name}
                      </p>
                    )}

                    <input
                      id="bb-product-form-thumbnail"
                      ref={thumbnailRef}
                      className="bb-product-form__file-input"
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      onChange={handleThumbnailChange}
                    />

                    {isCompressingThumbnail && (
                      <p className="bb-product-form__processing-text">
                        Optimizing thumbnail...
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {missingFields.includes("thumbnail") && (
                <p className="bb-product-form__field-error bb-product-form__field-error--spaced">
                  Select a product thumbnail before
                  saving.
                </p>
              )}
            </section>

            <section className="bb-product-form__card">
              <div className="bb-product-form__section-header">
                <div className="bb-product-form__section-number">
                  5
                </div>

                <div>
                  <h3 className="bb-product-form__section-title">
                    Additional Media
                  </h3>

                  <p className="bb-product-form__section-description">
                    Add up to ten additional product
                    images or videos.
                  </p>
                </div>
              </div>

              <div className="bb-product-form__media-panel">
                <div className="bb-product-form__media-header">
                  <div>
                    <h4 className="bb-product-form__media-title">
                      Media Uploader
                    </h4>

                    <p className="bb-product-form__media-description">
                      Accepted formats: JPEG, PNG, JPG,
                      MP4, MOV, and AVI.
                    </p>
                  </div>

                  <span className="bb-product-form__media-count">
                    {mediaPreviews.length}/10
                  </span>
                </div>

                <div className="bb-product-form__media-uploader">
                  <MediaUploader
                    mode="add"
                    maxMedia={10}
                    initialMedia={mediaPreviews}
                    onMediaChange={setMediaPreviews}
                  />
                </div>
              </div>
            </section>
          </div>

          <footer className="bb-product-form__footer">
            <button
              type="button"
              className="bb-product-form__button bb-product-form__button--secondary"
              onClick={handleCancel}
              disabled={isLoading}
            >
              Cancel
            </button>

            <button
              type="button"
              className="bb-product-form__button bb-product-form__button--primary"
              onClick={handleSave}
              disabled={
                isLoading || isCompressingThumbnail
              }
            >
              {isLoading
                ? "Saving..."
                : product.id
                  ? "Save Changes"
                  : "Add Product"}
            </button>
          </footer>
        </div>
      )}
    </section>
  );
};

ProductForm.propTypes = {
  product: PropTypes.shape({
    id: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number,
    ]),
    name: PropTypes.string,
    description: PropTypes.string,
    price: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number,
    ]),
    type: PropTypes.string,
    quantity: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number,
    ]),
    length: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number,
    ]),
    width: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number,
    ]),
    height: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number,
    ]),
    weight: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number,
    ]),
    unit: PropTypes.string,
  }),
  onClose: PropTypes.func.isRequired,
};

export default ProductForm;