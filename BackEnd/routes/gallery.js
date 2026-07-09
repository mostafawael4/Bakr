import { Router } from 'express';
import GalleryCollection from '../models/GalleryCollection.js';
import GalleryEvent from '../models/GalleryEvent.js';
import GalleryImage from '../models/GalleryImage.js';
import { requireAdminAuth } from '../middleware/auth.js';
import { deleteFromB2, getPresignedDownloadUrl } from '../services/b2.service.js';
import logger from '../utils/logger.js';

const router = Router();

/* ================================================================
   COLLECTIONS
   ================================================================ */

// GET all collections (public) — returns collections with event count & signed URLs
router.get('/', async (req, res, next) => {
  try {
    const collections = await GalleryCollection.find().sort({ createdAt: -1 }).lean();

    const collectionsWithCount = await Promise.all(
      collections.map(async (col) => {
        const eventCount = await GalleryEvent.countDocuments({ collectionId: col._id });
        if (col.coverImage) {
          col.coverImage = await getPresignedDownloadUrl(col.coverImage);
        }
        return { ...col, eventCount };
      })
    );

    res.json({ ok: true, collections: collectionsWithCount });
  } catch (err) {
    next(err);
  }
});

// POST create collection (admin) — receives coverImage as B2 key
router.post('/', requireAdminAuth, async (req, res, next) => {
  try {
    const { name, coverImage } = req.body;
    if (!name) {
      return res.status(400).json({ ok: false, message: 'Collection name is required' });
    }

    const collection = await GalleryCollection.create({ name, coverImage });
    
    const colObj = collection.toObject();
    if (colObj.coverImage) {
      colObj.coverImage = await getPresignedDownloadUrl(colObj.coverImage);
    }

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

    const { name, coverImage } = req.body;
    if (name !== undefined) collection.name = name;

    if (coverImage !== undefined) {
      // Delete old cover from B2 if exists
      if (collection.coverImage && collection.coverImage !== coverImage) {
        await deleteFromB2(collection.coverImage).catch(err => 
          logger.error('[GalleryRouter] Error deleting old collection cover:', err)
        );
      }
      collection.coverImage = coverImage;
    }

    await collection.save();
    
    const colObj = collection.toObject();
    if (colObj.coverImage) {
      colObj.coverImage = await getPresignedDownloadUrl(colObj.coverImage);
    }

    res.json({ ok: true, collection: colObj });
  } catch (err) {
    next(err);
  }
});

// DELETE collection and ALL its events + images (admin)
router.delete('/:collectionId', requireAdminAuth, async (req, res, next) => {
  try {
    const collection = await GalleryCollection.findById(req.params.collectionId);
    if (!collection) {
      return res.status(404).json({ ok: false, message: 'Collection not found' });
    }

    // Find all events in this collection
    const events = await GalleryEvent.find({ collectionId: collection._id });

    for (const event of events) {
      // Find and delete all images for this event
      const images = await GalleryImage.find({ eventId: event._id });
      for (const img of images) {
        if (img.url) await deleteFromB2(img.url).catch(() => {});
        if (img.thumbnail) await deleteFromB2(img.thumbnail).catch(() => {});
        if (img.medium) await deleteFromB2(img.medium).catch(() => {});
        if (img.hero) await deleteFromB2(img.hero).catch(() => {});
      }
      await GalleryImage.deleteMany({ eventId: event._id });

      // Delete event cover image
      if (event.coverImage) {
        await deleteFromB2(event.coverImage).catch(() => {});
      }
    }

    // Delete all events in this collection
    await GalleryEvent.deleteMany({ collectionId: collection._id });

    // Delete collection cover image
    if (collection.coverImage) {
      await deleteFromB2(collection.coverImage).catch(() => {});
    }

    await GalleryCollection.deleteOne({ _id: collection._id });
    res.json({ ok: true, message: 'Collection and all its events and B2 assets deleted' });
  } catch (err) {
    next(err);
  }
});

/* ================================================================
   EVENTS (scoped under a collection)
   ================================================================ */

// GET all events in a collection (public) — returns events with image count & signed URLs
router.get('/:collectionId/events', async (req, res, next) => {
  try {
    const collection = await GalleryCollection.findById(req.params.collectionId);
    if (!collection) {
      return res.status(404).json({ ok: false, message: 'Collection not found' });
    }

    const events = await GalleryEvent.find({ collectionId: collection._id }).sort({ createdAt: -1 }).lean();

    const eventsWithCount = await Promise.all(
      events.map(async (event) => {
        const imageCount = await GalleryImage.countDocuments({ eventId: event._id });
        if (event.coverImage) {
          event.coverImage = await getPresignedDownloadUrl(event.coverImage);
        }
        return { ...event, imageCount };
      })
    );

    const colObj = collection.toObject ? collection.toObject() : collection;
    if (colObj.coverImage) {
      colObj.coverImage = await getPresignedDownloadUrl(colObj.coverImage);
    }

    res.json({ ok: true, collection: colObj, events: eventsWithCount });
  } catch (err) {
    next(err);
  }
});

