import { Router } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import ClientEvent from '../models/ClientEvent.js';
import ClientEventImage from '../models/ClientEventImage.js';
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

async function resolveFolderCover(eventId, folderKey, coverImageId) {
  if (coverImageId) {
    const chosen = await ClientEventImage.findOne({ _id: coverImageId, eventId, folderKey });
    if (chosen) return chosen;
  }
  return ClientEventImage.findOne({ eventId, folderKey }).sort({ uploadedAt: 1 });
}

async function buildFolders(event) {
  const keys = await ClientEventImage.distinct('folderKey', { eventId: event._id });
  const covers = event.folderCovers || {};

  return Promise.all(
    keys.map(async (key) => {
      const count = await ClientEventImage.countDocuments({ eventId: event._id, folderKey: key });
      const coverImg = await resolveFolderCover(event._id, key, covers[key]);
      return {
        key,
        count,
        coverImage: coverImg ? (coverImg.medium || coverImg.url) : null,
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

/* ── Helper: check client session ── */
function requireClientAccess(req, res, next) {
  const eventId = req.params.id || req.params.eventId;
  if (req.session && req.session.clientEventId === eventId) {
    return next();
  }
  // Also allow admin through
  if (req.session && req.session.adminId) {
    return next();
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
        return { ...ev, imageCount, folderCount: folders.length };
      })
    );

    res.json({ ok: true, events: eventsWithCount });
  } catch (err) {
    next(err);
  }
});

// POST create client event (admin)
router.post('/', requireAdminAuth, upload.single('background'), async (req, res, next) => {
  try {
    const { brideName, groomName, password } = req.body;

    if (!brideName || !groomName || !password) {
      return res.status(400).json({ ok: false, message: 'Bride name, groom name, and password are required' });
    }

    let backgroundImage = null;

    if (req.file) {
      if (!allowedExtensions.images.includes(req.file.mimetype)) {
        return res.status(400).json({ ok: false, message: 'Invalid image type' });
      }
      const folder = 'client-events';
      const filename = generateUniqueFilename(req.file.originalname);
      backgroundImage = saveGalleryFile(req.file.buffer, filename, folder);
    }

    const event = await ClientEvent.create({ brideName, groomName, password, backgroundImage });
    res.status(201).json({ ok: true, event });
  } catch (err) {
    next(err);
  }
});

// PUT update client event (admin)
router.put('/:id', requireAdminAuth, upload.single('background'), async (req, res, next) => {
  try {
    const event = await ClientEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ ok: false, message: 'Event not found' });
    }

    const { brideName, groomName, password, isActive } = req.body;
    if (brideName !== undefined) event.brideName = brideName;
    if (groomName !== undefined) event.groomName = groomName;
    if (password !== undefined) event.password = password;
    if (isActive !== undefined) event.isActive = isActive === 'true' || isActive === true;

    if (req.file) {
      if (!allowedExtensions.images.includes(req.file.mimetype)) {
        return res.status(400).json({ ok: false, message: 'Invalid image type' });
      }

      // Delete old background if exists
      if (event.backgroundImage) {
        await fs.unlink(path.join('.', event.backgroundImage)).catch(() => {});
      }

      const folder = 'client-events';
      const filename = generateUniqueFilename(req.file.originalname);
      event.backgroundImage = saveGalleryFile(req.file.buffer, filename, folder);
    }

    await event.save();
    res.json({ ok: true, event });
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

    // Delete all images
    const images = await ClientEventImage.find({ eventId: event._id });
    for (const img of images) {
      const filesToDelete = [path.join('.', img.url)];
      if (img.thumbnail) filesToDelete.push(path.join('.', img.thumbnail));
      if (img.medium) filesToDelete.push(path.join('.', img.medium));
      if (img.hero) filesToDelete.push(path.join('.', img.hero));
      for (const f of filesToDelete) {
        await fs.unlink(f).catch(() => {});
      }
    }
    await ClientEventImage.deleteMany({ eventId: event._id });

    // Delete background image
    if (event.backgroundImage) {
      await fs.unlink(path.join('.', event.backgroundImage)).catch(() => {});
    }

    // Try to remove the event folder
    const eventFolder = `client-event-${event._id}`;
    await fs.rm(path.join('uploads', 'gallery', eventFolder), { recursive: true, force: true }).catch(() => {});

    await ClientEvent.deleteOne({ _id: event._id });
    res.json({ ok: true, message: 'Event and all images deleted' });
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

    // Store client access in session
    req.session.clientEventId = event._id.toString();

    res.json({
      ok: true,
      event: {
        _id: event._id,
        brideName: event.brideName,
        groomName: event.groomName,
        backgroundImage: event.backgroundImage,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET check client session (public — used to restore session on page refresh)
router.get('/access/check', async (req, res, next) => {
  try {
    if (!req.session || !req.session.clientEventId) {
      return res.status(401).json({ ok: false, message: 'No active session' });
    }

    const event = await ClientEvent.findById(req.session.clientEventId);
    if (!event || !event.isActive) {
      return res.status(401).json({ ok: false, message: 'Session expired' });
    }

    res.json({
      ok: true,
      event: {
        _id: event._id,
        brideName: event.brideName,
        groomName: event.groomName,
        backgroundImage: event.backgroundImage,
      },
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
      event: {
        _id: event._id,
        brideName: event.brideName,
        groomName: event.groomName,
        backgroundImage: event.backgroundImage,
      },
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

    const images = await ClientEventImage.find(filter).sort({ uploadedAt: -1 });
    res.json({ ok: true, images });
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
    });

    if (!image) {
      return res.status(404).json({ ok: false, message: 'Image not found in this folder' });
    }

    event.folderCovers = event.folderCovers || {};
    event.folderCovers[req.params.folderKey] = image._id;
    event.markModified('folderCovers');
    await event.save();

    res.json({
      ok: true,
      coverImageId: image._id.toString(),
      coverImage: image.medium || image.url,
    });
  } catch (err) {
    next(err);
  }
});

// POST upload images to an event with folder key (admin)
router.post('/:id/images', requireAdminAuth, upload.array('images'), async (req, res, next) => {
  try {
    const event = await ClientEvent.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ ok: false, message: 'Event not found' });
    }

    const { folderKey } = req.body;
    if (!folderKey) {
      return res.status(400).json({ ok: false, message: 'Folder key is required' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ ok: false, message: 'No image files provided' });
    }

    const invalidFile = req.files.find(f => !allowedExtensions.images.includes(f.mimetype));
    if (invalidFile) {
      return res.status(400).json({ ok: false, message: `Invalid file type: ${invalidFile.originalname}` });
    }

    const eventFolder = `client-event-${event._id}`;
    const savedImages = [];
    const total = req.files.length;

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const uniqueFilename = generateUniqueFilename(file.originalname);
      const url = saveGalleryFile(file.buffer, uniqueFilename, eventFolder);

      const image = await ClientEventImage.create({
        eventId: event._id,
        filename: uniqueFilename,
        originalName: file.originalname,
        url,
        size: file.size,
        folderKey,
      });

      savedImages.push(image);

      broadcast({
        type: 'client-event-upload-progress',
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
          type: 'client-event-upload-progress',
          eventId: event._id.toString(),
          filename: file.originalname,
          step,
          current: i + 1,
          total,
        });
      };

      processImage(localDiskPath, baseName, outputDir, onProgress)
        .then(({ thumbnail, medium, hero }) =>
          ClientEventImage.updateOne({ _id: image._id }, { $set: { thumbnail, medium, hero } })
        )
        .then(() => {
          broadcast({
            type: 'client-event-upload-progress',
            eventId: event._id.toString(),
            filename: file.originalname,
            step: 'complete',
            current: i + 1,
            total,
          });
        })
        .catch(err => logger.error('[ClientEvent] Background processing error:', err));
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

    const filesToDelete = [path.join('.', image.url)];
    if (image.thumbnail) filesToDelete.push(path.join('.', image.thumbnail));
    if (image.medium) filesToDelete.push(path.join('.', image.medium));
    if (image.hero) filesToDelete.push(path.join('.', image.hero));

    for (const f of filesToDelete) {
      await fs.unlink(f).catch(() => {});
    }

    await ClientEventImage.deleteOne({ _id: image._id });
    res.json({ ok: true, message: 'Image deleted' });
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

    for (const img of images) {
      const filesToDelete = [path.join('.', img.url)];
      if (img.thumbnail) filesToDelete.push(path.join('.', img.thumbnail));
      if (img.medium) filesToDelete.push(path.join('.', img.medium));
      if (img.hero) filesToDelete.push(path.join('.', img.hero));
      for (const f of filesToDelete) {
        await fs.unlink(f).catch(() => {});
      }
    }

    await ClientEventImage.deleteMany({
      eventId: req.params.eventId,
      folderKey: req.params.folderKey,
    });

    res.json({ ok: true, message: `Folder "${req.params.folderKey}" and all its images deleted` });
  } catch (err) {
    next(err);
  }
});

export default router;
