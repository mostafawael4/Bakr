import { Router } from 'express';
import authRouter from './auth.js';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ ok: true, message: 'Server is running' });
});

router.use('/auth', authRouter);

export default router;
