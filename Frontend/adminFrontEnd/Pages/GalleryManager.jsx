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
import Dropzone from "react-dropzone";
import {
  ToastContainer,
  toast,
} from "react-toastify";

import { adminApi } from "../config/axios";
import PhotoEditor from "./photoEditor";

import "react-toastify/dist/ReactToastify.css";
import "./GalleryManager.css";

const GALLERY_ENDPOINT =
  "/admin-gallery-routes";

const EMPTY_UPLOAD_FORM = {
  fileName: "",
  image: null,
};

const formatBytes = (bytes) => {
  const size = Number(bytes);

  if (
    !Number.isFinite(size) ||
    size <= 0
  ) {
    return "Unknown size";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
  ];
  const unitIndex = Math.min(
    Math.floor(
      Math.log(size) /
        Math.log(1024)
    ),
    units.length - 1
  );

  return `${(
    size /
    1024 ** unitIndex
  ).toFixed(
    unitIndex === 0 ? 0 : 1
  )} ${units[unitIndex]}`;
};

const formatDate = (value) => {
  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "Unknown date";
  }

  return date.toLocaleDateString(
    "en-US",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
    }
  );
};

const getImageUrl = (filename) => {
  const backendUrl = String(
    import.meta.env.VITE_BACKEND ||
      ""
  ).replace(/\/+$/, "");

  return `${backendUrl}/galleryuploads/${encodeURIComponent(
    filename
  )}`;
};

const getErrorMessage = (
  error,
  fallback
) =>
  error?.response?.data?.message ||
  error?.response?.data?.error ||
  fallback;

