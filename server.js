const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { app, port } = require('./routes/adminRoutes');
const { client, initializeDatabase } = require('./config/db');

async function start() {
  await client.connect();
  await initializeDatabase();
  app.listen(port, '0.0.0.0', () => {
    console.log('Admin Node.js listening on port ' + port);
  });
}

start().catch(error => {
  console.error('Admin server startup failed:', error.message);
  process.exit(1);
});
