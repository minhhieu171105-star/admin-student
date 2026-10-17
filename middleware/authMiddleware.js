module.exports = function requireAdmin(req, res, next) {
  if (req.session.role !== 'admin') return res.redirect('/');
  next();
};