const ModalShell = ({
  children,
  labelledBy,
  onClose,
  reduceMotion,
  size = "standard",
}) => (
  <motion.div
    className="bb-admin-gallery-modal-backdrop"
    initial={
      reduceMotion
        ? false
        : { opacity: 0 }
    }
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    onMouseDown={(event) => {
      if (
        event.target ===
        event.currentTarget
      ) {
        onClose();
      }
    }}
  >
    <motion.section
      className={`bb-admin-gallery-modal bb-admin-gallery-modal--${size}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      initial={
        reduceMotion
          ? false
          : {
              opacity: 0,
              y: 18,
              scale: 0.98,
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
        scale: 0.98,
      }}
      transition={{
        duration: 0.2,
      }}
    >
      {children}
    </motion.section>
  </motion.div>
);

const AdminGallery = () => {
  const reduceMotion =
    useReducedMotion();

  const [
    galleryItems,
    setGalleryItems,
  ] = useState([]);
  const [loading, setLoading] =
    useState(true);
  const [saving, setSaving] =
    useState(false);
  const [error, setError] =
    useState("");
  const [search, setSearch] =
    useState("");

  const [uploadOpen, setUploadOpen] =
    useState(false);
  const [uploadForm, setUploadForm] =
    useState(EMPTY_UPLOAD_FORM);
  const [
    imagePreview,
    setImagePreview,
  ] = useState("");

  const [viewItem, setViewItem] =
    useState(null);
  const [renameItem, setRenameItem] =
    useState(null);
  const [renameValue, setRenameValue] =
    useState("");
  const [deleteItem, setDeleteItem] =
    useState(null);
  const [editorItem, setEditorItem] =
    useState(null);

  const fetchGallery =
    useCallback(async () => {
      try {
        setLoading(true);
        setError("");

        const response =
          await adminApi.get(
            `${GALLERY_ENDPOINT}/get-gallery-items`,
            {
              withCredentials: true,
            }
          );

        setGalleryItems(
          Array.isArray(response.data)
            ? response.data
            : []
        );
      } catch (requestError) {
        console.error(
          "Unable to load gallery files:",
          requestError
        );

        setError(
          getErrorMessage(
            requestError,
            "The gallery files could not be loaded."
          )
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    fetchGallery();
  }, [fetchGallery]);

  useEffect(
    () => () => {
      if (imagePreview) {
        URL.revokeObjectURL(
          imagePreview
        );
      }
    },
    [imagePreview]
  );

  const modalOpen = Boolean(
    uploadOpen ||
      viewItem ||
      renameItem ||
      deleteItem ||
      editorItem
  );

  useEffect(() => {
    if (!modalOpen) {
      return undefined;
    }

    const previousOverflow =
      document.body.style.overflow;
    document.body.style.overflow =
      "hidden";

    const handleKeyDown = (
      event
    ) => {
      if (event.key === "Escape") {
        if (!saving) {
          setUploadOpen(false);
          setViewItem(null);
          setRenameItem(null);
          setDeleteItem(null);
          setEditorItem(null);
        }
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [modalOpen, saving]);

  const filteredItems =
    useMemo(() => {
      const normalizedSearch =
        search
          .trim()
          .toLowerCase();

      if (!normalizedSearch) {
        return galleryItems;
      }

      return galleryItems.filter(
        (item) =>
          item.filename
            ?.toLowerCase()
            .includes(
              normalizedSearch
            ) ||
          item.title
            ?.toLowerCase()
            .includes(
              normalizedSearch
            )
      );
    }, [galleryItems, search]);

  const resetUploadForm = () => {
    setUploadForm(
      EMPTY_UPLOAD_FORM
    );
    setImagePreview("");
  };

  const closeUpload = () => {
    if (saving) {
      return;
    }

    setUploadOpen(false);
    resetUploadForm();
  };

  const handleAcceptedFile = (
    acceptedFiles
  ) => {
    const file = acceptedFiles[0];

    if (!file) {
      return;
    }

    const suggestedName = file.name
      .replace(/\.[^/.]+$/, "")
      .replace(/[-_]+/g, " ");

    setUploadForm((current) => ({
      fileName:
        current.fileName ||
        suggestedName,
      image: file,
    }));

    setImagePreview(
      URL.createObjectURL(file)
    );
  };

  const handleUpload = async (
    event
  ) => {
    event.preventDefault();

    if (
      !uploadForm.image ||
      !uploadForm.fileName.trim()
    ) {
      toast.error(
        "Choose an image and enter its saved filename."
      );
      return;
    }

    try {
      setSaving(true);

      const formData =
        new FormData();

      formData.append(
        "fileName",
        uploadForm.fileName.trim()
      );
      formData.append(
        "image",
        uploadForm.image
      );

      const response =
        await adminApi.post(
          `${GALLERY_ENDPOINT}/add-gallery-items`,
          formData,
          {
            withCredentials: true,
          }
        );

      setGalleryItems(
        (current) => [
          response.data,
          ...current,
        ]
      );

      toast.success(
        "Gallery image uploaded."
      );
      setUploadOpen(false);
      resetUploadForm();
    } catch (requestError) {
      console.error(
        "Unable to upload gallery image:",
        requestError
      );

      toast.error(
        getErrorMessage(
          requestError,
          "The image could not be uploaded."
        )
      );
    } finally {
      setSaving(false);
    }
  };

  const openRename = (item) => {
    setRenameItem(item);
    setRenameValue(
      item.filename.replace(
        /\.[^/.]+$/,
        ""
      )
    );
  };

  const handleRename = async (
    event
  ) => {
    event.preventDefault();

    if (!renameValue.trim()) {
      toast.error(
        "Enter a new filename."
      );
      return;
    }

    try {
      setSaving(true);

      const response =
        await adminApi.patch(
          `${GALLERY_ENDPOINT}/update-gallery-items/${encodeURIComponent(
            renameItem.filename
          )}`,
          {
            fileName:
              renameValue.trim(),
          },
          {
            withCredentials: true,
          }
        );

      setGalleryItems(
        (current) =>
          current.map((item) =>
            item.filename ===
            renameItem.filename
              ? response.data
              : item
          )
      );

      toast.success(
        "Gallery filename updated."
      );
      setRenameItem(null);
      setRenameValue("");
    } catch (requestError) {
      console.error(
        "Unable to rename gallery image:",
        requestError
      );

      toast.error(
        getErrorMessage(
          requestError,
          "The image could not be renamed."
        )
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      setSaving(true);

      await adminApi.delete(
        `${GALLERY_ENDPOINT}/delete-gallery-items/${encodeURIComponent(
          deleteItem.filename
        )}`,
        {
          withCredentials: true,
        }
      );

      setGalleryItems(
        (current) =>
          current.filter(
            (item) =>
              item.filename !==
              deleteItem.filename
          )
      );

      toast.success(
        "Gallery image deleted."
      );
      setDeleteItem(null);
    } catch (requestError) {
      console.error(
        "Unable to delete gallery image:",
        requestError
      );

      toast.error(
        getErrorMessage(
          requestError,
          "The image could not be deleted."
        )
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEditorSaved = (
    updatedItem
  ) => {
    setGalleryItems((current) =>
      current.map((item) =>
        item.filename ===
        editorItem.filename
          ? updatedItem
          : item
      )
    );

    setEditorItem(null);
    toast.success(
      "Edited image saved."
    );
  };

  return (
    <main className="bb-admin-gallery">
      <ToastContainer
        position="bottom-right"
        theme="colored"
      />

      <section className="bb-admin-gallery-hero">
        <div>
          <span className="bb-admin-gallery-eyebrow">
            Media management
          </span>

          <h1>Gallery Manager</h1>

          <p>
            Upload, rename, preview,
            and remove the image files
            displayed in the public
            gallery.
          </p>
        </div>

        <button
          type="button"
          className="bb-admin-gallery-button bb-admin-gallery-button--primary"
          onClick={() =>
            setUploadOpen(true)
          }
        >
          <span aria-hidden="true">
            ＋
          </span>
          Add image
        </button>
      </section>

      <section className="bb-admin-gallery-workspace">
        <header className="bb-admin-gallery-toolbar">
          <div>
            <h2>Gallery files</h2>
            <p>
              {galleryItems.length}{" "}
              {galleryItems.length === 1
                ? "image"
                : "images"}{" "}
              in galleryuploads
            </p>
          </div>

          <label className="bb-admin-gallery-search">
            <span className="bb-admin-gallery-sr-only">
              Search gallery files
            </span>
            <span aria-hidden="true">
              ⌕
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search filenames"
            />
          </label>
        </header>

        {loading ? (
          <div
            className="bb-admin-gallery-state"
            role="status"
            aria-live="polite"
          >
            <span className="bb-admin-gallery-spinner" />
            <h3>Loading gallery</h3>
            <p>
              Reading image files from
              the server.
            </p>
          </div>
        ) : error ? (
          <div
            className="bb-admin-gallery-state bb-admin-gallery-state--error"
            role="alert"
          >
            <h3>
              Gallery unavailable
            </h3>
            <p>{error}</p>
            <button
              type="button"
              className="bb-admin-gallery-button bb-admin-gallery-button--secondary"
              onClick={fetchGallery}
            >
              Try again
            </button>
          </div>
        ) : filteredItems.length ===
          0 ? (
          <div className="bb-admin-gallery-state">
            <span
              className="bb-admin-gallery-state-icon"
              aria-hidden="true"
            >
              ◫
            </span>
            <h3>
              {search
                ? "No matching files"
                : "No gallery images yet"}
            </h3>
            <p>
              {search
                ? "Try a different filename."
                : "Upload the first image to begin building the gallery."}
            </p>
          </div>
        ) : (
          <motion.div
            className="bb-admin-gallery-grid"
            layout={!reduceMotion}
          >
            <AnimatePresence>
              {filteredItems.map(
                (item) => (
                  <motion.article
                    key={item.filename}
                    className="bb-admin-gallery-card"
                    layout={
                      !reduceMotion
                    }
                    initial={
                      reduceMotion
                        ? false
                        : {
                            opacity: 0,
                            y: 12,
                          }
                    }
                    animate={{
                      opacity: 1,
                      y: 0,
                    }}
                    exit={{
                      opacity: 0,
                      scale: 0.97,
                    }}
                  >
                    <button
                      type="button"
                      className="bb-admin-gallery-card-preview"
                      onClick={() =>
                        setViewItem(
                          item
                        )
                      }
                      aria-label={`Preview ${item.filename}`}
                    >
                      <img
                        src={getImageUrl(
                          item.filename
                        )}
                        alt={item.title}
                        loading="lazy"
                      />
                      <span>
                        View image
                      </span>
                    </button>

                    <div className="bb-admin-gallery-card-body">
                      <h3
                        title={
                          item.filename
                        }
                      >
                        {item.filename}
                      </h3>

                      <div className="bb-admin-gallery-card-meta">
                        <span>
                          {formatBytes(
                            item.size
                          )}
                        </span>
                        <span aria-hidden="true">
                          •
                        </span>
                        <span>
                          {formatDate(
                            item.modifiedAt
                          )}
                        </span>
                      </div>

                      <div className="bb-admin-gallery-card-actions bb-admin-gallery-card-actions--editor">
                        <button
                          type="button"
                          className="bb-admin-gallery-icon-button bb-admin-gallery-icon-button--edit"
                          onClick={() =>
                            setEditorItem(
                              item
                            )
                          }
                        >
                          Edit photo
                        </button>

                        <button
                          type="button"
                          className="bb-admin-gallery-icon-button"
                          onClick={() =>
                            openRename(
                              item
                            )
                          }
                        >
                          Rename
                        </button>

                        <button
                          type="button"
                          className="bb-admin-gallery-icon-button bb-admin-gallery-icon-button--danger"
                          onClick={() =>
                            setDeleteItem(
                              item
                            )
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </motion.article>
                )
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </section>

      <AnimatePresence>
        {uploadOpen && (
          <ModalShell
            labelledBy="bb-admin-gallery-upload-title"
            onClose={closeUpload}
            reduceMotion={reduceMotion}
            size="form"
          >
            <header className="bb-admin-gallery-modal-header">
              <div>
                <span className="bb-admin-gallery-eyebrow">
                  New gallery file
                </span>
                <h2 id="bb-admin-gallery-upload-title">
                  Add an image
                </h2>
              </div>

              <button
                type="button"
                className="bb-admin-gallery-modal-close"
                onClick={closeUpload}
                disabled={saving}
                aria-label="Close upload form"
              >
                ×
              </button>
            </header>

            <form
              className="bb-admin-gallery-form"
              onSubmit={handleUpload}
            >
              <Dropzone
                accept={{
                  "image/avif": [
                    ".avif",
                  ],
                  "image/gif": [
                    ".gif",
                  ],
                  "image/jpeg": [
                    ".jpg",
                    ".jpeg",
                  ],
                  "image/png": [
                    ".png",
                  ],
                  "image/webp": [
                    ".webp",
                  ],
                }}
                maxFiles={1}
                maxSize={
                  15 *
                  1024 *
                  1024
                }
                multiple={false}
                onDropAccepted={
                  handleAcceptedFile
                }
                onDropRejected={() =>
                  toast.error(
                    "Choose one supported image smaller than 15 MB."
                  )
                }
              >
                {({
                  getRootProps,
                  getInputProps,
                  isDragActive,
                }) => (
                  <div
                    {...getRootProps()}
                    className={`bb-admin-gallery-dropzone ${
                      isDragActive
                        ? "bb-admin-gallery-dropzone--active"
                        : ""
                    }`}
                  >
                    <input
                      {...getInputProps()}
                    />

                    {imagePreview ? (
                      <img
                        src={
                          imagePreview
                        }
                        alt="Selected upload preview"
                      />
                    ) : (
                      <div className="bb-admin-gallery-dropzone-empty">
                        <span aria-hidden="true">
                          ⇧
                        </span>
                        <strong>
                          Drop an image
                          here
                        </strong>
                        <small>
                          or click to
                          browse · 15 MB
                          maximum
                        </small>
                      </div>
                    )}
                  </div>
                )}
              </Dropzone>

              <label className="bb-admin-gallery-field">
                <span>
                  Saved filename
                </span>
                <input
                  type="text"
                  value={
                    uploadForm.fileName
                  }
                  onChange={(event) =>
                    setUploadForm(
                      (current) => ({
                        ...current,
                        fileName:
                          event.target
                            .value,
                      })
                    )
                  }
                  placeholder="black-ferns-live-edge"
                  maxLength={80}
                  autoComplete="off"
                  required
                />
                <small>
                  The server safely
                  formats this name and
                  preserves the detected
                  image extension.
                </small>
              </label>

              <div className="bb-admin-gallery-form-actions">
                <button
                  type="button"
                  className="bb-admin-gallery-button bb-admin-gallery-button--secondary"
                  onClick={closeUpload}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bb-admin-gallery-button bb-admin-gallery-button--primary"
                  disabled={saving}
                >
                  {saving
                    ? "Uploading…"
                    : "Upload image"}
                </button>
              </div>
            </form>
          </ModalShell>
        )}

        {viewItem && (
          <ModalShell
            labelledBy="bb-admin-gallery-preview-title"
            onClose={() =>
              setViewItem(null)
            }
            reduceMotion={reduceMotion}
            size="preview"
          >
            <header className="bb-admin-gallery-modal-header">
              <div>
                <span className="bb-admin-gallery-eyebrow">
                  Image preview
                </span>
                <h2 id="bb-admin-gallery-preview-title">
                  {viewItem.filename}
                </h2>
              </div>

              <button
                type="button"
                className="bb-admin-gallery-modal-close"
                onClick={() =>
                  setViewItem(null)
                }
                aria-label="Close image preview"
              >
                ×
              </button>
            </header>

            <div className="bb-admin-gallery-preview">
              <img
                src={getImageUrl(
                  viewItem.filename
                )}
                alt={viewItem.title}
              />
            </div>
          </ModalShell>
        )}

        {renameItem && (
          <ModalShell
            labelledBy="bb-admin-gallery-rename-title"
            onClose={() =>
              !saving &&
              setRenameItem(null)
            }
            reduceMotion={reduceMotion}
          >
            <header className="bb-admin-gallery-modal-header">
              <div>
                <span className="bb-admin-gallery-eyebrow">
                  Edit gallery file
                </span>
                <h2 id="bb-admin-gallery-rename-title">
                  Rename image
                </h2>
              </div>

              <button
                type="button"
                className="bb-admin-gallery-modal-close"
                onClick={() =>
                  setRenameItem(null)
                }
                disabled={saving}
                aria-label="Close rename form"
              >
                ×
              </button>
            </header>

            <form
              className="bb-admin-gallery-form"
              onSubmit={handleRename}
            >
              <label className="bb-admin-gallery-field">
                <span>
                  New filename
                </span>
                <input
                  type="text"
                  value={renameValue}
                  onChange={(event) =>
                    setRenameValue(
                      event.target.value
                    )
                  }
                  maxLength={80}
                  autoFocus
                  required
                />
                <small>
                  Extension:{" "}
                  {renameItem.filename
                    .split(".")
                    .pop()}
                </small>
              </label>

              <div className="bb-admin-gallery-form-actions">
                <button
                  type="button"
                  className="bb-admin-gallery-button bb-admin-gallery-button--secondary"
                  onClick={() =>
                    setRenameItem(null)
                  }
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bb-admin-gallery-button bb-admin-gallery-button--primary"
                  disabled={saving}
                >
                  {saving
                    ? "Saving…"
                    : "Save filename"}
                </button>
              </div>
            </form>
          </ModalShell>
        )}

        {deleteItem && (
          <ModalShell
            labelledBy="bb-admin-gallery-delete-title"
            onClose={() =>
              !saving &&
              setDeleteItem(null)
            }
            reduceMotion={reduceMotion}
          >
            <div className="bb-admin-gallery-delete-icon">
              !
            </div>

            <div className="bb-admin-gallery-delete-copy">
              <h2 id="bb-admin-gallery-delete-title">
                Delete this image?
              </h2>
              <p>
                <strong>
                  {
                    deleteItem.filename
                  }
                </strong>{" "}
                will be permanently
                removed from
                galleryuploads and the
                public gallery.
              </p>
            </div>

            <div className="bb-admin-gallery-form-actions">
              <button
                type="button"
                className="bb-admin-gallery-button bb-admin-gallery-button--secondary"
                onClick={() =>
                  setDeleteItem(null)
                }
                disabled={saving}
              >
                Keep image
              </button>
              <button
                type="button"
                className="bb-admin-gallery-button bb-admin-gallery-button--danger"
                onClick={handleDelete}
                disabled={saving}
              >
                {saving
                  ? "Deleting…"
                  : "Delete permanently"}
              </button>
            </div>
          </ModalShell>
        )}

        {editorItem && (
          <PhotoEditor
            item={editorItem}
            endpoint={
              GALLERY_ENDPOINT
            }
            imageUrl={getImageUrl(
              editorItem.filename
            )}
            onClose={() =>
              !saving &&
              setEditorItem(null)
            }
            onSaved={
              handleEditorSaved
            }
          />
        )}
      </AnimatePresence>
    </main>
  );
};

export default AdminGallery;
