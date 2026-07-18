import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectVersionsCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import Credentials from '../config/Credentials.js';

// Setup S3 Client for Backblaze B2
// forcePathStyle is REQUIRED for Backblaze B2 — without it, the SDK generates
// virtual-hosted-style URLs (bucket as subdomain) which B2 does not resolve correctly.
const s3 = new S3Client({
  endpoint: Credentials.B2_ENDPOINT,
  region: Credentials.B2_REGION || 'us-east-005',
  forcePathStyle: true,
  credentials: {
    accessKeyId: Credentials.B2_KEY_ID,
    secretAccessKey: Credentials.B2_APP_KEY,
  },
});

/**
 * Generate a presigned PUT URL for browser direct upload.
 * @param {string} key - The destination file path in B2 (e.g. 'gallery/event_id/filename.webp')
 * @param {string} contentType - The MIME type of the file
 * @param {number} expiresIn - Expiration in seconds (default 1 hour)
 * @returns {Promise<string>} The presigned upload URL
 */
export async function getPresignedUploadUrl(key, contentType = 'image/webp', expiresIn = 3600) {
  const command = new PutObjectCommand({
    Bucket: Credentials.B2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3, command, { expiresIn });
}

/**
 * Resolve a file key to a readable URL.
 * If private, generates a temporary signed GET URL.
 * If public, returns the static CDN URL.
 * Keeps local legacy paths untouched.
 * @param {string} key - The B2 relative file key (or legacy local url)
 * @param {number} expiresIn - Expiration for private signed URLs in seconds (default 24 hours)
 * @returns {Promise<string>} The resolved absolute URL
 */
export async function getPresignedDownloadUrl(key, expiresIn = 86400) {
  if (!key) return null;

  // Support legacy local uploads
  if (key.startsWith('/uploads/') || key.startsWith('uploads/')) {
    return key.startsWith('/') ? key : `/${key}`;
  }

  // If it's already an absolute HTTP link, it might be resolved.
  if (key.startsWith('http://') || key.startsWith('https://')) {
    // If it's a B2 URL, we should strip any old signature and re-sign or static-link it.
    const b2Key = urlToKey(key);
    return getPresignedDownloadUrl(b2Key, expiresIn);
  }

  // If the bucket is set to public, just return the static CDN URL
  if (!Credentials.B2_PRIVATE) {
    return `${Credentials.CDN_URL}/${key}`;
  }

  // Otherwise, generate a signed download URL
  try {
    const command = new GetObjectCommand({
      Bucket: Credentials.B2_BUCKET_NAME,
      Key: key,
    });
    return await getSignedUrl(s3, command, { expiresIn });
  } catch (err) {
    console.error(`[B2Service] Error signing URL for key ${key}:`, err);
    // Only fall back to CDN URL if one is configured — otherwise return null
    // to prevent broken relative paths being served to the frontend.
    if (Credentials.CDN_URL) {
      return `${Credentials.CDN_URL}/${key}`;
    }
    return null;
  }
}

/**
 * Delete a file permanently from B2 (removing all versions and delete markers).
 * @param {string} key - B2 relative file key
 */
export async function deleteFromB2(key) {
  if (!key) return;

  // Ignore local files
  if (key.startsWith('/uploads/') || key.startsWith('uploads/')) {
    return;
  }

  const cleanKey = urlToKey(key);

  try {
    // 1. List all versions and delete markers for this specific key
    const listCommand = new ListObjectVersionsCommand({
      Bucket: Credentials.B2_BUCKET_NAME,
      Prefix: cleanKey,
    });
    
    const versionsRes = await s3.send(listCommand);
    const deleteObjects = [];

    if (versionsRes.Versions) {
      for (const v of versionsRes.Versions) {
        if (v.Key === cleanKey) {
          deleteObjects.push({ Key: v.Key, VersionId: v.VersionId });
        }
      }
    }

    if (versionsRes.DeleteMarkers) {
      for (const dm of versionsRes.DeleteMarkers) {
        if (dm.Key === cleanKey) {
          deleteObjects.push({ Key: dm.Key, VersionId: dm.VersionId });
        }
      }
    }

    // 2. If versions or delete markers exist, delete all of them permanently
    if (deleteObjects.length > 0) {
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: Credentials.B2_BUCKET_NAME,
        Delete: {
          Objects: deleteObjects,
          Quiet: true,
        },
      });
      await s3.send(deleteCommand);
      console.log(`[B2Service] Permanently deleted key (all versions): ${cleanKey}`);
    } else {
      // Fallback: regular delete if no version history was found
      const fallbackCommand = new DeleteObjectCommand({
        Bucket: Credentials.B2_BUCKET_NAME,
        Key: cleanKey,
      });
      await s3.send(fallbackCommand);
      console.log(`[B2Service] Deleted key (fallback): ${cleanKey}`);
    }
  } catch (err) {
    console.error(`[B2Service] Error deleting key ${cleanKey} from B2:`, err.message);
  }
}

export function urlToKey(url) {
  if (!url) return null;

  // Strip query string first
  const cleanUrl = url.split('?')[0];

  // If it's a relative key, return it as-is
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('/')) {
    return cleanUrl;
  }

  const cdnUrl = Credentials.CDN_URL;
  if (cdnUrl && cleanUrl.startsWith(cdnUrl)) {
    return cleanUrl.slice(cdnUrl.length).replace(/^\/+/, '');
  }

  const officialCdnUrl = Credentials.OFFICIAL_CDN_URL;
  if (officialCdnUrl && cleanUrl.startsWith(officialCdnUrl)) {
    return cleanUrl.slice(officialCdnUrl.length).replace(/^\/+/, '');
  }

  const endpoint = Credentials.B2_ENDPOINT;
  const bucketName = Credentials.B2_BUCKET_NAME;
  if (endpoint && bucketName) {
    const s3Prefix = `${endpoint}/${bucketName}`;
    if (cleanUrl.startsWith(s3Prefix)) {
      return cleanUrl.slice(s3Prefix.length).replace(/^\/+/, '');
    }
  }

  // Fallback: match "/file/bucket_name/key"
  const match = cleanUrl.match(/\/file\/[^/]+\/(.+)/);
  if (match) return match[1];

  try {
    const parsed = new URL(cleanUrl);
    let path = parsed.pathname.replace(/^\/+/, '');
    if (bucketName && path.startsWith(bucketName + '/')) {
      path = path.slice(bucketName.length + 1);
    }
    return path;
  } catch (e) {
    return cleanUrl;
  }
}

console.log('[B2Service] Initialized');
