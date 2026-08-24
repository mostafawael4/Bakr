import { Router } from 'express';
import jwt from 'jsonwebtoken';
import archiver from 'archiver';
import { Readable } from 'stream';
import ClientEvent from '../models/ClientEvent.js';
import ClientEventImage from '../models/ClientEventImage.js';
import { requireAdminAuth } from '../middleware/auth.js';
import Credentials from '../config/Credentials.js';
import { deleteFromB2, getPresignedDownloadUrl, resolveImageUrls } from '../services/b2.service.js';
import logger from '../utils/logger.js';

const router = Router();

async function resolveFolderCover(eventId, folderKey, coverImageId) {
  if (coverImageId) {
    const chosen = await ClientEventImage.findOne({ _id: coverImageId, eventId, folderKey }).lean();
    if (chosen) return chosen;
  }
  return ClientEventImage.findOne({ eventId, folderKey }).sort({ uploadedAt: 1 }).lean();
}

async function buildFolders(event) {
  const keys = await ClientEventImage.distinct('folderKey', { eventId: event._id });
  const covers = event.folderCovers || {};

  return Promise.all(
    keys.map(async (key) => {
      const count = await ClientEventImage.countDocuments({ eventId: event._id, folderKey: key });
      const coverImg = await resolveFolderCover(event._id, key, covers[key]);
      
      let coverUrl = null;
      if (coverImg) {
        coverUrl = await getPresignedDownloadUrl(coverImg.medium || coverImg.url);
      }

      return {
        key,
        count,
        coverImage: coverUrl,
        coverImageId: coverImg ? coverImg._id.toString() : null,
      };
    })
  );
}

function clearFolderCoverIfMatch(event, folderKey, imageId) {
  const covers = event.folderCovers || {};
  if (covers[folderKey]?.toString() === imageId.toString()) {
    delete covers[folderKey];
    event.folderCovers = covers;
    event.markModified('folderCovers');
    return true;
  }
  return false;
}

function parseFocal(value, fallback = 50) {
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

async function publicEventPayload(event) {
  // Use the highest quality available for the hero
  const displayKey = event.backgroundHero || event.backgroundImage || event.backgroundMedium;
  const bgImage = displayKey ? await getPresignedDownloadUrl(displayKey) : null;
  return {
    _id: event._id,
    brideName: event.brideName,
    groomName: event.groomName,
    backgroundImage: bgImage,
    heroFocalX: event.heroFocalX ?? 50,
    heroFocalY: event.heroFocalY ?? 50,
  };
}

/* ── Helper: check client session ── */
function requireClientAccess(req, res, next) {
  const eventId = req.params.id || req.params.eventId;
  
  // 1. Session checks
  if (req.session && req.session.clientEventId === eventId) {
    return next();
  }
  if (req.session && req.session.adminId) {
    return next();
  }

  // 2. JWT token check (via header or query param)
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, Credentials.SESSION_SECRET || 'dev-secret-change-me');
      
      // Admin token allows any event
      if (decoded.role === 'admin') {
        req.adminId = decoded.adminId;
        return next();
      }
      
      // Client token must match the event ID
      if (decoded.clientEventId === eventId) {
        req.clientEventId = decoded.clientEventId;
        return next();
      }
    } catch (err) {
      // invalid token falls through to 401
    }
  }

  return res.status(401).json({ ok: false, message: 'Unauthorized — please enter the event password' });
}

/* ================================================================
   ADMIN — CRUD
   ================================================================ */

// GET all client events (admin)
router.get('/', requireAdminAuth, async (req, res, next) => {
  try {
    const events = await ClientEvent.find().sort({ createdAt: -1 }).lean();

    const eventsWithCount = await Promise.all(
      events.map(async (ev) => {
        const imageCount = await ClientEventImage.countDocuments({ eventId: ev._id });
        const folders = await ClientEventImage.distinct('folderKey', { eventId: ev._id });
        
        const backgroundImageKey = ev.backgroundImage || null;
        const displayKey = ev.backgroundMedium || ev.backgroundThumbnail || ev.backgroundImage;
        if (displayKey) {
          ev.backgroundImage = await getPresignedDownloadUrl(displayKey);
        } else {
          ev.backgroundImage = null;
        }

        return { ...ev, backgroundImageKey, imageCount, folderCount: folders.length };
      })
    );

    res.json({ ok: true, events: eventsWithCount });
  } catch (err) {
    next(err);
  }
});

