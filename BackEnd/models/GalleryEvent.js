import mongoose from 'mongoose';

const galleryEventSchema = new mongoose.Schema({
  collectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'GalleryCollection', required: true },
  name: { type: String, required: true },
  coverImage: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('GalleryEvent', galleryEventSchema);
