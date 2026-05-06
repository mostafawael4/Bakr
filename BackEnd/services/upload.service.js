import fs from 'fs/promises';
import { mkdirSync, writeFileSync } from 'fs';
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

export function saveHomeFile(buffer, filename) {
  const dir = path.join('uploads', 'home');
  mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  writeFileSync(filePath, buffer);
  return `/uploads/home/${filename}`;
  // TODO: Replace with B2 upload when ready
}

export function saveGalleryFile(buffer, filename, eventFolder) {
  const dir = path.join('uploads', 'gallery', eventFolder);
  mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  writeFileSync(filePath, buffer);
  return `/uploads/gallery/${eventFolder}/${filename}`;
  // TODO: Replace with B2 upload when ready
}

// TODO: Replace with B2 when ready

console.log('[UploadService] loaded');
