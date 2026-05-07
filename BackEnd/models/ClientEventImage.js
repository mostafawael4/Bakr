import mongoose from 'mongoose';

const clientEventImageSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientEvent', required: true },
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  url: { type: String, required: true },
  thumbnail: { type: String, default: null },
  medium: { type: String, default: null },
  hero: { type: String, default: null },
  size: { type: Number, default: 0 },
  folderKey: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
});

// Index for fast folder-based queries
clientEventImageSchema.index({ eventId: 1, folderKey: 1 });

export default mongoose.model('ClientEventImage', clientEventImageSchema);
