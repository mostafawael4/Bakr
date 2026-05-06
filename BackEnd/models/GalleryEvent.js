import mongoose from 'mongoose';

const galleryEventSchema = new mongoose.Schema({
  name: { type: String, required: true },
  coverImage: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('GalleryEvent', galleryEventSchema);
