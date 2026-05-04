import fs from 'fs/promises';
import { mkdirSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export function generateUniqueFilename(originalName) {
  const sanitized = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${Date.now()}-${uuidv4()}-${sanitized}`;
}

export async function saveFile(destPath, buffer) {
  const dir = path.dirname(destPath);
  mkdirSync(dir, { recursive: true });
  await fs.writeFile(destPath, buffer);
  return destPath;
}

// TODO: Replace with B2 when ready

console.log('[UploadService] loaded');
