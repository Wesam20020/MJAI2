function adminOnly(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Admin access only'
    });
  }

  next();
}

module.exports = { adminOnly };