import { Router } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import GalleryEvent from '../models/GalleryEvent.js';
import GalleryImage from '../models/GalleryImage.js';
import { requireAdminAuth } from '../middleware/auth.js';
import allowedExtensions from '../config/allowed_extensions.js';
import { saveGalleryFile, generateUniqueFilename } from '../services/upload.service.js';
import { processImage } from '../services/imageProcessing.service.js';
import { broadcast } from '../config/ws-server.js';
import logger from '../utils/logger.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = Router();

// GET all events (public) — returns events with image count
router.get('/', async (req, res, next) => {
  try {
    const events = await GalleryEvent.find().sort({ createdAt: -1 }).lean();

    const eventsWithCount = await Promise.all(
      events.map(async (event) => {
        const imageCount = await GalleryImage.countDocuments({ eventId: event._id });
        return { ...event, imageCount };
      })
    );

    res.json({ ok: true, events: eventsWithCount });
  } catch (err) {
    next(err);
  }
});

// GET single event with all its images (public)
router.get('/:id', async (req, res, next) => {
  try {
    const event = await GalleryEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ ok: false, message: 'Event not found' });
    }

    const images = await GalleryImage.find({ eventId: event._id }).sort({ uploadedAt: -1 });
    res.json({ ok: true, event, images });
  } catch (err) {
    next(err);
  }
});

// POST create event (admin)
router.post('/', requireAdminAuth, upload.single('cover'), async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ ok: false, message: 'Event name is required' });
    }

    const eventFolder = generateUniqueFilename(name).replace(/[^a-zA-Z0-9_-]/g, '_');
    let coverImage = null;

    if (req.file) {
      if (!allowedExtensions.images.includes(req.file.mimetype)) {
        return res.status(400).json({ ok: false, message: 'Invalid cover image type' });
      }
      const coverFilename = generateUniqueFilename(req.file.originalname);
      coverImage = saveGalleryFile(req.file.buffer, coverFilename, eventFolder);
    }

    const event = await GalleryEvent.create({
      name,
      coverImage,
    });

    res.status(201).json({ ok: true, event });
  } catch (err) {
    next(err);
  }
});

// PUT update event name/cover (admin)
router.put('/:id', requireAdminAuth, upload.single('cover'), async (req, res, next) => {
  try {
    const event = await GalleryEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ ok: false, message: 'Event not found' });
    }

    const { name } = req.body;
    if (name !== undefined) event.name = name;

    if (req.file) {
      if (!allowedExtensions.images.includes(req.file.mimetype)) {
        return res.status(400).json({ ok: false, message: 'Invalid cover image type' });
      }

      // Delete old cover if exists
      if (event.coverImage) {
        await fs.unlink(path.join('.', event.coverImage)).catch(() => {});
      }

      const eventFolder = event._id.toString();
      const coverFilename = generateUniqueFilename(req.file.originalname);
      event.coverImage = saveGalleryFile(req.file.buffer, coverFilename, eventFolder);
    }

    await event.save();
    res.json({ ok: true, event });
  } catch (err) {
    next(err);
  }
});

// DELETE event and all its images (admin)
router.delete('/:id', requireAdminAuth, async (req, res, next) => {
  try {
    const event = await GalleryEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ ok: false, message: 'Event not found' });
    }

    // Delete all images for this event
    const images = await GalleryImage.find({ eventId: event._id });
    for (const img of images) {
      const filesToDelete = [path.join('.', img.url)];
      if (img.thumbnail) filesToDelete.push(path.join('.', img.thumbnail));
      if (img.medium) filesToDelete.push(path.join('.', img.medium));
      if (img.hero) filesToDelete.push(path.join('.', img.hero));
      for (const f of filesToDelete) {
        await fs.unlink(f).catch(() => {});
      }
    }
    await GalleryImage.deleteMany({ eventId: event._id });

    // Delete cover image
    if (event.coverImage) {
      await fs.unlink(path.join('.', event.coverImage)).catch(() => {});
    }

    // Try to remove the event folder
    const eventFolder = event._id.toString();
    await fs.rm(path.join('uploads', 'gallery', eventFolder), { recursive: true, force: true }).catch(() => {});

    await GalleryEvent.deleteOne({ _id: event._id });
    res.json({ ok: true, message: 'Event and all images deleted' });
  } catch (err) {
    next(err);
  }
});

// POST upload images to an event (admin)
router.post('/:id/images', requireAdminAuth, upload.array('images'), async (req, res, next) => {
  try {
    const event = await GalleryEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ ok: false, message: 'Event not found' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ ok: false, message: 'No image files provided' });
    }

    const invalidFile = req.files.find(f => !allowedExtensions.images.includes(f.mimetype));
    if (invalidFile) {
      return res.status(400).json({ ok: false, message: `Invalid file type: ${invalidFile.originalname}` });
    }

    const eventFolder = event._id.toString();
    const savedImages = [];
    const total = req.files.length;

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const uniqueFilename = generateUniqueFilename(file.originalname);
      const url = saveGalleryFile(file.buffer, uniqueFilename, eventFolder);

      const image = await GalleryImage.create({
        eventId: event._id,
        filename: uniqueFilename,
        originalName: file.originalname,
        url,
        size: file.size,
      });

      savedImages.push(image);

      broadcast({
        type: 'gallery-upload-progress',
        eventId: event._id.toString(),
        filename: file.originalname,
        step: 'saved',
        current: i + 1,
        total,
      });

      const localDiskPath = path.join('uploads', 'gallery', eventFolder, uniqueFilename);
      const baseName = path.basename(uniqueFilename, path.extname(uniqueFilename));
      const outputDir = path.join('uploads', 'gallery', eventFolder);

      const onProgress = (step) => {
        broadcast({
          type: 'gallery-upload-progress',
          eventId: event._id.toString(),
          filename: file.originalname,
          step,
          current: i + 1,
          total,
        });
      };

      processImage(localDiskPath, baseName, outputDir, onProgress)
        .then(({ thumbnail, medium, hero }) =>
          GalleryImage.updateOne({ _id: image._id }, { $set: { thumbnail, medium, hero } })
        )
        .then(() => {
          broadcast({
            type: 'gallery-upload-progress',
            eventId: event._id.toString(),
            filename: file.originalname,
            step: 'complete',
            current: i + 1,
            total,
          });
        })
        .catch(err => logger.error('[Gallery] Background processing error:', err));
    }

    res.status(201).json({ ok: true, images: savedImages });
  } catch (err) {
    next(err);
  }
});

// DELETE single image from an event (admin)
router.delete('/:eventId/images/:imageId', requireAdminAuth, async (req, res, next) => {
  try {
    const image = await GalleryImage.findOne({ _id: req.params.imageId, eventId: req.params.eventId });
    if (!image) {
      return res.status(404).json({ ok: false, message: 'Image not found' });
    }

    const filesToDelete = [path.join('.', image.url)];
    if (image.thumbnail) filesToDelete.push(path.join('.', image.thumbnail));
    if (image.medium) filesToDelete.push(path.join('.', image.medium));
    if (image.hero) filesToDelete.push(path.join('.', image.hero));

    for (const f of filesToDelete) {
      await fs.unlink(f).catch(() => {});
    }

    await GalleryImage.deleteOne({ _id: image._id });
    res.json({ ok: true, message: 'Image deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
