const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is required in .env');
const client = new MongoClient(uri);
(async () => {
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DATABASE || 'thi_truc_tuyen');
    await db.collection('students').createIndex({ username: 1 }, { unique: true });
    await db.collection('students').createIndex({ birth_date: 1, deleted_at: 1 });
    await db.collection('admins').createIndex({ username: 1 }, { unique: true });
    await db.collection('tests').createIndex({ student_usernames: 1, starts_at: -1 });
    await db.collection('attempts').updateMany({ attempt_no: { $exists: false } }, { $set: { attempt_no: 1 } });
    try { await db.collection('attempts').dropIndex('test_id_1_student_username_1'); } catch (_) {}
    await db.collection('attempts').createIndex({ test_id: 1, student_username: 1, attempt_no: 1 }, { unique: true });
    const username = process.env.ADMIN_USERNAME, password = process.env.ADMIN_PASSWORD;
    if (!username || !password) throw new Error('Set ADMIN_USERNAME and ADMIN_PASSWORD in Admin/.env before setup.');
    const admin = await db.collection('admins').findOne({ username });
    const fields = { username, full_name: process.env.ADMIN_NAME || 'Quan tri vien', password_hash: await bcrypt.hash(password, 12) };
    if (admin) await db.collection('admins').updateOne({ _id: admin._id }, { $set: fields });
    else await db.collection('admins').insertOne({ ...fields, created_at: Math.floor(Date.now()/1000) });
    console.log('MongoDB indexes ready. Existing account and exam documents were preserved.');
  } finally { await client.close(); }
})().catch(e => { console.error(e.message); process.exit(1); });
