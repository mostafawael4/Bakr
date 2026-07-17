import { Router } from 'express';
import Feedback from '../models/Feedback.js';
import { requireAdminAuth } from '../middleware/auth.js';

const router = Router();

// GET all feedbacks — newest first
// If admin is logged in, return all. Otherwise, only return approved or legacy (no status) feedbacks.
router.get('/', async (req, res, next) => {
  try {
    const isAdmin = !!(req.session && req.session.adminId);
    const query = isAdmin
      ? {}
      : {
          $or: [
            { status: 'approved' },
            { status: { $exists: false } },
          ],
        };
    const feedbacks = await Feedback.find(query).sort({ createdAt: -1 }).lean();
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

// PATCH update feedback status (admin only)
router.patch('/:id/status', requireAdminAuth, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ ok: false, message: 'Invalid status' });
    }

    const feedback = await Feedback.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!feedback) {
      return res.status(404).json({ ok: false, message: 'Feedback not found' });
    }

    res.json({ ok: true, feedback });
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
