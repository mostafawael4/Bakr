import mongoose from 'mongoose';

const clientEventSchema = new mongoose.Schema({
  brideName: { type: String, required: true, trim: true },
  groomName: { type: String, required: true, trim: true },
  password: { type: String, required: true },
  backgroundImage: { type: String, default: null },
  backgroundThumbnail: { type: String, default: null },
  backgroundMedium: { type: String, default: null },
  backgroundHero: { type: String, default: null },
  heroFocalX: { type: Number, default: 50, min: 0, max: 100 },
  heroFocalY: { type: Number, default: 50, min: 0, max: 100 },
  isActive: { type: Boolean, default: true },
  folderCovers: { type: mongoose.Schema.Types.Mixed, default: {} },
  folderZips: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('ClientEvent', clientEventSchema);
