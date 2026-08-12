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

const IS_PUBLIC = !Credentials.B2_PRIVATE;

/**
 * Build the base URL for public file access.
 * Priority: CDN_URL (if user has a real CDN) > auto-derived from B2_ENDPOINT + B2_BUCKET_NAME.
 *
 * B2 public files are accessible at:
 *   https://s3.us-east-005.backblazeb2.com/Abo-Bakr/<key>
 * This is derived automatically from B2_ENDPOINT + B2_BUCKET_NAME.
 */
function buildPublicBase() {
  // 1. If user explicitly set CDN_URL (e.g. Cloudflare CDN), use that
  if (Credentials.CDN_URL) {
    return Credentials.CDN_URL.replace(/\/+$/, '');
  }
  // 2. Auto-derive from existing S3 endpoint + bucket name
  //    S3 path-style format: https://s3.us-east-005.backblazeb2.com/Abo-Bakr/<key>
  //    (NOT the native B2 /file/ format — that uses a different domain like f005.backblazeb2.com)
  if (Credentials.B2_ENDPOINT && Credentials.B2_BUCKET_NAME) {
    const endpoint = Credentials.B2_ENDPOINT.replace(/\/+$/, '');
    return `${endpoint}/${Credentials.B2_BUCKET_NAME}`;
  }
  return '';
}

const PUBLIC_BASE = buildPublicBase();

/**
 * Generate a presigned PUT URL for browser direct upload.
 * This works the same for both public and private buckets —
 * uploads always require authentication via presigned URLs.
 *
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
 * Resolve a B2 key to a local/legacy path if applicable.
 * Returns null if the key is a B2 key (not legacy).
 * @param {string} key
 * @returns {string|null}
 */
function resolveLegacyPath(key) {
  if (!key) return null;
  if (key.startsWith('/uploads/') || key.startsWith('uploads/')) {
    return key.startsWith('/') ? key : `/${key}`;
  }
  return null;
}

/**
 * Build a public URL for a given B2 key.
 * Fast, synchronous — no API calls needed.
 * @param {string} key - The B2 relative file key
 * @returns {string|null} The public URL
 */
export function getPublicUrl(key) {
  if (!key) return null;

  const legacy = resolveLegacyPath(key);
  if (legacy) return legacy;

  // If it's already an absolute URL, strip it back to a key first
  if (key.startsWith('http://') || key.startsWith('https://')) {
    const b2Key = urlToKey(key);
    return b2Key && PUBLIC_BASE ? `${PUBLIC_BASE}/${b2Key}` : null;
  }

  return PUBLIC_BASE ? `${PUBLIC_BASE}/${key}` : null;
}

/**
 * Resolve a file key to a readable URL.
 * - Public bucket → instant static URL (no API call, no expiry)
 * - Private bucket → generates a temporary signed GET URL
 * - Legacy local paths are returned as-is.
 *
 * @param {string} key - The B2 relative file key (or legacy local url)
 * @param {number} expiresIn - Expiration for private signed URLs in seconds (default 24 hours)
 * @returns {Promise<string>} The resolved absolute URL
 */
export async function getPresignedDownloadUrl(key, expiresIn = 86400) {
  if (!key) return null;

  const legacy = resolveLegacyPath(key);
  if (legacy) return legacy;

  // If it's already an absolute HTTP link, normalize it to a key first
  if (key.startsWith('http://') || key.startsWith('https://')) {
    const b2Key = urlToKey(key);
    return getPresignedDownloadUrl(b2Key, expiresIn);
  }

  // PUBLIC bucket — instant URL, no API overhead, no expiry
  if (IS_PUBLIC && PUBLIC_BASE) {
    return `${PUBLIC_BASE}/${key}`;
  }

  // PRIVATE bucket — generate a signed download URL
  try {
    const command = new GetObjectCommand({
      Bucket: Credentials.B2_BUCKET_NAME,
      Key: key,
    });
    return await getSignedUrl(s3, command, { expiresIn });
  } catch (err) {
    console.error(`[B2Service] Error signing URL for key ${key}:`, err);
    return null;
  }
}

/**
 * Resolve an array of image keys to URLs in bulk.
 * Optimised for public buckets — resolves everything synchronously (zero API calls).
 * @param {Array<{key: string, field: string}>} entries - Array of {key, field} pairs
 * @returns {Promise<Object>} Resolved {field: url} map
 */
export async function resolveImageUrls(entries) {
  const result = {};
  if (IS_PUBLIC && PUBLIC_BASE) {
    // Fast synchronous path — no API calls at all
    for (const { key, field } of entries) {
      if (!key) {
        result[field] = null;
      } else {
        const legacy = resolveLegacyPath(key);
        if (legacy) {
          result[field] = legacy;
        } else {
          // Normalize: if key is already a full URL, extract the clean key first
          const cleanKey = (key.startsWith('http://') || key.startsWith('https://')) ? urlToKey(key) : key;
          result[field] = `${PUBLIC_BASE}/${cleanKey}`;
        }
      }
    }
    return result;
  }
  // Private mode — parallel presign
  const promises = entries.map(async ({ key, field }) => {
    result[field] = await getPresignedDownloadUrl(key);
  });
  await Promise.all(promises);
  return result;
}

/**
 * Delete a file permanently from B2 (removing all versions and delete markers).
 * This works the same for both public and private buckets —
 * deletes always require authentication via the S3 API.
 *
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

/**
 * Extract the B2 key from any URL format (S3, friendly, CDN, etc).
 * @param {string} url - An absolute URL or relative key
 * @returns {string|null} The clean B2 key
 */
export function urlToKey(url) {
  if (!url) return null;

  // Strip query string first
  const cleanUrl = url.split('?')[0];

  // If it's a relative key, return it as-is
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('/')) {
    return cleanUrl;
  }

  // Match against CDN_URL if configured
  const cdnUrl = Credentials.CDN_URL;
  if (cdnUrl && cleanUrl.startsWith(cdnUrl)) {
    return cleanUrl.slice(cdnUrl.length).replace(/^\/+/, '');
  }

  // Match against OFFICIAL_CDN_URL if configured
  const officialCdnUrl = Credentials.OFFICIAL_CDN_URL;
  if (officialCdnUrl && cleanUrl.startsWith(officialCdnUrl)) {
    return cleanUrl.slice(officialCdnUrl.length).replace(/^\/+/, '');
  }

  // Match against PUBLIC_BASE (auto-derived)
  if (PUBLIC_BASE && cleanUrl.startsWith(PUBLIC_BASE)) {
    return cleanUrl.slice(PUBLIC_BASE.length).replace(/^\/+/, '');
  }

  // Match against S3 endpoint + bucket (path-style)
  const endpoint = Credentials.B2_ENDPOINT;
  const bucketName = Credentials.B2_BUCKET_NAME;
  if (endpoint && bucketName) {
    const s3Prefix = `${endpoint}/${bucketName}`;
    if (cleanUrl.startsWith(s3Prefix)) {
      return cleanUrl.slice(s3Prefix.length).replace(/^\/+/, '');
    }
  }

  // Fallback: match "/file/bucket_name/key" (B2 friendly URL format)
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

console.log(`[B2Service] Initialized (mode: ${IS_PUBLIC ? 'PUBLIC' : 'PRIVATE'}, base: ${PUBLIC_BASE || 'N/A'})`);
