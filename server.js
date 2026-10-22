const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { app, port } = require('./routes/adminRoutes');
const { client, initializeDatabase } = require('./config/db');

async function start() {
  await client.connect();
  await initializeDatabase();
  const server = app.listen(port, '0.0.0.0', () => {
    console.log('Admin Node.js listening on http://localhost:' + port);
  });
  server.on('error', error => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Không thể khởi động Admin: cổng ${port} đang được sử dụng. Dừng cửa sổ Node.js cũ hoặc đổi PORT trong .env.`);
    } else {
      console.error('Admin HTTP server failed:', error.message);
    }
    process.exit(1);
  });
}

start().catch(error => {
  console.error('Admin server startup failed:', error.message);
  process.exit(1);
});
