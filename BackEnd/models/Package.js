import mongoose from 'mongoose';

const packageSchema = new mongoose.Schema({
  name: { type: String, required: true },
  hours: { type: Number, required: true },
  price: { type: Number, required: true },
  currency: { type: String, default: 'EGP' },
  description: { type: String, default: '' },
  photographers: { type: Number, default: 1 },
  includesMainPhotographer: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

packageSchema.pre('save', function () {
  this.updatedAt = new Date();
});

export default mongoose.model('Package', packageSchema);
