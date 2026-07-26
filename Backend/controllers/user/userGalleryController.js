"use strict";

const fs = require("fs/promises");
const path = require("path");

const GALLERY_DIRECTORY =
  path.resolve(
    __dirname,
    "../../galleryuploads"
  );

const ALLOWED_IMAGE_EXTENSIONS =
  new Set([
    ".avif",
    ".gif",
    ".jpeg",
    ".jpg",
    ".png",
    ".webp",
  ]);

const createTitleFromFilename = (
  filename
) =>
  path
    .parse(filename)
    .name
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase()
    );

const isAllowedImage = (
  directoryEntry
) => {
  if (
    !directoryEntry.isFile() ||
    directoryEntry.name.startsWith(
      "."
    )
  ) {
    return false;
  }

  const extension = path
    .extname(directoryEntry.name)
    .toLowerCase();

  return ALLOWED_IMAGE_EXTENSIONS.has(
    extension
  );
};

const getUserGallery = async (
  req,
  res
) => {
  try {
    const directoryEntries =
      await fs.readdir(
        GALLERY_DIRECTORY,
        {
          withFileTypes: true,
        }
      );

    const galleryItems =
      directoryEntries
        .filter(isAllowedImage)
        .sort((first, second) =>
          first.name.localeCompare(
            second.name,
            undefined,
            {
              numeric: true,
              sensitivity: "base",
            }
          )
        )
        .map((entry) => ({
          id: entry.name,
          filename: entry.name,
          image: [entry.name],
          title:
            createTitleFromFilename(
              entry.name
            ),
          description: "",
        }));

    res.set(
      "Cache-Control",
      "public, max-age=60"
    );

    return res
      .status(200)
      .json(galleryItems);
  } catch (error) {
    if (
      error?.code === "ENOENT"
    ) {
      console.error(
        "[USER GALLERY] Gallery directory does not exist:",
        GALLERY_DIRECTORY
      );

      return res.status(500).json({
        message:
          "The gallery directory is not available.",
      });
    }

    console.error(
      "[USER GALLERY] Unable to read gallery directory:",
      error
    );

    return res.status(500).json({
      message:
        "Unable to load the gallery.",
    });
  }
};

module.exports = {
  getUserGallery,
};
