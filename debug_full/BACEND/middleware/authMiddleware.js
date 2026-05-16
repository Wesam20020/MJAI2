const jwt = require('jsonwebtoken');
const db = require('../config/db');

function getUserById(userId) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT id, name, email, is_admin FROM users WHERE id = ? LIMIT 1',
      [Number(userId)],
      (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      }
    );
  });
}

async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access token is missing'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const decodedUserId = Number(decoded.id);

    if (!decodedUserId || Number.isNaN(decodedUserId)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token user'
      });
    }

    // Important after DB reset / moving project folders:
    // an old token from localStorage may still be cryptographically valid, but
    // the referenced user id may no longer exist in the current SQLite database.
    // Without this check, routes that insert rows with FOREIGN KEY(user_id)
    // fail with SQLITE_CONSTRAINT instead of cleanly logging the user out.
    const user = await getUserById(decodedUserId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Your session belongs to an old database. Please log in again.'
      });
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      is_admin: user.is_admin,
      isAdmin: Boolean(user.is_admin)
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
}

module.exports = { authenticateToken };
