import { Router } from 'express';
import Package from '../models/Package.js';
import { requireAdminAuth } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const packages = await Package.find().sort({ order: 1 });
    res.json({ ok: true, packages });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const pkg = await Package.findById(req.params.id);
    if (!pkg) {
      return res.status(404).json({ ok: false, message: 'Package not found' });
    }
    res.json({ ok: true, package: pkg });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAdminAuth, async (req, res, next) => {
  try {
    const { name, hours, price, currency, description, photographers, includesMainPhotographer, includesFilmRoll, order } = req.body;

    if (!name || !hours || !price) {
      return res.status(400).json({ ok: false, message: 'Name, hours, and price are required' });
    }

    const pkg = await Package.create({
      name,
      hours,
      price,
      currency: currency || 'EGP',
      description: description || '',
      photographers: photographers || 1,
      includesMainPhotographer: includesMainPhotographer !== false,
      includesFilmRoll: includesFilmRoll === true,
      order: order || 0,
    });

    res.status(201).json({ ok: true, package: pkg });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireAdminAuth, async (req, res, next) => {
  try {
    const pkg = await Package.findById(req.params.id);
    if (!pkg) {
      return res.status(404).json({ ok: false, message: 'Package not found' });
    }

    const { name, hours, price, currency, description, photographers, includesMainPhotographer, includesFilmRoll, order } = req.body;

    if (name !== undefined) pkg.name = name;
    if (hours !== undefined) pkg.hours = hours;
    if (price !== undefined) pkg.price = price;
    if (currency !== undefined) pkg.currency = currency;
    if (description !== undefined) pkg.description = description;
    if (photographers !== undefined) pkg.photographers = photographers;
    if (includesMainPhotographer !== undefined) pkg.includesMainPhotographer = includesMainPhotographer;
    if (includesFilmRoll !== undefined) pkg.includesFilmRoll = includesFilmRoll;
    if (order !== undefined) pkg.order = order;

    await pkg.save();

    res.json({ ok: true, package: pkg });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAdminAuth, async (req, res, next) => {
  try {
    const pkg = await Package.findById(req.params.id);
    if (!pkg) {
      return res.status(404).json({ ok: false, message: 'Package not found' });
    }

    await Package.deleteOne({ _id: pkg._id });
    res.json({ ok: true, message: 'Package deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