// POST create client event (admin)
router.post('/', requireAdminAuth, async (req, res, next) => {
  try {
    const { brideName, groomName, password, backgroundImage, backgroundThumbnail, backgroundMedium, backgroundHero, heroFocalX, heroFocalY } = req.body;

    if (!brideName || !groomName || !password) {
      return res.status(400).json({ ok: false, message: 'Bride name, groom name, and password are required' });
    }
    if (!backgroundImage) {
      return res.status(400).json({ ok: false, message: 'Background image is required for new events' });
    }

    const event = await ClientEvent.create({
      brideName,
      groomName,
      password,
      backgroundImage, // original B2 key
      backgroundThumbnail: backgroundThumbnail || null,
      backgroundMedium: backgroundMedium || null,
      backgroundHero: backgroundHero || null,
      heroFocalX: parseFocal(heroFocalX),
      heroFocalY: parseFocal(heroFocalY),
    });

    const eventObj = event.toObject();
    const displayKey = eventObj.backgroundMedium || eventObj.backgroundThumbnail || eventObj.backgroundImage;
    if (displayKey) {
      eventObj.backgroundImage = await getPresignedDownloadUrl(displayKey);
    } else {
      eventObj.backgroundImage = null;
    }

    res.status(201).json({ ok: true, event: eventObj });
  } catch (err) {
    next(err);
  }
});

// PUT update client event (admin)
router.put('/:id', requireAdminAuth, async (req, res, next) => {
  try {
    const event = await ClientEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ ok: false, message: 'Event not found' });
    }

    const { brideName, groomName, password, isActive, heroFocalX, heroFocalY, backgroundImage, backgroundThumbnail, backgroundMedium, backgroundHero } = req.body;
    if (brideName !== undefined) event.brideName = brideName;
    if (groomName !== undefined) event.groomName = groomName;
    if (password !== undefined) event.password = password;
    if (isActive !== undefined) event.isActive = isActive === 'true' || isActive === true;
    if (heroFocalX !== undefined) event.heroFocalX = parseFocal(heroFocalX, event.heroFocalX ?? 50);
    if (heroFocalY !== undefined) event.heroFocalY = parseFocal(heroFocalY, event.heroFocalY ?? 50);

    if (backgroundImage !== undefined) {
      // Delete old background variants from B2
      const oldKeys = [
        event.backgroundImage,
        event.backgroundThumbnail,
        event.backgroundMedium,
        event.backgroundHero
      ].filter(Boolean);

      if (event.backgroundImage !== backgroundImage) {
        await Promise.all(
          oldKeys.map(k => deleteFromB2(k).catch(() => {}))
        );
      }

      event.backgroundImage = backgroundImage;
      event.backgroundThumbnail = backgroundThumbnail || null;
      event.backgroundMedium = backgroundMedium || null;
      event.backgroundHero = backgroundHero || null;
    }

    await event.save();

    const eventObj = event.toObject();
    const displayKey = eventObj.backgroundHero || eventObj.backgroundImage || eventObj.backgroundMedium;
    if (displayKey) {
      eventObj.backgroundImage = await getPresignedDownloadUrl(displayKey);
    } else {
      eventObj.backgroundImage = null;
    }

    res.json({ ok: true, event: eventObj });
  } catch (err) {
    next(err);
  }
});

