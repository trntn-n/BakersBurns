const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const { Op } = require('sequelize');

// Import database connection and models
const sequelize = require('./config/database');
const Gallery = require('./models/gallery');
const Product = require('./models/product');
const SocialLink = require('./models/socialLinks');
const Media = require('./models/media');

// File extensions to convert
const imageExtensions = ['.jpg', '.jpeg', '.png'];
const videoExtensions = ['.mp4', '.mov', '.avi'];

// Map folders to models and fields
const folders = [
  { folderPath: path.resolve(__dirname, './uploads'), models: [{ model: Product, field: 'thumbnail' }, { model: Media, field: 'url' }] },
  { folderPath: path.resolve(__dirname, './galleryuploads'), models: [{ model: Gallery, field: 'image' }] },
  { folderPath: path.resolve(__dirname, './socialIcons'), models: [{ model: SocialLink, field: 'image' }] },
];

/**
 * Fix database entries by ensuring all images end in .webp and videos end in .webm
 */
/**
 * Fix database entries by ensuring all images end in .webp and videos end in .webm.
 * Updates database **even if files don't exist**.
 */
async function fixDatabaseEntries() {
  console.log('🔍 Checking database for incorrect file formats...');
  const models = [
    { model: Product, field: 'thumbnail' },
    { model: Media, field: 'url' },
    { model: Gallery, field: 'image' },
    { model: SocialLink, field: 'image' },
  ];
 
  for (const { model, field } of models) {
    try {
      const records = await model.findAll({
        where: {
          [field]: {
            [Op.and]: [
              { [Op.ne]: null },
              { [Op.notLike]: '%.webp' },
              { [Op.notLike]: '%.webm' },
            ],
          },
        },
      });

      for (const record of records) {
        let filePaths = record[field];

        if (typeof filePaths === 'string' && filePaths.startsWith('["')) {
          filePaths = JSON.parse(filePaths); // Parse JSON array
        }

        const updatedFiles = [];

        for (let filePath of Array.isArray(filePaths) ? filePaths : [filePaths]) {
          const ext = path.extname(filePath).toLowerCase();
          let newFilename = filePath.replace(ext, ext === '.mp4' ? '.webm' : '.webp');

          if (imageExtensions.includes(ext) || videoExtensions.includes(ext)) {
            // ✅ Update DB **even if the file does not exist**
            updatedFiles.push(newFilename);
          }
        }

        const finalValue = Array.isArray(filePaths) ? JSON.stringify(updatedFiles) : updatedFiles[0];

        await model.update(
          { [field]: finalValue },
          { where: { id: record.id } }
        );

        console.log(`✅ Updated ${model.name} record: ${record[field]} → ${finalValue}`);
      }
    } catch (err) {
      console.error(`❌ Error fixing database for ${model.name}:`, err);
    }
  }
}


/**
 * Converts an image file to WebP and removes the original file on success.
 * @param {string} filePath - Full path to the image.
 */
async function convertImageToWebP(filePath) {
  if (!(await fs.pathExists(filePath))) return null;
  const ext = path.extname(filePath);
  const newFilePath = filePath.replace(ext, '.webp');

  try {
    let image = sharp(filePath).rotate(); // ✅ Auto-rotate based on EXIF metadata
    const metadata = await image.metadata();

    if (metadata.width && metadata.width > 1920) {
      image = image.resize({ width: 1920 });
    }

    let quality = 80;
    let buffer = await image.webp({ quality }).toBuffer();
    const MAX_SIZE = 1 * 1024 * 1024;

    while (buffer.length > MAX_SIZE && quality > 30) {
      quality -= 10;
      buffer = await image.webp({ quality }).toBuffer();
    }

    await fs.writeFile(newFilePath, buffer);
    await fs.remove(filePath);
    console.log(`✅ Converted ${path.basename(filePath)} to ${path.basename(newFilePath)}`);
    return path.basename(newFilePath);
  } catch (err) {
    console.error(`❌ Error converting ${path.basename(filePath)}: ${err.message}`);
    return null;
  }
}


/**
 * Converts a video file to WebM and removes the original file on success.
 * @param {string} filePath - Full path to the video.
 */
async function convertVideoToWebM(filePath) {
  if (!(await fs.pathExists(filePath))) return null;
  const ext = path.extname(filePath);
  const newFilePath = filePath.replace(ext, '.webm');

  return new Promise((resolve) => {
    ffmpeg(filePath)
      .output(newFilePath)
      .videoCodec('libvpx')
      .audioCodec('libvorbis')
      .on('end', async () => {
        await fs.remove(filePath);
        console.log(`✅ Converted ${path.basename(filePath)} to ${path.basename(newFilePath)}`);
        resolve(path.basename(newFilePath));
      })
      .on('error', (err) => {
        console.error(`❌ Error converting ${path.basename(filePath)}: ${err.message}`);
        resolve(null);
      })
      .run();
  });
}

/**
 * Processes all files in a given folder, converts them as needed, and updates the database record.
 */
async function processFolder(folderConfig) {
  const { folderPath, models } = folderConfig;
  if (!(await fs.pathExists(folderPath))) return;

  const files = await fs.readdir(folderPath);
  for (const file of files) {
    const fullPath = path.join(folderPath, file);
    if (!(await fs.stat(fullPath)).isFile()) continue;

    const ext = path.extname(file).toLowerCase();
    if (ext === '.webp' || ext === '.webm') continue;

    let newFilename = null;
    if (imageExtensions.includes(ext)) {
      newFilename = await convertImageToWebP(fullPath);
    } else if (videoExtensions.includes(ext)) {
      newFilename = await convertVideoToWebM(fullPath);
    }

    if (newFilename) {
      for (const { model, field } of models) {
        try {
          const record = await model.findOne({ where: { [field]: { [Op.like]: `%${file}%` } } });

          if (record) {
            await model.update({ [field]: newFilename }, { where: { id: record.id } });
            console.log(`✅ Updated ${model.name}: ${file} → ${newFilename}`);
          }
        } catch (dbErr) {
          console.error(`❌ DB update error for ${file}: ${dbErr.message}`);
        }
      }
    }
  }
}

/**
 * Main entrypoint: Fix database first, then process folders.
 */
async function main() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected.');

    await fixDatabaseEntries(); // ✅ Step 1: Fix database entries before file processing

    for (const folderConfig of folders) {
      await processFolder(folderConfig); // ✅ Step 2: Process files
    }

    console.log('✅ All images/videos converted and database records updated.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during execution:', err);
    process.exit(1);
  }
}

main();
