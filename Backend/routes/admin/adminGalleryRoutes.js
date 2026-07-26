"use strict";

const express = require("express");
const multer = require("multer");

const {
  getGalleryItems,
  addGalleryItem,
  updateGalleryItem,
  replaceGalleryItem,
  deleteGalleryItem,
} = require(
  "../../controllers/admin/galleryController"
);

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: 15 * 1024 * 1024,
  },
});

router.get(
  "/get-gallery-items",
  getGalleryItems
);

router.post(
  "/add-gallery-items",
  upload.single("image"),
  addGalleryItem
);

router.patch(
  "/update-gallery-items/:filename",
  updateGalleryItem
);

router.put(
  "/replace-gallery-items/:filename",
  upload.single("image"),
  replaceGalleryItem
);

router.delete(
  "/delete-gallery-items/:filename",
  deleteGalleryItem
);

module.exports = router;