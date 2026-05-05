import { Router } from 'express';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import { requireAdminAuth } from '../middleware/auth.js';

const router = Router();

router.post('/setup', async (req, res, next) => {
  try {
    const existingUser = await User.findOne();
    if (existingUser) {
      return res.status(403).json({ ok: false, message: 'Setup already completed' });
    }

    const { email, password } = req.body;

    if (!email || !password || password.length < 8) {
      return res.status(400).json({ ok: false, message: 'Email required and password must be at least 8 characters' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ email, passwordHash });

    req.session.adminId = user._id;
    res.status(201).json({ ok: true, message: 'Admin created successfully', email: user.email });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ ok: false, message: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ ok: false, message: 'Invalid credentials' });
    }

    req.session.adminId = user._id;
    res.json({ ok: true, email: user.email, role: user.role });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireAdminAuth, (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.json({ ok: true, message: 'Logged out' });
  });
});

router.get('/me', requireAdminAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.session.adminId);
    if (!user) {
      return res.status(401).json({ ok: false, message: 'User not found' });
    }
    res.json({ ok: true, email: user.email, role: user.role });
  } catch (err) {
    next(err);
  }
});

export default router;