// POST create event in a collection (admin) — receives coverImage as B2 key
router.post('/:collectionId/events', requireAdminAuth, async (req, res, next) => {
  try {
    const collection = await GalleryCollection.findById(req.params.collectionId);
    if (!collection) {
      return res.status(404).json({ ok: false, message: 'Collection not found' });
    }

    const { name, coverImage } = req.body;
    if (!name) {
      return res.status(400).json({ ok: false, message: 'Event name is required' });
    }

    const event = await GalleryEvent.create({
      collectionId: collection._id,
      name,
      coverImage,
    });

    const eventObj = event.toObject();
    if (eventObj.coverImage) {
      eventObj.coverImage = await getPresignedDownloadUrl(eventObj.coverImage);
    }

    res.status(201).json({ ok: true, event: eventObj });
  } catch (err) {
    next(err);
  }
});

/* ================================================================
   SINGLE EVENT
   ================================================================ */

// GET single event with all its images (public) — signs all image paths
router.get('/events/:id', async (req, res, next) => {
  try {
    const event = await GalleryEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ ok: false, message: 'Event not found' });
    }

    const images = await GalleryImage.find({ eventId: event._id }).sort({ uploadedAt: -1 }).lean();

    // Map through and dynamically sign GET URLs for each image size
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

    const eventObj = event.toObject();
    if (eventObj.coverImage) {
      eventObj.coverImage = await getPresignedDownloadUrl(eventObj.coverImage);
    }

    res.json({ ok: true, event: eventObj, images: signedImages });
  } catch (err) {
    next(err);
  }
});

// PUT update event name/cover (admin)
router.put('/events/:id', requireAdminAuth, async (req, res, next) => {
  try {
    const event = await GalleryEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ ok: false, message: 'Event not found' });
    }

    const { name, coverImage } = req.body;
    if (name !== undefined) event.name = name;

    if (coverImage !== undefined) {
      // Delete old cover if exists
      if (event.coverImage && event.coverImage !== coverImage) {
        await deleteFromB2(event.coverImage).catch(() => {});
      }
      event.coverImage = coverImage;
    }

    await event.save();

    const eventObj = event.toObject();
    if (eventObj.coverImage) {
      eventObj.coverImage = await getPresignedDownloadUrl(eventObj.coverImage);
    }

    res.json({ ok: true, event: eventObj });
  } catch (err) {
    next(err);
  }
});

// DELETE event and all its images (admin)
router.delete('/events/:id', requireAdminAuth, async (req, res, next) => {
  try {
    const event = await GalleryEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ ok: false, message: 'Event not found' });
    }

    // Delete all images from B2
    const images = await GalleryImage.find({ eventId: event._id });
    for (const img of images) {
      if (img.url) await deleteFromB2(img.url).catch(() => {});
      if (img.thumbnail) await deleteFromB2(img.thumbnail).catch(() => {});
      if (img.medium) await deleteFromB2(img.medium).catch(() => {});
      if (img.hero) await deleteFromB2(img.hero).catch(() => {});
    }
    await GalleryImage.deleteMany({ eventId: event._id });

    // Delete cover image
    if (event.coverImage) {
      await deleteFromB2(event.coverImage).catch(() => {});
    }

    await GalleryEvent.deleteOne({ _id: event._id });
    res.json({ ok: true, message: 'Event and all images deleted from B2' });
  } catch (err) {
    next(err);
  }
});

// POST save upload image metadata (admin) — receives uploaded B2 URLs/keys
router.post('/events/:id/images', requireAdminAuth, async (req, res, next) => {
  try {
    const event = await GalleryEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ ok: false, message: 'Event not found' });
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
        eventId: event._id,
        filename,
        originalName,
        url, // This is the B2 key path
        thumbnail: thumbnail || null,
        medium: medium || null,
        hero: hero || null,
        size: size || 0,
      });

      // Sign the paths for the API response payload
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

// DELETE single image from an event (admin)
router.delete('/events/:eventId/images/:imageId', requireAdminAuth, async (req, res, next) => {
  try {
    const image = await GalleryImage.findOne({ _id: req.params.imageId, eventId: req.params.eventId });
    if (!image) {
      return res.status(404).json({ ok: false, message: 'Image not found' });
    }

    // Delete keys from B2
    if (image.url) await deleteFromB2(image.url).catch(() => {});
    if (image.thumbnail) await deleteFromB2(image.thumbnail).catch(() => {});
    if (image.medium) await deleteFromB2(image.medium).catch(() => {});
    if (image.hero) await deleteFromB2(image.hero).catch(() => {});

    await GalleryImage.deleteOne({ _id: image._id });
    res.json({ ok: true, message: 'Image deleted from B2 and DB' });
  } catch (err) {
    next(err);
  }
});

export default router;
