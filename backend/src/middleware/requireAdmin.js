const createError = require('http-errors');

function requireAdmin(req, res, next) {
  if (req.user?.parent?.role !== 'admin') {
    return next(createError(403, 'Admin access is required.'));
  }

  return next();
}

module.exports = { requireAdmin };
