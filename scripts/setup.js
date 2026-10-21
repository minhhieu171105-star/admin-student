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
    await db.collection('hoc_sinh').createIndex({ ten_dang_nhap: 1 }, { unique: true });
    await db.collection('hoc_sinh').createIndex({ ngay_sinh: 1, xoa_luc: 1 });
    await db.collection('quan_tri_vien').createIndex({ ten_dang_nhap: 1 }, { unique: true });
    await db.collection('ky_thi').createIndex({ danh_sach_hoc_sinh: 1, bat_dau_luc: -1 });
    await db.collection('bai_lam').updateMany({ lan_lam: { $exists: false } }, { $set: { lan_lam: 1 } });
    try { await db.collection('bai_lam').dropIndex('ma_ky_thi_1_ten_dang_nhap_hoc_sinh_1'); } catch (_) {}
    await db.collection('bai_lam').createIndex({ ma_ky_thi: 1, ten_dang_nhap_hoc_sinh: 1, lan_lam: 1 }, { unique: true });
    const ten_dang_nhap = process.env.ADMIN_USERNAME, password = process.env.ADMIN_PASSWORD;
    if (!ten_dang_nhap || !password) throw new Error('Set ADMIN_USERNAME and ADMIN_PASSWORD in Admin/.env before setup.');
    const admin = await db.collection('quan_tri_vien').findOne({ ten_dang_nhap });
    const fields = { ten_dang_nhap, ho_ten: process.env.ADMIN_NAME || 'Quan tri vien', mat_khau_ma_hoa: await bcrypt.hash(password, 12) };
    if (admin) await db.collection('quan_tri_vien').updateOne({ _id: admin._id }, { $set: fields });
    else await db.collection('quan_tri_vien').insertOne({ ...fields, tao_luc: Math.floor(Date.now()/1000) });
    console.log('MongoDB indexes ready. Existing account and exam documents were preserved.');
  } finally { await client.close(); }
})().catch(e => { console.error(e.message); process.exit(1); });