// DELETE client event and all its images (admin)
router.delete('/:id', requireAdminAuth, async (req, res, next) => {
  try {
    const event = await ClientEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ ok: false, message: 'Event not found' });
    }

    // Delete all images from B2
    const images = await ClientEventImage.find({ eventId: event._id });
    for (const img of images) {
      if (img.url) await deleteFromB2(img.url).catch(() => {});
      if (img.thumbnail) await deleteFromB2(img.thumbnail).catch(() => {});
      if (img.medium) await deleteFromB2(img.medium).catch(() => {});
      if (img.hero) await deleteFromB2(img.hero).catch(() => {});
    }
    await ClientEventImage.deleteMany({ eventId: event._id });

    // Delete ALL background variants from B2
    const coverKeys = [
      event.backgroundImage,
      event.backgroundThumbnail,
      event.backgroundMedium,
      event.backgroundHero
    ].filter(Boolean);
    await Promise.all(coverKeys.map(k => deleteFromB2(k).catch(() => {})));

    await ClientEvent.deleteOne({ _id: event._id });
    res.json({ ok: true, message: 'Event and all images deleted from B2' });
  } catch (err) {
    next(err);
  }
});

/* ================================================================
   CLIENT ACCESS — password auth
   ================================================================ */

// POST client login (public)
router.post('/access', async (req, res, next) => {
  try {
    const { eventId, password } = req.body;

    if (!eventId || !password) {
      return res.status(400).json({ ok: false, message: 'Event ID and password are required' });
    }

    const event = await ClientEvent.findById(eventId);
    if (!event) {
      return res.status(404).json({ ok: false, message: 'Event not found' });
    }

    if (!event.isActive) {
      return res.status(403).json({ ok: false, message: 'This event is no longer available' });
    }

    if (event.password !== password) {
      return res.status(401).json({ ok: false, message: 'Incorrect password' });
    }

    // Store client access in session (for desktop / backwards compatibility)
    req.session.clientEventId = event._id.toString();

    // Generate JWT token (for mobile / Safari compatibility)
    const token = jwt.sign(
      { clientEventId: event._id.toString(), role: 'client' },
      Credentials.SESSION_SECRET || 'dev-secret-change-me',
      { expiresIn: '7d' }
    );

    res.json({
      ok: true,
      event: await publicEventPayload(event),
      token,
    });
  } catch (err) {
    next(err);
  }
});

// GET check client session (public)
router.get('/access/check', async (req, res, next) => {
  try {
    let eventId = null;

    if (req.session && req.session.clientEventId) {
      eventId = req.session.clientEventId;
    }

    const authHeader = req.headers.authorization;
    if (!eventId && authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, Credentials.SESSION_SECRET || 'dev-secret-change-me');
        if (decoded.clientEventId) {
          eventId = decoded.clientEventId;
        }
      } catch (err) {}
    }

    if (!eventId) {
      return res.status(401).json({ ok: false, message: 'No active session' });
    }

    const event = await ClientEvent.findById(eventId);
    if (!event || !event.isActive) {
      return res.status(401).json({ ok: false, message: 'Session expired' });
    }

    res.json({
      ok: true,
      event: await publicEventPayload(event),
    });
  } catch (err) {
    next(err);
  }
});

/* ================================================================
   CLIENT-FACING — read only (requires client session OR admin)
   ================================================================ */

// GET event details + folders (client)
router.get('/:id/details', requireClientAccess, async (req, res, next) => {
  try {
    const event = await ClientEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ ok: false, message: 'Event not found' });
    }

    const folderCounts = await buildFolders(event);

    res.json({
      ok: true,
      event: await publicEventPayload(event),
      folders: folderCounts,
    });
  } catch (err) {
    next(err);
  }
});

// GET images by folder key (client)
router.get('/:id/images', requireClientAccess, async (req, res, next) => {
  try {
    const filter = { eventId: req.params.id };
    if (req.query.folder) {
      filter.folderKey = req.query.folder;
    }

    let images = await ClientEventImage.find(filter).lean();

    // Natural sort by originalName (e.g. S&h-1, S&h-2, S&h-10)
    images.sort((a, b) => {
      const nameA = a.originalName || '';
      const nameB = b.originalName || '';
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    });

    const signedImages = await Promise.all(
      images.map(async (img) => {
        const urls = await resolveImageUrls([
          { key: img.url, field: 'url' },
          { key: img.thumbnail, field: 'thumbnail' },
          { key: img.medium, field: 'medium' },
          { key: img.hero, field: 'hero' },
        ]);
        return {
          ...img,
          ...urls,
        };
      })
    );

    res.json({ ok: true, images: signedImages });
  } catch (err) {
    next(err);
  }
});

