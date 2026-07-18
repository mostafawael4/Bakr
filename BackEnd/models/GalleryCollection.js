import mongoose from 'mongoose';

const galleryCollectionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  coverImage: { type: String, default: null },      // original key
  coverThumbnail: { type: String, default: null },  // thumbnail key
  coverMedium: { type: String, default: null },     // medium key
  coverHero: { type: String, default: null },       // hero key
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('GalleryCollection', galleryCollectionSchema);
