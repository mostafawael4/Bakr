import mongoose from 'mongoose';

const clientEventSchema = new mongoose.Schema({
  brideName: { type: String, required: true, trim: true },
  groomName: { type: String, required: true, trim: true },
  password: { type: String, required: true },
  backgroundImage: { type: String, default: null },
  isActive: { type: Boolean, default: true },
  folderCovers: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('ClientEvent', clientEventSchema);
