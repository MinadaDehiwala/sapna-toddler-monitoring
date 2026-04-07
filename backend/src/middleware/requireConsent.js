const createError = require('http-errors');

function requireConsent(req, res, next) {
  if (!req.user?.parent?.hasAcceptedConsent) {
    return next(
      createError(
        403,
        'Parental consent is required before logging activities or generating reports.'
      )
    );
  }

  return next();
}

module.exports = { requireConsent };
