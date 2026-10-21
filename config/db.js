const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is missing from Admin/.env');

const client = new MongoClient(uri);
const databaseName = process.env.MONGODB_DATABASE || 'thi_truc_tuyen';
const db = () => client.db(databaseName);

async function initializeDatabase() {
  await db().collection('hoc_sinh').createIndex({ ten_dang_nhap: 1 }, { unique: true });
  await db().collection('ky_thi').createIndex({ danh_sach_hoc_sinh: 1, bat_dau_luc: -1 });
  await db().collection('bai_lam').updateMany({ lan_lam: { $exists: false } }, { $set: { lan_lam: 1 } });
  await db().collection('bai_lam').createIndex(
    { ma_ky_thi: 1, ten_dang_nhap_hoc_sinh: 1, lan_lam: 1 },
    { unique: true }
  );
  await db().collection('bo_tu_vung').createIndex({ tao_luc: -1 });
  await db().collection('bo_tu_vung').createIndex({ danh_sach_hoc_sinh: 1 });
  await db().collection('khoa_tao_tu_vung').createIndex({ tao_luc: 1 }, { expireAfterSeconds: 86400 });
  await db().collection('khoa_tao_ky_thi').createIndex({ tao_luc: 1 }, { expireAfterSeconds: 86400 });
}

module.exports = { client, db, databaseName, uri, initializeDatabase };