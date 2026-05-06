import { Router } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import Home from '../models/Home.js';
import { requireAdminAuth } from '../middleware/auth.js';
import allowedExtensions from '../config/allowed_extensions.js';
import { saveHomeFile, generateUniqueFilename } from '../services/upload.service.js';
import { processImage } from '../services/imageProcessing.service.js';
import logger from '../utils/logger.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const images = await Home.find().sort({ uploadedAt: -1 });
    res.json({ ok: true, images });
  } catch (err) {
    next(err);
  }
});

router.post('/upload', requireAdminAuth, upload.array('images'), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ ok: false, message: 'No image files provided' });
    }

    const invalidFile = req.files.find(f => !allowedExtensions.images.includes(f.mimetype));
    if (invalidFile) {
      return res.status(400).json({ ok: false, message: `Invalid file type: ${invalidFile.originalname}. Allowed: JPEG, PNG, WebP, AVIF` });
    }

    const savedImages = [];

    for (const file of req.files) {
      const uniqueFilename = generateUniqueFilename(file.originalname);
      const url = saveHomeFile(file.buffer, uniqueFilename);

      const image = await Home.create({
        filename: uniqueFilename,
        originalName: file.originalname,
        url,
        size: file.size,
      });

      savedImages.push(image);

      const localDiskPath = path.join('uploads', 'home', uniqueFilename);
      const baseName = path.basename(uniqueFilename, path.extname(uniqueFilename));

      processImage(localDiskPath, baseName, 'uploads/home')
        .then(({ thumbnail, medium, hero }) =>
          Home.updateOne({ filename: uniqueFilename }, { $set: { thumbnail, medium, hero } })
        )
        .catch(err => logger.error('[ImageProcessing] Background error:', err));
    }

    res.status(201).json({ ok: true, images: savedImages });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAdminAuth, async (req, res, next) => {
  try {
    const image = await Home.findById(req.params.id);
    if (!image) {
      return res.status(404).json({ ok: false, message: 'Image not found' });
    }

    const filesToDelete = [
      path.join('uploads', 'home', image.filename),
    ];

    if (image.thumbnail) {
      filesToDelete.push(path.join('.', image.thumbnail));
    }
    if (image.medium) {
      filesToDelete.push(path.join('.', image.medium));
    }
    if (image.hero) {
      filesToDelete.push(path.join('.', image.hero));
    }

    for (const filePath of filesToDelete) {
      await fs.unlink(filePath).catch(() => {});
    }

    await Home.deleteOne({ _id: image._id });

    res.json({ ok: true, message: 'Image deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
