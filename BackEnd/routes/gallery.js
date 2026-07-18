import { Router } from 'express';
import GalleryCollection from '../models/GalleryCollection.js';
import GalleryImage from '../models/GalleryImage.js';
import { requireAdminAuth } from '../middleware/auth.js';
import { deleteFromB2, getPresignedDownloadUrl } from '../services/b2.service.js';
import logger from '../utils/logger.js';

const router = Router();

/* ================================================================
   COLLECTIONS
   ================================================================ */

// GET all collections (public) — returns collections with image count & signed URLs
router.get('/', async (req, res, next) => {
  try {
    const collections = await GalleryCollection.find().sort({ createdAt: -1 }).lean();

    const collectionsWithCount = await Promise.all(
      collections.map(async (col) => {
        const imageCount = await GalleryImage.countDocuments({ collectionId: col._id });
        // Serve best available cover variant as the display URL
        const displayKey = col.coverMedium || col.coverThumbnail || col.coverImage;
        col.coverImage = displayKey ? await getPresignedDownloadUrl(displayKey) : null;
        return { ...col, imageCount };
      })
    );

    res.json({ ok: true, collections: collectionsWithCount });
  } catch (err) {
    next(err);
  }
});

// POST create collection (admin) — receives all 4 cover B2 keys
router.post('/', requireAdminAuth, async (req, res, next) => {
  try {
    const { name, coverImage, coverThumbnail, coverMedium, coverHero } = req.body;
    if (!name) {
      return res.status(400).json({ ok: false, message: 'Collection name is required.' });
    }
    if (!coverImage) {
      return res.status(400).json({ ok: false, message: 'Cover image is required.' });
    }

    const existingCollection = await GalleryCollection.findOne({ name: new RegExp('^' + name + '$', 'i') });
    if (existingCollection) {
      return res.status(400).json({ ok: false, message: 'A collection with this name already exists.' });
    }

    const collection = await GalleryCollection.create({
      name,
      coverImage,
      coverThumbnail: coverThumbnail || null,
      coverMedium:    coverMedium    || null,
      coverHero:      coverHero      || null,
    });

    const colObj = collection.toObject();
    // Return the best available key as the display URL
    const displayKey = colObj.coverMedium || colObj.coverThumbnail || colObj.coverImage;
    colObj.coverImage = displayKey ? await getPresignedDownloadUrl(displayKey) : null;

    res.status(201).json({ ok: true, collection: colObj });
  } catch (err) {
    next(err);
  }
});

// PUT update collection name/cover (admin)
router.put('/:collectionId', requireAdminAuth, async (req, res, next) => {
  try {
    const collection = await GalleryCollection.findById(req.params.collectionId);
    if (!collection) {
      return res.status(404).json({ ok: false, message: 'Collection not found' });
    }

    const { name, coverImage, coverThumbnail, coverMedium, coverHero } = req.body;
    if (name !== undefined) {
      const existingCollection = await GalleryCollection.findOne({
        name: new RegExp('^' + name + '$', 'i'),
        _id: { $ne: req.params.collectionId }
      });
      if (existingCollection) {
        return res.status(400).json({ ok: false, message: 'A collection with this name already exists.' });
      }
      collection.name = name;
    }

    if (coverImage !== undefined) {
      // Delete all old cover variants from B2 before replacing
      const oldKeys = [
        collection.coverImage,
        collection.coverThumbnail,
        collection.coverMedium,
        collection.coverHero,
      ].filter(Boolean);

      // Only delete if the new primary key is actually different
      if (collection.coverImage !== coverImage) {
        await Promise.all(
          oldKeys.map(k => deleteFromB2(k).catch(err =>
            logger.error('[GalleryRouter] Error deleting old cover variant:', err)
          ))
        );
      }

      collection.coverImage     = coverImage;
      collection.coverThumbnail = coverThumbnail || null;
      collection.coverMedium    = coverMedium    || null;
      collection.coverHero      = coverHero      || null;
    }

    await collection.save();

    const colObj = collection.toObject();
    const displayKey = colObj.coverMedium || colObj.coverThumbnail || colObj.coverImage;
    colObj.coverImage = displayKey ? await getPresignedDownloadUrl(displayKey) : null;

    res.json({ ok: true, collection: colObj });
  } catch (err) {
    next(err);
  }
});