/* ================================================================
   ADMIN — folders & images management
   ================================================================ */

// GET all folders for an event (admin)
router.get('/:id/folders', requireAdminAuth, async (req, res, next) => {
  try {
    const event = await ClientEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ ok: false, message: 'Event not found' });
    }

    const folderCounts = await buildFolders(event);

    res.json({ ok: true, folders: folderCounts });
  } catch (err) {
    next(err);
  }
});

// PUT set folder cover image (admin)
router.put('/:id/folders/:folderKey/cover', requireAdminAuth, async (req, res, next) => {
  try {
    const event = await ClientEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ ok: false, message: 'Event not found' });
    }

    const { imageId } = req.body;
    if (!imageId) {
      return res.status(400).json({ ok: false, message: 'Image ID is required' });
    }

    const image = await ClientEventImage.findOne({
      _id: imageId,
      eventId: event._id,
      folderKey: req.params.folderKey,
    }).lean();

    if (!image) {
      return res.status(404).json({ ok: false, message: 'Image not found in this folder' });
    }

    event.folderCovers = event.folderCovers || {};
    event.folderCovers[req.params.folderKey] = image._id;
    event.markModified('folderCovers');
    await event.save();

    const signedCoverUrl = await getPresignedDownloadUrl(image.medium || image.url);

    res.json({
      ok: true,
      coverImageId: image._id.toString(),
      coverImage: signedCoverUrl,
    });
  } catch (err) {
    next(err);
  }
});

// POST save client event images metadata (admin) — receives uploaded B2 keys
router.post('/:id/images', requireAdminAuth, async (req, res, next) => {
  try {
    const event = await ClientEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ ok: false, message: 'Event not found' });
    }

    const { folderKey, images } = req.body;
    if (!folderKey) {
      return res.status(400).json({ ok: false, message: 'Folder key is required' });
    }

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ ok: false, message: 'No image data provided' });
    }

    const savedImages = [];

    for (const imgData of images) {
      const { filename, originalName, url, thumbnail, medium, hero, size } = imgData;

      if (!filename || !originalName || !url) {
        return res.status(400).json({ ok: false, message: 'Missing filename, originalName, or url' });
      }

      const image = await ClientEventImage.create({
        eventId: event._id,
        filename,
        originalName,
        url, // B2 key path
        thumbnail: thumbnail || null,
        medium: medium || null,
        hero: hero || null,
        size: size || 0,
        folderKey,
      });

      const imgObj = image.toObject();
      const urls = await resolveImageUrls([
        { key: image.url, field: 'url' },
        { key: image.thumbnail, field: 'thumbnail' },
        { key: image.medium, field: 'medium' },
        { key: image.hero, field: 'hero' },
      ]);
      Object.assign(imgObj, urls);

      savedImages.push(imgObj);
    }

    res.status(201).json({ ok: true, images: savedImages });
  } catch (err) {
    next(err);
  }
});

// DELETE single image (admin)
router.delete('/:eventId/images/:imageId', requireAdminAuth, async (req, res, next) => {
  try {
    const image = await ClientEventImage.findOne({ _id: req.params.imageId, eventId: req.params.eventId });
    if (!image) {
      return res.status(404).json({ ok: false, message: 'Image not found' });
    }

    const event = await ClientEvent.findById(req.params.eventId);
    if (event && clearFolderCoverIfMatch(event, image.folderKey, image._id)) {
      await event.save();
    }

    // Delete files from B2
    if (image.url) await deleteFromB2(image.url).catch(() => {});
    if (image.thumbnail) await deleteFromB2(image.thumbnail).catch(() => {});
    if (image.medium) await deleteFromB2(image.medium).catch(() => {});
    if (image.hero) await deleteFromB2(image.hero).catch(() => {});

    await ClientEventImage.deleteOne({ _id: image._id });
    res.json({ ok: true, message: 'Image deleted from B2 and DB' });
  } catch (err) {
    next(err);
  }
});

