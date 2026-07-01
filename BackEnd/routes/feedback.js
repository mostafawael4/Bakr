import { Router } from 'express';
import Feedback from '../models/Feedback.js';
import { requireAdminAuth } from '../middleware/auth.js';

const router = Router();

// GET all feedbacks (public) — newest first
router.get('/', async (req, res, next) => {
  try {
    const feedbacks = await Feedback.find().sort({ createdAt: -1 }).lean();
    res.json({ ok: true, feedbacks });
  } catch (err) {
    next(err);
  }
});

// POST create feedback (public — any client)
router.post('/', async (req, res, next) => {
  try {
    const { name, email, rating, message } = req.body;

    if (!name || !rating || !message) {
      return res.status(400).json({ ok: false, message: 'Name, rating, and message are required' });
    }

    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({ ok: false, message: 'Rating must be between 1 and 5' });
    }

    if (message.length > 1000) {
      return res.status(400).json({ ok: false, message: 'Message must be 1000 characters or less' });
    }

    const feedback = await Feedback.create({ name, email, rating, message });
    res.status(201).json({ ok: true, feedback });
  } catch (err) {
    next(err);
  }
});

// DELETE feedback (admin only)
router.delete('/:id', requireAdminAuth, async (req, res, next) => {
  try {
    const feedback = await Feedback.findByIdAndDelete(req.params.id);
    if (!feedback) {
      return res.status(404).json({ ok: false, message: 'Feedback not found' });
    }
    res.json({ ok: true, message: 'Feedback deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
