const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const multer = require('multer');
const ExcelJS = require('exceljs');
const bcrypt = require('bcryptjs');
const { db, uri, databaseName } = require('../config/db');
const requireAdmin = require('../middleware/authMiddleware');
const { loginPage, renderAdmin } = require('../controllers/adminDashboardView');
const path = require('path');

const app = express();
const port = Number(process.env.PORT || 8002);
const dbName = databaseName;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });
const uploads = upload.fields([{ name: 'sheet', maxCount: 1 }, { name: 'students_sheet', maxCount: 1 }, { name: 'vocab_sheet', maxCount: 1 }]);

function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin'
  });
  next();
}

function actionErrorMessage(error, view) {
  const message = String(error?.message || '');
  if (/^(File đề có |Không thể đọc tệp|Tệp đề |Tệp Excel |Tệp danh sách học sinh )/i.test(message)) return message;
  if (error?.code === 'LIMIT_FILE_SIZE') return 'Tệp tải lên vượt quá 12 MB. Hãy chọn tệp Excel nhỏ hơn.';
  if (/mongo|querysrv|econn|authentication|server selection/i.test(message)) {
    return 'Không kết nối được MongoDB Atlas. Kiểm tra MONGODB_URI, quyền Database Access và Network Access.';
  }
  return view === 'exams'
    ? 'Không thể tạo kỳ thi. Kiểm tra dữ liệu nhập, tệp Excel và kết nối MongoDB.'
    : 'Không thể hoàn thành thao tác. Kiểm tra dữ liệu và kết nối MongoDB.';
}

app.disable('x-powered-by');
app.use(securityHeaders);
app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h', etag: true }));
app.use(session({ name: 'ADMINSESSID', secret: process.env.SESSION_SECRET || require('crypto').randomBytes(32).toString('hex'), resave: false, saveUninitialized: false, rolling: true, unset: 'destroy', store: MongoStore.create({ mongoUrl: uri, dbName, collectionName: 'phien_quan_tri' }), cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.APP_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 } }));
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