// DELETE all images in a folder (admin)
router.delete('/:eventId/folders/:folderKey', requireAdminAuth, async (req, res, next) => {
  try {
    const images = await ClientEventImage.find({
      eventId: req.params.eventId,
      folderKey: req.params.folderKey,
    });

    const event = await ClientEvent.findById(req.params.eventId);
    if (event?.folderCovers?.[req.params.folderKey]) {
      delete event.folderCovers[req.params.folderKey];
      event.markModified('folderCovers');
      await event.save();
    }

    // Delete all images in folder from B2
    for (const img of images) {
      if (img.url) await deleteFromB2(img.url).catch(() => {});
      if (img.thumbnail) await deleteFromB2(img.thumbnail).catch(() => {});
      if (img.medium) await deleteFromB2(img.medium).catch(() => {});
      if (img.hero) await deleteFromB2(img.hero).catch(() => {});
    }

    await ClientEventImage.deleteMany({
      eventId: req.params.eventId,
      folderKey: req.params.folderKey,
    });

    res.json({ ok: true, message: `Folder "${req.params.folderKey}" and all its images deleted from B2` });
  } catch (err) {
    next(err);
  }
});

// POST Generate a ZIP for a folder and upload it to B2 (Admin Only)
router.post('/:eventId/folders/:folderKey/zip', requireAdminAuth, async (req, res, next) => {
  try {
    const { eventId, folderKey } = req.params;
    
    const event = await ClientEvent.findById(eventId);
    if (!event) return res.status(404).json({ ok: false, message: 'Event not found' });

    const images = await ClientEventImage.find({ eventId, folderKey }).lean();
    if (!images.length) return res.status(404).json({ ok: false, message: 'Folder is empty' });

    const zipKey = `zips/${eventId}/${folderKey}.zip`;
    const archive = archiver('zip', { zlib: { level: 0 } });
    
    // Instead of responding, pipe the archive to B2 upload
    const uploadPromise = import('../services/b2.service.js').then(m => m.uploadStreamToB2(zipKey, archive));

    archive.on('error', (err) => {
      logger.error(`[ZIP Generate] Archive error: ${err.message}`);
    });

    for (const image of images) {
      try {
        const url = await getPresignedDownloadUrl(image.url);
        const response = await fetch(url);
        if (response.ok && response.body) {
          const nodeStream = Readable.fromWeb(response.body);
          archive.append(nodeStream, { name: image.originalName || image.filename });
        }
      } catch (err) {
        logger.error(`[ZIP Generate] Failed to fetch image ${image.url}: ${err.message}`);
      }
    }

    await archive.finalize();
    await uploadPromise;

    // Save the zipKey to the event document
    const folderZips = event.folderZips || {};
    folderZips[folderKey] = zipKey;
    event.folderZips = folderZips;
    event.markModified('folderZips');
    await event.save();

    res.json({ ok: true, message: 'ZIP generated and uploaded to B2' });
  } catch (err) {
    next(err);
  }
});

// GET Redirect to the pre-generated ZIP for downloading (Client)
router.get('/:eventId/folders/:folderKey/download', requireClientAccess, async (req, res, next) => {
  try {
    const { eventId, folderKey } = req.params;
    
    const event = await ClientEvent.findById(eventId);
    if (!event) return res.status(404).send('Event not found');

    const zipKey = event.folderZips?.[folderKey];
    if (!zipKey) {
      return res.status(404).send('ZIP file not found. Please contact the photographer to generate it.');
    }

    // Get the download URL (presigned or public)
    const url = await getPresignedDownloadUrl(zipKey);
    if (!url) {
      return res.status(500).send('Failed to generate download link');
    }

    // Redirect the browser to natively download the file
    res.redirect(url);
  } catch (err) {
    next(err);
  }
});

export default router;
