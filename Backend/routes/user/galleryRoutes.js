"use strict";

const express = require("express");

const {
  getUserGallery,
} = require(
  "../../controllers/user/userGalleryController"
);

const router = express.Router();

router.get(
  "/get-gallery",
  getUserGallery
);

module.exports = router;
