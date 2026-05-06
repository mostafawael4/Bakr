import { Router } from 'express';
import authRouter from './auth.js';
import homeRouter from './home.js';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ ok: true, message: 'Server is running' });
});

router.use('/auth', authRouter);
router.use('/home', homeRouter);

export default router;
