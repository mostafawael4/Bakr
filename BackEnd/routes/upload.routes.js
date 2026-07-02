import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAdminAuth } from '../middleware/auth.js';
import { getPresignedUploadUrl } from '../services/b2.service.js';
import logger from '../utils/logger.js';

const router = Router();

// Helper to sanitize and generate unique B2 keys
function generateUniqueB2Key(folder, originalName) {
  const sanitized = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uniqueName = `${Date.now()}-${uuidv4()}-${sanitized}`;
  
  // Ensure we don't have leading/trailing slashes in folder structure
  const cleanFolder = folder.replace(/^\/+|\/+$/g, '');
  return `${cleanFolder}/${uniqueName}`;
}

/**
 * POST /api/uploads/presign
 * Request body: { files: [{ filename: string, contentType: string, folder: string }] }
 * Returns: { ok: true, urls: [{ filename, key, uploadUrl }] }
 */
router.post('/presign', requireAdminAuth, async (req, res, next) => {
  try {
    const { files } = req.body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ ok: false, message: 'Invalid or empty files array' });
    }

    const urls = [];

    for (const file of files) {
      const { filename, contentType, folder } = file;

      if (!filename || !contentType || !folder) {
        return res.status(400).json({ 
          ok: false, 
          message: 'Each file must contain filename, contentType, and folder parameters' 
        });
      }

      // Generate a unique B2 storage key
      const key = generateUniqueB2Key(folder, filename);

      // Generate presigned PUT URL (valid for 1 hour)
      const uploadUrl = await getPresignedUploadUrl(key, contentType, 3600);

      urls.push({
        filename,
        key,
        uploadUrl,
      });
    }

    res.json({ ok: true, urls });
  } catch (err) {
    logger.error('[UploadRoutes] Error generating presigned upload URLs:', err);
    next(err);
  }
});

export default router;
