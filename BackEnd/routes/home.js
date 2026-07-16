import { Router } from 'express';
import Home from '../models/Home.js';
import { requireAdminAuth } from '../middleware/auth.js';
import { deleteFromB2, getPresignedDownloadUrl } from '../services/b2.service.js';
import logger from '../utils/logger.js';

const router = Router();

// GET all home images (public) — returns images with signed URLs, supports pagination
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 16));
    const skip = (page - 1) * limit;

    const total = await Home.countDocuments();
    const images = await Home.find()
      .sort({ uploadedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    const signedImages = await Promise.all(
      images.map(async (img) => {
        return {
          ...img,
          url: await getPresignedDownloadUrl(img.url),
          thumbnail: img.thumbnail ? await getPresignedDownloadUrl(img.thumbnail) : null,
          medium: img.medium ? await getPresignedDownloadUrl(img.medium) : null,
          hero: img.hero ? await getPresignedDownloadUrl(img.hero) : null,
        };
      })
    );

    const hasMore = skip + limit < total;
    res.json({ ok: true, images: signedImages, hasMore, total, page, limit });
  } catch (err) {
    next(err);
  }
});

// POST save home images metadata (admin) — receives uploaded B2 keys
router.post('/upload', requireAdminAuth, async (req, res, next) => {
  try {
    const { images } = req.body;
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ ok: false, message: 'No image data provided' });
    }

    const savedImages = [];

    for (const imgData of images) {
      const { filename, originalName, url, thumbnail, medium, hero, size } = imgData;

      if (!filename || !originalName || !url) {
        return res.status(400).json({ ok: false, message: 'Missing filename, originalName, or url' });
      }

      const image = await Home.create({
        filename,
        originalName,
        url, // B2 key
        thumbnail: thumbnail || null,
        medium: medium || null,
        hero: hero || null,
        size: size || 0,
      });

      const imgObj = image.toObject();
      imgObj.url = await getPresignedDownloadUrl(image.url);
      imgObj.thumbnail = image.thumbnail ? await getPresignedDownloadUrl(image.thumbnail) : null;
      imgObj.medium = image.medium ? await getPresignedDownloadUrl(image.medium) : null;
      imgObj.hero = image.hero ? await getPresignedDownloadUrl(image.hero) : null;

      savedImages.push(imgObj);
    }

    res.status(201).json({ ok: true, images: savedImages });
  } catch (err) {
    next(err);
  }
});

// DELETE single home image (admin)
router.delete('/:id', requireAdminAuth, async (req, res, next) => {
  try {
    const image = await Home.findById(req.params.id);
    if (!image) {
      return res.status(404).json({ ok: false, message: 'Image not found' });
    }

    // Delete files from B2
    if (image.url) await deleteFromB2(image.url).catch(() => {});
    if (image.thumbnail) await deleteFromB2(image.thumbnail).catch(() => {});
    if (image.medium) await deleteFromB2(image.medium).catch(() => {});
    if (image.hero) await deleteFromB2(image.hero).catch(() => {});

    await Home.deleteOne({ _id: image._id });

    res.json({ ok: true, message: 'Image deleted from B2 and DB' });
  } catch (err) {
    next(err);
  }
});

export default router;
