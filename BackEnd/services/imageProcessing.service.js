import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import Credentials from '../config/Credentials.js';

const SIZES = {
  thumbnail: { width: 400, suffix: 'thumb' },
  medium: { width: 1200, suffix: 'medium' },
  hero: { width: 2000, suffix: 'hero' },
};

export async function processImage(inputPath, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });

  const baseName = path.basename(inputPath, path.extname(inputPath));
  const results = {};

  for (const [key, { width, suffix }] of Object.entries(SIZES)) {
    const outputFilename = `${baseName}-${suffix}.webp`;
    const outputPath = path.join(outputDir, outputFilename);

    await sharp(inputPath)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(outputPath);

    // TODO: Upload to B2 here

    results[key] = outputPath;
  }

  return results;
}

console.log('[ImageProcessing] loaded');
