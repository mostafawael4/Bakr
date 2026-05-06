import mongoose from 'mongoose';

const galleryImageSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'GalleryEvent', required: true },
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  url: { type: String, required: true },
  thumbnail: { type: String, default: null },
  medium: { type: String, default: null },
  hero: { type: String, default: null },
  size: { type: Number, default: 0 },
  uploadedAt: { type: Date, default: Date.now },
});

export default mongoose.model('GalleryImage', galleryImageSchema);