// DELETE collection and ALL its images (admin)
router.delete('/:collectionId', requireAdminAuth, async (req, res, next) => {
  try {
    const collection = await GalleryCollection.findById(req.params.collectionId);
    if (!collection) {
      return res.status(404).json({ ok: false, message: 'Collection not found' });
    }

    // 1. Delete all images in this collection from B2 + DB
    const collectionImages = await GalleryImage.find({ collectionId: collection._id });
    for (const img of collectionImages) {
      if (img.url)       await deleteFromB2(img.url).catch(() => {});
      if (img.thumbnail) await deleteFromB2(img.thumbnail).catch(() => {});
      if (img.medium)    await deleteFromB2(img.medium).catch(() => {});
      if (img.hero)      await deleteFromB2(img.hero).catch(() => {});
    }
    await GalleryImage.deleteMany({ collectionId: collection._id });
    logger.info(`[GalleryRouter] Deleted ${collectionImages.length} images for collection ${collection._id}`);

    // 2. Delete ALL cover variants (original + thumbnail + medium + hero) from B2
    const coverKeys = [
      collection.coverImage,
      collection.coverThumbnail,
      collection.coverMedium,
      collection.coverHero,
    ].filter(Boolean);
    await Promise.all(coverKeys.map(k => deleteFromB2(k).catch(() => {})));

    await GalleryCollection.deleteOne({ _id: collection._id });
    res.json({ ok: true, message: 'Collection and all its images deleted from B2 and DB' });
  } catch (err) {
    next(err);
  }
});

/* ================================================================
   COLLECTION IMAGES
   ================================================================ */

// GET all images in a collection (public)
router.get('/:collectionId/images', async (req, res, next) => {
  try {
    const collection = await GalleryCollection.findById(req.params.collectionId);
    if (!collection) {
      return res.status(404).json({ ok: false, message: 'Collection not found' });
    }

    const images = await GalleryImage.find({ collectionId: collection._id }).sort({ uploadedAt: -1 }).lean();

    const signedImages = await Promise.all(
      images.map(async (img) => ({
        ...img,
        url: await getPresignedDownloadUrl(img.url),
        thumbnail: img.thumbnail ? await getPresignedDownloadUrl(img.thumbnail) : null,
        medium: img.medium ? await getPresignedDownloadUrl(img.medium) : null,
        hero: img.hero ? await getPresignedDownloadUrl(img.hero) : null,
      }))
    );

    const colObj = collection.toObject ? collection.toObject() : collection;
    const displayKey = colObj.coverMedium || colObj.coverThumbnail || colObj.coverImage;
    colObj.coverImage = displayKey ? await getPresignedDownloadUrl(displayKey) : null;

    res.json({ ok: true, collection: colObj, images: signedImages });
  } catch (err) {
    next(err);
  }
});

// POST save direct collection images metadata (admin)
router.post('/:collectionId/images', requireAdminAuth, async (req, res, next) => {
  try {
    const collection = await GalleryCollection.findById(req.params.collectionId);
    if (!collection) {
      return res.status(404).json({ ok: false, message: 'Collection not found' });
    }

    const { images } = req.body;
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ ok: false, message: 'No image data provided' });
    }

    const savedImages = [];

    for (const imgData of images) {
      const { filename, originalName, url, thumbnail, medium, hero, size } = imgData;

      if (!filename || !originalName || !url) {
        return res.status(400).json({ ok: false, message: 'Missing filename, originalName, or url key' });
      }

      const image = await GalleryImage.create({
        collectionId: collection._id,
        filename,
        originalName,
        url,
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

// DELETE a single image from a collection (admin)
router.delete('/:collectionId/images/:imageId', requireAdminAuth, async (req, res, next) => {
  try {
    const image = await GalleryImage.findOne({ _id: req.params.imageId, collectionId: req.params.collectionId });
    if (!image) {
      return res.status(404).json({ ok: false, message: 'Image not found' });
    }

    if (image.url) await deleteFromB2(image.url).catch(() => {});
    if (image.thumbnail) await deleteFromB2(image.thumbnail).catch(() => {});
    if (image.medium) await deleteFromB2(image.medium).catch(() => {});
    if (image.hero) await deleteFromB2(image.hero).catch(() => {});

    await GalleryImage.deleteOne({ _id: image._id });
    res.json({ ok: true, message: 'Image and all its variants deleted from B2 and DB' });
  } catch (err) {
    next(err);
  }
});

export default router;