function dateValue(v) {
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  const s = String(v || '').trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(4)}-${s.slice(2,4)}-${s.slice(0,2)}`;
  const parts = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (parts) {
    const [, day, month, year] = parts;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day)
      ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      : '';
  }
  const d = new Date(s);
  return Number.isNaN(+d) ? '' : d.toISOString().slice(0, 10);
}
function excelText(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('').trim();
    if (value.text != null) return String(value.text).trim();
    if (value.result != null) return excelText(value.result);
  }
  return String(value).trim();
}
function studentValues(row, fromExcel = false) {
  const nameIndex = fromExcel ? 1 : 0;
  const birthIndex = fromExcel ? 2 : 1;
  return {
    ten_dang_nhap: excelText(row[nameIndex]),
    birth: dateValue(row[birthIndex])
  };
}
function excelLoadError(buffer, label, cause) {
  const signature = Buffer.isBuffer(buffer) ? buffer.subarray(0, 8).toString('hex').toUpperCase() : '';
  const preview = Buffer.isBuffer(buffer) ? buffer.subarray(0, 160).toString('utf8').trim().toLowerCase() : '';
  console.error(`Cannot read ${label} Excel:`, cause?.message || cause);
  if (signature.startsWith('D0CF11E0')) {
    return new Error(`${label} đang là định dạng Excel cũ .xls. Mở tệp bằng Excel, chọn Save As → Excel Workbook (*.xlsx), rồi tải lại.`);
  }
  if (preview.startsWith('<!doctype') || preview.startsWith('<html') || preview.includes('<table')) {
    return new Error(`${label} là tệp HTML được đổi tên thành Excel. Hãy mở bằng Excel và lưu lại dưới dạng Excel Workbook (*.xlsx).`);
  }
  if (preview.includes(',') || preview.includes(';')) {
    return new Error(`${label} có vẻ là CSV. Hãy mở tệp bằng Excel và lưu lại dưới dạng Excel Workbook (*.xlsx).`);
  }
  return new Error(`Không thể đọc ${label.toLowerCase()}. Hãy mở tệp bằng Excel, chọn Save As → Excel Workbook (*.xlsx), rồi tải lại.`);
}
function parseQuestionRows(rows) {
  const danh_sach_cau_hoi = [], invalidRows = [];
  for (const { rowNumber, values } of rows) {
    const stt = excelText(values[0]), question = excelText(values[1]);
    const options = [2, 3, 4, 5].map(index => excelText(values[index]));
    const keyText = excelText(values[6]).toUpperCase().replace(/^ĐÁP\s*ÁN\s*[:\-]?\s*/, '');
    const key = (keyText.match(/^([ABCD])(?:[.\s)]|$)/) || [])[1] || '';
    // Cột A là STT. Chỉ mỗi hàng có STT từ A2 trở đi mới được tính là một câu hỏi.
    if (!stt) continue;
    const problems = [];
    if (!question) problems.push('thiếu câu hỏi ở cột B');
    if (options.some(option => !option)) problems.push('thiếu đáp án ở cột C–F');
    if (!key) problems.push('đáp án đúng ở cột G phải là A, B, C hoặc D');
    if (problems.length) { invalidRows.push(`dòng ${rowNumber} (STT ${stt}): ${problems.join(', ')}`); continue; }
    danh_sach_cau_hoi.push({ cau_hoi: question, lua_chon: options, dap_an_dung: key, diem_so: null });
  }
  if (invalidRows.length) throw new Error(`File đề có ${invalidRows.length} dòng không hợp lệ: ${invalidRows.slice(0, 3).join('; ')}${invalidRows.length > 3 ? '…' : ''}`);
  return danh_sach_cau_hoi;
}
async function readExcelRows(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (error) {
    throw excelLoadError(buffer, 'Tệp danh sách học sinh', error);
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Tệp Excel không có trang tính nào.');
  // Hàng 1 là tiêu đề: STT, Câu hỏi, đáp án A–D, Đáp án đúng.
  // Dữ liệu luôn bắt đầu từ hàng 2; giữ cột A là STT nhưng không dùng nó để chấm/đảo câu.
  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    rows.push(Array.from({ length: 7 }, (_, index) => row.getCell(index + 1).value));
  }
  return rows;
}
async function readExamRows(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (error) {
    throw excelLoadError(buffer, 'Tệp đề', error);
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Tệp đề không có trang tính nào.');
  const rows = [];
  // A1 là tiêu đề. A2 đến hết cột A là các câu hỏi được tính.
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    rows.push({ rowNumber, values: Array.from({ length: 7 }, (_, index) => row.getCell(index + 1).value) });
  }
  return rows;
}
async function readVocabRows(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (error) {
    throw excelLoadError(buffer, 'Tệp từ vựng', error);
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Tệp Excel không có trang tính nào.');
  const rows = [];
  // Cột A: STT, B: Từ vựng, C: Phiên âm, D: Tiếng Việt (Nghĩa)
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    rows.push({ rowNumber, values: Array.from({ length: 4 }, (_, index) => row.getCell(index + 1).value) });
  }
  return rows;
}
function parseVocabRows(rows) {
  const tu_vung = [], invalidRows = [];
  for (const { rowNumber, values } of rows) {
    const stt = excelText(values[0]);
    const word = excelText(values[1]);
    const phonetic = excelText(values[2]);
    const meaning = excelText(values[3]);

    if (!stt && !word && !meaning) continue;

    const problems = [];
    if (!word) problems.push('thiếu từ vựng ở cột B');
    if (!meaning) problems.push('thiếu nghĩa tiếng Việt ở cột D');

    if (problems.length) {
      invalidRows.push(`dòng ${rowNumber}: ${problems.join(', ')}`);
      continue;
    }

    tu_vung.push({
      stt: stt || String(tu_vung.length + 1),
      tu: word,
      phien_am: phonetic || '',
      nghia: meaning
    });
  }
  if (invalidRows.length) {
    throw new Error(`File từ vựng có ${invalidRows.length} dòng không hợp lệ: ${invalidRows.slice(0, 3).join('; ')}${invalidRows.length > 3 ? '…' : ''}`);
  }
  return tu_vung;
}
app.get('/', async (req, res, next) => {
  if (req.session.role === 'admin') return res.redirect('/admin');
  res.send(loginPage());
});
app.post('/login', async (req, res, next) => {
  try {
    const admin = await db().collection('quan_tri_vien').findOne({ ten_dang_nhap: String(req.body.ten_dang_nhap || '').trim() });
    if (!admin || !await bcrypt.compare(String(req.body.password || ''), admin.mat_khau_ma_hoa || '')) return res.status(401).send(loginPage('Tên đăng nhập hoặc mật khẩu chưa chính xác.'));
    req.session.regenerate(err => { if (err) return next(err); req.session.role = 'admin'; req.session.name = admin.ho_ten || admin.hoten || admin.ten_dang_nhap; req.session.save(() => res.redirect('/admin')); });
  } catch (e) { next(e); }
});
// Login form posts to /login; keep all state changes POST-only.
app.get('/admin', requireAdmin, async (req, res, next) => {
  try {
    const students = await db().collection('hoc_sinh').find({}).sort({ ho_ten: 1 }).toArray();
    const tests = await db().collection('ky_thi').find({}).sort({ bat_dau_luc: -1 }).toArray();
    const ids = tests.map(t => String(t._id));
    const attempts = ids.length ? await db().collection('bai_lam').find({ ma_ky_thi: { $in: ids } }).sort({ lan_lam: -1 }).toArray() : [];
    const byKey = new Map();
    for (const a of attempts) { const key = `${a.ma_ky_thi}|${a.ten_dang_nhap_hoc_sinh}`; const x = byKey.get(key) || { latest: a, count: 0 }; x.count++; byKey.set(key, x); }
    const progress = tests.flatMap(t => (t.danh_sach_hoc_sinh || []).map(ten_dang_nhap => {
      const student = students.find(s => s.ten_dang_nhap === ten_dang_nhap); if (!student) return null;
      const rec = byKey.get(`${t._id}|${ten_dang_nhap}`); const a = rec?.latest;
      return { ma_ky_thi: String(t._id), test: t.tieu_de, ten_dang_nhap, name: student.ho_ten || student.ten_dang_nhap, status: !a ? 'Chưa bắt đầu' : a.nop_luc ? 'Đã nộp' : 'Đang làm', diem: a?.diem ?? '—', attempt_count: rec?.count || 0, so_luot_lam_toi_da: t.so_luot_lam_toi_da ?? 1, so_lan_roi_trang: a?.so_lan_roi_trang || 0 };
    }).filter(Boolean));
    if (req.body?.progress_refresh) return res.json({ rows: progress });
    const active = students.filter(s => s.xoa_luc == null), trash = students.filter(s => s.xoa_luc != null);
    const vocabSets = await db().collection('bo_tu_vung').find({}).sort({ tao_luc: -1 }).toArray();
    res.send(renderAdmin({
      name: req.session.name,
      students: active,
      trash,
      tests,
      progress,
      vocabSets,
      selectedVocabId: String(req.query.vocab_id || ''),
      view: req.query.view || 'accounts',
      selectedTestId: String(req.query.ma_ky_thi || ''),
      message: req.query.message || '',
      error: req.query.error || ''
    }));
  } catch (e) { next(e); }
});
app.post('/admin/progress', requireAdmin, async (req, res, next) => {
  try {
    const c = db(), [students, tests] = await Promise.all([c.collection('hoc_sinh').find({}).toArray(), c.collection('ky_thi').find({}).toArray()]);
    const ids = tests.map(t => String(t._id));
    const attempts = ids.length ? await c.collection('bai_lam').find({ ma_ky_thi: { $in: ids } }).sort({ lan_lam: -1 }).toArray() : [];
    const byKey = new Map(); for (const a of attempts) { const k = `${a.ma_ky_thi}|${a.ten_dang_nhap_hoc_sinh}`, x = byKey.get(k) || { latest: a, count: 0 }; x.count++; byKey.set(k, x); }
    const rows = tests.flatMap(t => (t.danh_sach_hoc_sinh || []).map(ten_dang_nhap => { const s = students.find(x => x.ten_dang_nhap === ten_dang_nhap); if (!s) return null; const rec = byKey.get(`${t._id}|${ten_dang_nhap}`), a = rec?.latest; return { ma_ky_thi: String(t._id), test: t.tieu_de, ten_dang_nhap, name: s.ho_ten || ten_dang_nhap, status: !a ? 'Chưa bắt đầu' : a.nop_luc ? 'Đã nộp' : 'Đang làm', attempt_count: rec?.count || 0, so_luot_lam_toi_da: t.so_luot_lam_toi_da ?? 1, diem: a?.diem ?? '—', so_lan_roi_trang: a?.so_lan_roi_trang || 0 }; }).filter(Boolean));
    res.json({ rows });
  } catch (e) { next(e); }
});
app.post('/admin/action', requireAdmin, uploads, async (req, res, next) => {
  const c = db(), b = req.body, go = (message, error = false, view = b.view || 'accounts') => res.redirect(`/admin?view=${encodeURIComponent(view)}&${error ? 'error' : 'message'}=${encodeURIComponent(message)}`);
  try {
    if (b.action === 'logout') return req.session.destroy(() => {
      res.clearCookie('ADMINSESSID');
      res.redirect('/');
    });
    if (b.action === 'student_manual' || b.action === 'students') {
      let rows = [];
      const assignedTestId = String(b.ma_ky_thi || '').trim();
      if (b.action === 'student_manual') rows = [[b.ho_ten, b.ngay_sinh]];
      else { const studentFile = req.files?.sheet?.[0]; if (!studentFile) return go('Hãy chọn file Excel .xlsx.', true, 'import-accounts'); rows = await readExcelRows(studentFile.buffer); }
      let count = 0;
      const createdUsernames = [];
      for (const row of rows) {
        const { ten_dang_nhap, birth } = studentValues(row, b.action === 'students'); if (!ten_dang_nhap || !birth) continue;
        await c.collection('hoc_sinh').updateOne({ ten_dang_nhap }, { $set: { ten_dang_nhap, ho_ten: ten_dang_nhap, ngay_sinh: birth }, $unset: { xoa_luc: '' } }, { upsert: true });
        createdUsernames.push(ten_dang_nhap);
        count++;
      }
      if (assignedTestId) {
        const { ObjectId } = require('mongodb');
        const filter = assignedTestId === 'all'
          ? { ket_thuc_luc: { $gt: Math.floor(Date.now() / 1000) } }
          : { _id: ObjectId.isValid(assignedTestId) ? new ObjectId(assignedTestId) : assignedTestId };
        await c.collection('ky_thi').updateMany(filter, { $addToSet: { danh_sach_hoc_sinh: { $each: createdUsernames } } });
      }
      const savedMessage = `${count} tài khoản đã được lưu${assignedTestId ? ' và gán vào môn thi thành công' : ''}.`;
      if (b.ma_ky_thi_quay_lai) {
        const query = new URLSearchParams({ view: 'accounts', ma_ky_thi: String(b.ma_ky_thi_quay_lai), message: savedMessage });
        return res.redirect(`/admin?${query.toString()}`);
      }
      return go(savedMessage, false, b.view || (b.action === 'students' ? 'import-accounts' : 'add-account'));
    }
    if (b.action === 'assign_subject') {
      const { ObjectId } = require('mongodb');
      const testId = String(b.ma_ky_thi || '').trim();
      const selectedUsernames = (Array.isArray(b.ten_dang_nhap_hoc_sinh) ? b.ten_dang_nhap_hoc_sinh : [b.ten_dang_nhap_hoc_sinh])
        .map(value => String(value || '').trim()).filter(Boolean);
      if (!testId) return go('Hãy chọn môn thi cần gán.', true, 'accounts');
      const filter = testId === 'all'
        ? { ket_thuc_luc: { $gt: Math.floor(Date.now() / 1000) } }
        : { _id: ObjectId.isValid(testId) ? new ObjectId(testId) : testId };
      if (selectedUsernames.includes('__ALL__')) {
        const allUsernames = await c.collection('hoc_sinh').distinct('ten_dang_nhap', { xoa_luc: { $exists: false } });
        await c.collection('ky_thi').updateMany(filter, { $addToSet: { danh_sach_hoc_sinh: { $each: allUsernames } } });
        return go(`Đã gán TẤT CẢ ${allUsernames.length} học sinh vào môn thi được chọn.`, false, 'accounts');
      }
      if (!selectedUsernames.length) return go('Hãy chọn ít nhất một học sinh.', true, 'accounts');
      await c.collection('ky_thi').updateMany(filter, { $addToSet: { danh_sach_hoc_sinh: { $each: selectedUsernames } } });
      if (b.ma_ky_thi_quay_lai) return res.redirect(`/admin?${new URLSearchParams({ view: 'accounts', ma_ky_thi: String(b.ma_ky_thi_quay_lai), message: `Đã thêm ${selectedUsernames.length} học sinh vào môn.` }).toString()}`);
      return go(`Đã gán ${selectedUsernames.length} học sinh vào môn thi.`, false, 'accounts');
    }
    if (b.action === 'student_trash') { await c.collection('hoc_sinh').updateOne({ ten_dang_nhap: b.ten_dang_nhap, xoa_luc: { $exists: false } }, { $set: { xoa_luc: Math.floor(Date.now()/1000) } }); return go('Đã chuyển tài khoản vào thùng rác.'); }
    if (b.action === 'student_restore') { await c.collection('hoc_sinh').updateOne({ ten_dang_nhap: b.ten_dang_nhap }, { $unset: { xoa_luc: '' } }); await c.collection('ky_thi').updateMany({ ket_thuc_luc: { $gt: Math.floor(Date.now()/1000) } }, { $addToSet: { danh_sach_hoc_sinh: b.ten_dang_nhap } }); return go('Đã khôi phục tài khoản.', false, 'trash'); }
    if (b.action === 'subject_students_remove_all') {
      const { ObjectId } = require('mongodb'), testId = String(b.ma_ky_thi || '');
      if (!ObjectId.isValid(testId)) return go('Mã môn thi không hợp lệ.', true, 'accounts');
      await c.collection('ky_thi').updateOne({ _id: new ObjectId(testId) }, { $set: { danh_sach_hoc_sinh: [] } });
      const result = await c.collection('bai_lam').deleteMany({ ma_ky_thi: testId });
      return res.redirect(`/admin?${new URLSearchParams({ view: 'accounts', ma_ky_thi: testId, message: `Đã xóa toàn bộ học sinh khỏi môn và ${result.deletedCount} lượt làm liên quan.` }).toString()}`);
    }
    if (b.action === 'subject_student_remove') {
      const { ObjectId } = require('mongodb'), testId = String(b.ma_ky_thi || ''), ten_dang_nhap = String(b.ten_dang_nhap || '');
      if (!ObjectId.isValid(testId) || !ten_dang_nhap) return go('Thiếu thông tin học sinh hoặc môn thi.', true, 'accounts');
      await c.collection('ky_thi').updateOne({ _id: new ObjectId(testId) }, { $pull: { danh_sach_hoc_sinh: ten_dang_nhap } });
      await c.collection('bai_lam').deleteMany({ ma_ky_thi: testId, ten_dang_nhap_hoc_sinh: ten_dang_nhap });
      const query = new URLSearchParams({ view: 'accounts', ma_ky_thi: String(b.ma_ky_thi_quay_lai || testId), message: 'Đã xóa học sinh khỏi môn thi này.' });
      return res.redirect(`/admin?${query.toString()}`);
    }
    if (b.action === 'attempt_delete') {
      const testId = String(b.ma_ky_thi || ''), ten_dang_nhap = String(b.ten_dang_nhap || '');
      if (!testId || !ten_dang_nhap) return go('Thiếu thông tin tiến độ cần xóa.', true, 'exams');
      const result = await c.collection('bai_lam').deleteMany({ ma_ky_thi: testId, ten_dang_nhap_hoc_sinh: ten_dang_nhap });
      if (b.view === 'accounts' && b.ma_ky_thi_quay_lai) {
        const query = new URLSearchParams({ view: 'accounts', ma_ky_thi: String(b.ma_ky_thi_quay_lai), message: result.deletedCount ? 'Đã xóa tiến độ làm bài của học sinh.' : 'Học sinh chưa có tiến độ để xóa.' });
        return res.redirect(`/admin?${query.toString()}`);
      }
      return go(result.deletedCount ? 'Đã xóa tiến độ làm bài của học sinh.' : 'Học sinh chưa có tiến độ để xóa.', false, 'exams');
    }
    if (b.action === 'test_delete') {
      const { ObjectId } = require('mongodb'), id = String(b.ma_ky_thi || '');
      if (!ObjectId.isValid(id)) return go('Mã kỳ thi không hợp lệ.', true, b.view || 'exams');
      const test = await c.collection('ky_thi').findOneAndDelete({ _id: new ObjectId(id) });
      if (!test) return go('Không tìm thấy kỳ thi cần xóa.', true, b.view || 'exams');
      await c.collection('bai_lam').deleteMany({ ma_ky_thi: id });
      return go('Đã xóa kỳ thi và toàn bộ tiến độ liên quan.', false, b.view || 'exams');
    }
    if (b.action === 'test') {
      const questionFile = req.files?.sheet?.[0], studentsFile = req.files?.students_sheet?.[0];
      const starts = Math.floor(new Date(b.starts).getTime()/1000), noDeadline = b.khong_han_nop === '1', enteredEnd = Math.floor(new Date(b.ends).getTime()/1000), ends = noDeadline ? 253402300799 : enteredEnd, duration = Number(b.minutes), qps = Number(b.so_cau_moi_hoc_sinh), max = Number(b.so_luot_lam_toi_da);
      const submissionKey = String(b.submission_key || '').trim();
      if (!b.tieu_de?.trim()) return go('Hãy nhập Môn thi / Tên kỳ thi.', true, 'exams');
      if (!Number.isFinite(starts)) return go('Hãy chọn thời gian bắt đầu hợp lệ.', true, 'exams');
      if (!noDeadline && !Number.isFinite(ends)) return go('Hãy chọn thời gian kết thúc hoặc chọn Không giới hạn hạn nộp.', true, 'exams');
      if (!noDeadline && ends <= starts) return go('Thời gian kết thúc phải sau thời gian bắt đầu.', true, 'exams');
      if (!Number.isInteger(duration) || duration < 1) return go('Thời lượng làm bài phải là số nguyên từ 1 phút trở lên.', true, 'exams');
      if (!Number.isInteger(qps) || qps < 1) return go('Số câu mỗi học sinh phải là số nguyên từ 1 câu trở lên.', true, 'exams');
      if (!Number.isInteger(max) || max < 0) return go('Số lượt làm phải là số nguyên từ 0 trở lên; 0 là không giới hạn.', true, 'exams');
      if (!questionFile) return go('Hãy chọn tệp đề thi Excel .xlsx.', true, 'exams');
      if (!submissionKey) return go('Phiên giao đề đã hết hạn. Hãy tải lại trang và thử lại.', true, 'exams');
      const danh_sach_cau_hoi = parseQuestionRows(await readExamRows(questionFile.buffer));
      if (!danh_sach_cau_hoi.length || qps > danh_sach_cau_hoi.length) return go(`File đề có ${danh_sach_cau_hoi.length} câu hợp lệ. Số câu mỗi học sinh (${qps}) không được vượt quá số câu trong đề.`, true, 'exams');
      const usernames = [];
      if (studentsFile) {
        const studentRows = await readExcelRows(studentsFile.buffer);
        for (const row of studentRows) {
          const { ten_dang_nhap, birth } = studentValues(row, true);
          if (!ten_dang_nhap || !birth) continue;
          await c.collection('hoc_sinh').updateOne({ ten_dang_nhap }, { $set: { ten_dang_nhap, ho_ten: ten_dang_nhap, ngay_sinh: birth }, $unset: { xoa_luc: '' } }, { upsert: true });
          usernames.push(ten_dang_nhap);
        }
      }
      const assignedUsernames = [...new Set(usernames)];
      if (studentsFile && !assignedUsernames.length) return go('File danh sách học sinh chưa có dòng hợp lệ. Cột A là STT, cột B là họ tên/tên đăng nhập, cột C là ngày sinh.', true, 'exams');
      try {
        await c.collection('khoa_tao_ky_thi').insertOne({ _id: submissionKey, tao_luc: new Date() });
      } catch (error) {
        if (error?.code === 11000) return go('Yêu cầu giao đề này đang được xử lý. Hãy chờ vài giây rồi kiểm tra danh sách kỳ thi.', false, 'exams');
        throw error;
      }
      try {
        await c.collection('ky_thi').insertOne({
          tieu_de: b.tieu_de.trim(),
          mon_hoc: String(b.mon_hoc || b.tieu_de).trim(),
          danh_sach_cau_hoi,
          tong_cau_hoi: danh_sach_cau_hoi.length,
          danh_sach_hoc_sinh: assignedUsernames,
          so_cau_moi_hoc_sinh: qps,
          so_luot_lam_toi_da: max,
          dao_de: b.dao_de === '1',
          bat_dau_luc: starts,
          ket_thuc_luc: ends,
          khong_han_nop: noDeadline,
          thoi_luong_phut: duration,
          tao_luc: Math.floor(Date.now()/1000)
        });
      } catch (error) {
        // Không để lỗi đọc/tải file khóa vĩnh viễn lần giao đề kế tiếp.
        await c.collection('khoa_tao_ky_thi').deleteOne({ _id: submissionKey }).catch(() => {});
        throw error;
      }
      return go(assignedUsernames.length
        ? `Đã tạo đề với ${danh_sach_cau_hoi.length} câu và gán cho ${assignedUsernames.length} học sinh.`
        : `Đã tạo đề với ${danh_sach_cau_hoi.length} câu. Bạn có thể thêm học sinh vào môn sau.`, false, 'exams');
    }
    if (b.action === 'vocab_create') {
      const vocabFile = req.files?.vocab_sheet?.[0] || req.files?.sheet?.[0];
      const studentsFile = req.files?.students_sheet?.[0];
      const ngon_ngu = String(b.ngon_ngu || '').trim();
      const cap_do = String(b.cap_do || '').trim();
      const tieu_de = String(b.tieu_de || `${ngon_ngu}${cap_do ? ` · ${cap_do}` : ''}`).trim();
      const submissionKey = String(b.submission_key || '').trim();
      if (!ngon_ngu || !cap_do) return go('Hãy nhập tên ngôn ngữ và cấp độ.', true, 'vocab');
      if (!vocabFile) return go('Hãy chọn tệp Excel từ vựng (.xlsx). Cột A: STT, Cột B: Từ vựng, Cột C: Phiên âm, Cột D: Tiếng Việt.', true, 'vocab');
      if (!submissionKey) return go('Phiên tạo bộ từ vựng đã hết hạn. Hãy tải lại trang và thử lại.', true, 'vocab');
      try {
        await c.collection('khoa_tao_tu_vung').insertOne({ _id: submissionKey, tao_luc: new Date() });
      } catch (error) {
        if (error?.code === 11000) return go('Yêu cầu tạo bộ từ vựng này đang được xử lý. Hệ thống chỉ tạo một bộ.', false, 'vocab');
        throw error;
      }

      const tu_vung = parseVocabRows(await readVocabRows(vocabFile.buffer));
      if (!tu_vung.length) return go('Tệp từ vựng không có dữ liệu hợp lệ.', true, 'vocab');

      const usernames = [];
      if (studentsFile) {
        const studentRows = await readExcelRows(studentsFile.buffer);
        for (const row of studentRows) {
          const { ten_dang_nhap, birth } = studentValues(row, true);
          if (!ten_dang_nhap || !birth) continue;
          await c.collection('hoc_sinh').updateOne({ ten_dang_nhap }, { $set: { ten_dang_nhap, ho_ten: ten_dang_nhap, ngay_sinh: birth }, $unset: { xoa_luc: '' } }, { upsert: true });
          usernames.push(ten_dang_nhap);
        }
      }
      const assignedUsernames = [...new Set(usernames)];

      await c.collection('bo_tu_vung').insertOne({
        tieu_de,
        ngon_ngu,
        cap_do,
        tu_vung,
        tong_tu_vung: tu_vung.length,
        danh_sach_hoc_sinh: assignedUsernames,
        tao_luc: Math.floor(Date.now() / 1000)
      });
      return go(`Đã tạo bộ từ vựng "${tieu_de}" (${tu_vung.length} từ) và gán cho ${assignedUsernames.length} học sinh.`, false, b.view || 'vocab');
    }
    if (b.action === 'vocab_delete') {
      const { ObjectId } = require('mongodb'), id = String(b.vocab_id || '');
      if (!ObjectId.isValid(id)) return go('Mã bộ từ vựng không hợp lệ.', true, b.view || 'vocab');
      await c.collection('bo_tu_vung').deleteOne({ _id: new ObjectId(id) });
      return go('Đã xóa bộ từ vựng thành công.', false, b.view || 'vocab');
    }
    if (b.action === 'vocab_assign') {
      const { ObjectId } = require('mongodb'), id = String(b.vocab_id || '');
      if (!ObjectId.isValid(id)) return go('Mã bộ từ vựng không hợp lệ.', true, 'accounts');
      const selectedUsernames = (Array.isArray(b.ten_dang_nhap_hoc_sinh) ? b.ten_dang_nhap_hoc_sinh : [b.ten_dang_nhap_hoc_sinh])
        .map(v => String(v || '').trim()).filter(Boolean);
      if (selectedUsernames.includes('__ALL__')) {
        const allUsernames = await c.collection('hoc_sinh').distinct('ten_dang_nhap', { xoa_luc: { $exists: false } });
        await c.collection('bo_tu_vung').updateOne({ _id: new ObjectId(id) }, { $addToSet: { danh_sach_hoc_sinh: { $each: allUsernames } } });
        return res.redirect(`/admin?${new URLSearchParams({ view: 'accounts', vocab_id: id, message: `Đã gán tất cả ${allUsernames.length} học sinh vào bộ từ vựng.` }).toString()}`);
      }
      if (!selectedUsernames.length) return res.redirect(`/admin?${new URLSearchParams({ view: 'accounts', vocab_id: id, error: 'Hãy chọn ít nhất một học sinh.' }).toString()}`);
      await c.collection('bo_tu_vung').updateOne({ _id: new ObjectId(id) }, { $addToSet: { danh_sach_hoc_sinh: { $each: selectedUsernames } } });
      return res.redirect(`/admin?${new URLSearchParams({ view: 'accounts', vocab_id: id, message: `Đã thêm ${selectedUsernames.length} học sinh vào bộ từ vựng.` }).toString()}`);
    }
    if (b.action === 'vocab_student_remove') {
      const { ObjectId } = require('mongodb'), id = String(b.vocab_id || ''), ten_dang_nhap = String(b.ten_dang_nhap || '');
      if (!ObjectId.isValid(id) || !ten_dang_nhap) return go('Thiếu thông tin học sinh hoặc bộ từ vựng.', true, 'accounts');
      await c.collection('bo_tu_vung').updateOne({ _id: new ObjectId(id) }, { $pull: { danh_sach_hoc_sinh: ten_dang_nhap } });
      return res.redirect(`/admin?${new URLSearchParams({ view: 'accounts', vocab_id: id, message: 'Đã xóa học sinh khỏi bộ từ vựng.' }).toString()}`);
    }
    if (b.action === 'vocab_students_excel') {
      const { ObjectId } = require('mongodb'), id = String(b.vocab_id || '');
      if (!ObjectId.isValid(id)) return go('Mã bộ từ vựng không hợp lệ.', true, 'accounts');
      const studentFile = req.files?.sheet?.[0] || req.files?.students_sheet?.[0];
      if (!studentFile) return res.redirect(`/admin?${new URLSearchParams({ view: 'accounts', vocab_id: id, error: 'Hãy chọn file Excel danh sách học sinh.' }).toString()}`);
      const studentRows = await readExcelRows(studentFile.buffer);
      const usernames = [];
      for (const row of studentRows) {
        const { ten_dang_nhap, birth } = studentValues(row, true);
        if (!ten_dang_nhap || !birth) continue;
        await c.collection('hoc_sinh').updateOne({ ten_dang_nhap }, { $set: { ten_dang_nhap, ho_ten: ten_dang_nhap, ngay_sinh: birth }, $unset: { xoa_luc: '' } }, { upsert: true });
        usernames.push(ten_dang_nhap);
      }
      await c.collection('bo_tu_vung').updateOne({ _id: new ObjectId(id) }, { $addToSet: { danh_sach_hoc_sinh: { $each: usernames } } });
      return res.redirect(`/admin?${new URLSearchParams({ view: 'accounts', vocab_id: id, message: `Đã nhập và gán ${usernames.length} học sinh vào bộ từ vựng.` }).toString()}`);
    }
    if (b.action === 'vocab_student_manual') {
      const { ObjectId } = require('mongodb'), id = String(b.vocab_id || '');
      if (!ObjectId.isValid(id)) return go('Mã bộ từ vựng không hợp lệ.', true, 'accounts');
      const ten_dang_nhap = String(b.ho_ten || '').trim(), birth = String(b.ngay_sinh || '').trim();
      if (!ten_dang_nhap || !birth) return res.redirect(`/admin?${new URLSearchParams({ view: 'accounts', vocab_id: id, error: 'Hãy nhập họ tên và ngày sinh.' }).toString()}`);
      await c.collection('hoc_sinh').updateOne({ ten_dang_nhap }, { $set: { ten_dang_nhap, ho_ten: ten_dang_nhap, ngay_sinh: birth }, $unset: { xoa_luc: '' } }, { upsert: true });
      await c.collection('bo_tu_vung').updateOne({ _id: new ObjectId(id) }, { $addToSet: { danh_sach_hoc_sinh: ten_dang_nhap } });
      return res.redirect(`/admin?${new URLSearchParams({ view: 'accounts', vocab_id: id, message: `Đã thêm học sinh ${ten_dang_nhap} vào bộ từ vựng.` }).toString()}`);
    }
    return go('Thao tác không hợp lệ.', true);
  } catch (e) { console.error('Admin action failed:', e.message); return go(actionErrorMessage(e, b.view || 'accounts'), true, b.view || 'accounts'); }
});

app.use((err, req, res, next) => {
  console.error(err.message);
  const message = actionErrorMessage(err, req.body?.view || '');
  if (req.path === '/admin/action') return res.redirect(`/admin?view=${encodeURIComponent(req.body?.view || 'exams')}&error=${encodeURIComponent(message)}`);
  res.status(500).send('Có lỗi máy chủ khi xử lý yêu cầu. Hãy tải lại trang và thử lại.');
});
module.exports = { app, port };
