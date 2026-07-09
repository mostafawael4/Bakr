import { Router } from 'express';
import authRouter from './auth.js';
import homeRouter from './home.js';
import packageRouter from './package.js';
import galleryRouter from './gallery.js';
import clientEventRouter from './clientEvent.js';
import feedbackRouter from './feedback.js';
import uploadRouter from './upload.routes.js';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ ok: true, message: 'Server is running' });
});

router.use('/auth', authRouter);
router.use('/home', homeRouter);
router.use('/packages', packageRouter);
router.use('/gallery', galleryRouter);
router.use('/client-events', clientEventRouter);
router.use('/feedbacks', feedbackRouter);
router.use('/uploads', uploadRouter);

export default router;
