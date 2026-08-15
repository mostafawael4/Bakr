import jwt from 'jsonwebtoken';
import Credentials from '../config/Credentials.js';

export function requireAdminAuth(req, res, next) {
  // 1. Check session cookie
  if (req.session && req.session.adminId) {
    return next();
  }

  // 2. Check JWT token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, Credentials.SESSION_SECRET || 'dev-secret-change-me');
      if (decoded && decoded.adminId) {
        req.adminId = decoded.adminId; // attach for later use if needed
        return next();
      }
    } catch (err) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
  }

  return res.status(401).json({ error: 'Unauthorized' });
}
