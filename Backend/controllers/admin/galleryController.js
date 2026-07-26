"use strict";

const fs = require("fs/promises");
const path = require("path");

const GALLERY_DIRECTORY = path.resolve(
  __dirname,
  "../../galleryuploads"
);

const ALLOWED_EXTENSIONS = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".webp",
]);

const createHttpError = (
  status,
  message
) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

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

const sanitizeBaseName = (value) => {
  const suppliedName = String(
    value || ""
  )
    .normalize("NFKD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .trim();

  const withoutExtension =
    suppliedName.replace(
      /\.[a-z0-9]+$/i,
      ""
    );

  const safeName = withoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  if (!safeName) {
    throw createHttpError(
      400,
      "A valid file name is required."
    );
  }

  return safeName;
};

const resolveExistingFile = (
  filename
) => {
  const suppliedFilename = String(
    filename || ""
  );

  if (
    !suppliedFilename ||
    suppliedFilename.startsWith(".") ||
    path.basename(suppliedFilename) !==
      suppliedFilename
  ) {
    throw createHttpError(
      400,
      "Invalid gallery filename."
    );
  }

  const extension = path
    .extname(suppliedFilename)
    .toLowerCase();

  if (
    !ALLOWED_EXTENSIONS.has(extension)
  ) {
    throw createHttpError(
      400,
      "Unsupported gallery file type."
    );
  }

  return path.join(
    GALLERY_DIRECTORY,
    suppliedFilename
  );
};

const detectImageExtension = (
  buffer
) => {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length < 12
  ) {
    return null;
  }

  if (
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return ".jpg";
  }

  if (
    buffer
      .subarray(0, 8)
      .equals(
        Buffer.from([
          0x89,
          0x50,
          0x4e,
          0x47,
          0x0d,
          0x0a,
          0x1a,
          0x0a,
        ])
      )
  ) {
    return ".png";
  }

  const gifSignature = buffer
    .subarray(0, 6)
    .toString("ascii");

  if (
    gifSignature === "GIF87a" ||
    gifSignature === "GIF89a"
  ) {
    return ".gif";
  }

  if (
    buffer
      .subarray(0, 4)
      .toString("ascii") === "RIFF" &&
    buffer
      .subarray(8, 12)
      .toString("ascii") === "WEBP"
  ) {
    return ".webp";
  }

  if (
    buffer
      .subarray(4, 8)
      .toString("ascii") === "ftyp"
  ) {
    const brand = buffer
      .subarray(8, 12)
      .toString("ascii");

    if (
      brand === "avif" ||
      brand === "avis"
    ) {
      return ".avif";
    }
  }

  return null;
};

const toGalleryItem = async (
  filename
) => {
  const filePath =
    resolveExistingFile(filename);
  const stats = await fs.stat(filePath);

  return {
    id: filename,
    filename,
    title:
      createTitleFromFilename(
        filename
      ),
    image: [filename],
    size: stats.size,
    modifiedAt:
      stats.mtime.toISOString(),
  };
};

const sendControllerError = (
  res,
  error,
  operation
) => {
  console.error(
    `[ADMIN GALLERY] ${operation}:`,
    error
  );

  if (error?.code === "ENOENT") {
    return res.status(404).json({
      message:
        "Gallery image not found.",
    });
  }

  if (
    error?.code === "EEXIST" ||
    error?.code === "ENOTEMPTY"
  ) {
    return res.status(409).json({
      message:
        "A gallery image with that filename already exists.",
    });
  }

  return res
    .status(error?.status || 500)
    .json({
      message:
        error?.status
          ? error.message
          : "Unable to manage the gallery image.",
    });
};

const getGalleryItems = async (
  req,
  res
) => {
  try {
    await fs.mkdir(
      GALLERY_DIRECTORY,
      {
        recursive: true,
      }
    );

    const entries = await fs.readdir(
      GALLERY_DIRECTORY,
      {
        withFileTypes: true,
      }
    );

    const filenames = entries
      .filter((entry) => {
        if (
          !entry.isFile() ||
          entry.name.startsWith(".")
        ) {
          return false;
        }

        return ALLOWED_EXTENSIONS.has(
          path
            .extname(entry.name)
            .toLowerCase()
        );
      })
      .map((entry) => entry.name);

    const galleryItems =
      await Promise.all(
        filenames.map(toGalleryItem)
      );

    galleryItems.sort(
      (first, second) =>
        new Date(
          second.modifiedAt
        ).getTime() -
        new Date(
          first.modifiedAt
        ).getTime()
    );

    res.set(
      "Cache-Control",
      "no-store"
    );

    return res
      .status(200)
      .json(galleryItems);
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Unable to list gallery files"
    );
  }
};

const addGalleryItem = async (
  req,
  res
) => {
  let destinationPath = null;

  try {
    if (!req.file?.buffer) {
      throw createHttpError(
        400,
        "Select an image to upload."
      );
    }

    const extension =
      detectImageExtension(
        req.file.buffer
      );

    if (!extension) {
      throw createHttpError(
        400,
        "The uploaded file is not a supported image."
      );
    }

    const baseName =
      sanitizeBaseName(
        req.body.fileName
      );
    const filename =
      `${baseName}${extension}`;

    await fs.mkdir(
      GALLERY_DIRECTORY,
      {
        recursive: true,
      }
    );

    destinationPath = path.join(
      GALLERY_DIRECTORY,
      filename
    );

    await fs.writeFile(
      destinationPath,
      req.file.buffer,
      {
        flag: "wx",
        mode: 0o644,
      }
    );

    const galleryItem =
      await toGalleryItem(filename);

    return res
      .status(201)
      .json(galleryItem);
  } catch (error) {
    /*
     * A write that fails before completion should
     * not leave a partially created file behind.
     */
    if (
      destinationPath &&
      error?.code !== "EEXIST"
    ) {
      await fs
        .unlink(destinationPath)
        .catch(() => undefined);
    }

    return sendControllerError(
      res,
      error,
      "Unable to add gallery file"
    );
  }
};

const updateGalleryItem = async (
  req,
  res
) => {
  try {
    const currentFilename =
      req.params.filename;
    const currentPath =
      resolveExistingFile(
        currentFilename
      );

    await fs.access(currentPath);

    const extension = path
      .extname(currentFilename)
      .toLowerCase();
    const newBaseName =
      sanitizeBaseName(
        req.body.fileName
      );
    const newFilename =
      `${newBaseName}${extension}`;

    if (
      newFilename ===
      currentFilename
    ) {
      return res
        .status(200)
        .json(
          await toGalleryItem(
            currentFilename
          )
        );
    }

    const newPath = path.join(
      GALLERY_DIRECTORY,
      newFilename
    );

    try {
      await fs.access(newPath);

      throw createHttpError(
        409,
        "A gallery image with that filename already exists."
      );
    } catch (accessError) {
      if (
        accessError?.code !==
        "ENOENT"
      ) {
        throw accessError;
      }
    }

    await fs.rename(
      currentPath,
      newPath
    );

    return res.status(200).json(
      await toGalleryItem(
        newFilename
      )
    );
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Unable to rename gallery file"
    );
  }
};

const deleteGalleryItem = async (
  req,
  res
) => {
  try {
    const filename =
      req.params.filename;
    const filePath =
      resolveExistingFile(filename);

    await fs.unlink(filePath);

    return res.status(200).json({
      message:
        "Gallery image deleted.",
      filename,
    });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Unable to delete gallery file"
    );
  }
};

module.exports = {
  getGalleryItems,
  addGalleryItem,
  updateGalleryItem,
  deleteGalleryItem,
};
