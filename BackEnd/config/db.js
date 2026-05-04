import mongoose from 'mongoose';
import Credentials from './Credentials.js';

mongoose.set('strictQuery', false);

export default async function connectDB() {
  try {
    await mongoose.connect(Credentials.MONGO_URI);
    console.log('[MongoDB] Connected successfully');
  } catch (err) {
    console.error('[MongoDB] Connection error:', err.message);
    throw err;
  }
}
