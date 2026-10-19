const { MongoClient } = require('mongodb');
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is missing from Admin/.env');
const client = new MongoClient(uri);
const databaseName = process.env.MONGODB_DATABASE || 'thi_truc_tuyen';
const db = () => client.db(databaseName);
async function initializeDatabase() {
  await db().collection('students').createIndex({ username: 1 }, { unique: true });
  await db().collection('tests').createIndex({ student_usernames: 1, starts_at: -1 });
  await db().collection('attempts').updateMany({ attempt_no: { $exists: false } }, { $set: { attempt_no: 1 } });
  try { await db().collection('attempts').dropIndex('test_id_1_student_username_1'); } catch (_) {}
  await db().collection('attempts').createIndex({ test_id: 1, student_username: 1, attempt_no: 1 }, { unique: true });
  await db().collection('vocab_sets').createIndex({ created_at: -1 });
  await db().collection('vocab_sets').createIndex({ student_usernames: 1 });
  await db().collection('vocab_creation_locks').createIndex({ created_at: 1 }, { expireAfterSeconds: 86400 });
  await db().collection('test_creation_locks').createIndex({ created_at: 1 }, { expireAfterSeconds: 86400 });
}

module.exports = { client, db, databaseName, uri, initializeDatabase };
