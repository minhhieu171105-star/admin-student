const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { app } = require('../routes/adminRoutes');

function handler(req, res) {
  return app(req, res);
}

module.exports = handler;
module.exports.default = handler;
