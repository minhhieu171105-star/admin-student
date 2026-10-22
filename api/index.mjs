import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const path = require('node:path');
const directory = path.dirname(fileURLToPath(import.meta.url));

require('dotenv').config({ path: path.join(directory, '..', '.env') });

const { app } = require('../routes/adminRoutes');

export default function handler(req, res) {
  return app(req, res);
}
