const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const multer = require('multer');
const ExcelJS = require('exceljs');
const bcrypt = require('bcryptjs');
const { db, uri, databaseName } = require('../config/db');
const requireAdmin = require('../middleware/authMiddleware');
const { loginPage, renderAdmin } = require('../controllers/adminDashboardView');
const cloudinary = require('../config/cloudinary');
const path = require('path');

const app = express();
const port = Number(process.env.PORT || 8002);
const dbName = databaseName;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });
const uploads = upload.fields([{ name: 'sheet', maxCount: 1 }, { name: 'students_sheet', maxCount: 1 }]);

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
  if (/cloudinary|api[_ ]?(key|secret)|cloud[_ ]?name|invalid signature|unknown api/i.test(message)) {
    return 'Không thể tải tệp đề lên Cloudinary. Kiểm tra CLOUDINARY_URL hoặc CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY và CLOUDINARY_API_SECRET trong .env.';
  }
  if (/mongo|querysrv|econn|authentication|server selection/i.test(message)) {
    return 'Không kết nối được MongoDB Atlas. Kiểm tra MONGODB_URI, quyền Database Access và Network Access.';
  }
  return view === 'exams'
    ? 'Không thể tạo kỳ thi. Kiểm tra dữ liệu nhập, tệp Excel và cấu hình Cloudinary.'
    : 'Không thể hoàn thành thao tác. Kiểm tra dữ liệu và kết nối MongoDB.';
}

app.disable('x-powered-by');
app.use(securityHeaders);
app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h', etag: true }));
app.use(session({ name: 'ADMINSESSID', secret: process.env.SESSION_SECRET || require('crypto').randomBytes(32).toString('hex'), resave: false, saveUninitialized: false, rolling: true, unset: 'destroy', store: MongoStore.create({ mongoUrl: uri, dbName, collectionName: 'admin_sessions' }), cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.APP_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 } }));
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
  const d = new Date(s); return Number.isNaN(+d) ? '' : d.toISOString().slice(0,10);
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
    username: excelText(row[nameIndex]),
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
  const questions = [], invalidRows = [];
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
    questions.push({ q: question, opts: options, key, points: null });
  }
  if (invalidRows.length) throw new Error(`File đề có ${invalidRows.length} dòng không hợp lệ: ${invalidRows.slice(0, 3).join('; ')}${invalidRows.length > 3 ? '…' : ''}`);
  return questions;
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
app.get('/', async (req, res, next) => {
  if (req.session.role === 'admin') return res.redirect('/admin');
  res.send(loginPage());
});
app.post('/login', async (req, res, next) => {
  try {
    const admin = await db().collection('admins').findOne({ username: String(req.body.username || '').trim() });
    if (!admin || !await bcrypt.compare(String(req.body.password || ''), admin.password_hash || '')) return res.status(401).send(loginPage('Tên đăng nhập hoặc mật khẩu chưa chính xác.'));
    req.session.regenerate(err => { if (err) return next(err); req.session.role = 'admin'; req.session.name = admin.full_name || admin.hoten || admin.username; req.session.save(() => res.redirect('/admin')); });
  } catch (e) { next(e); }
});
// Login form posts to /login; keep all state changes POST-only.
app.get('/admin', requireAdmin, async (req, res, next) => {
  try {
    const students = await db().collection('students').find({}).sort({ full_name: 1 }).toArray();
    const tests = await db().collection('tests').find({}).sort({ starts_at: -1 }).toArray();
    const ids = tests.map(t => String(t._id));
    const attempts = ids.length ? await db().collection('attempts').find({ test_id: { $in: ids } }).sort({ attempt_no: -1 }).toArray() : [];
    const byKey = new Map();
    for (const a of attempts) { const key = `${a.test_id}|${a.student_username}`; const x = byKey.get(key) || { latest: a, count: 0 }; x.count++; byKey.set(key, x); }
    const progress = tests.flatMap(t => (t.student_usernames || []).map(username => {
      const student = students.find(s => s.username === username); if (!student) return null;
      const rec = byKey.get(`${t._id}|${username}`); const a = rec?.latest;
      return { test_id: String(t._id), test: t.title, username, name: student.full_name || student.username, status: !a ? 'Chưa bắt đầu' : a.submitted_at ? 'Đã nộp' : 'Đang làm', score: a?.score ?? '—', attempt_count: rec?.count || 0, max_attempts: t.max_attempts ?? 1, violations: a?.violations || 0 };
    }).filter(Boolean));
    if (req.body?.progress_refresh) return res.json({ rows: progress });
    const active = students.filter(s => s.deleted_at == null), trash = students.filter(s => s.deleted_at != null);
    res.send(renderAdmin({ name: req.session.name, students: active, trash, tests, progress, view: req.query.view || 'accounts', selectedTestId: String(req.query.test_id || ''), message: req.query.message || '', error: req.query.error || '' }));
  } catch (e) { next(e); }
});
app.post('/admin/progress', requireAdmin, async (req, res, next) => {
  try {
    const c = db(), [students, tests] = await Promise.all([c.collection('students').find({}).toArray(), c.collection('tests').find({}).toArray()]);
    const ids = tests.map(t => String(t._id));
    const attempts = ids.length ? await c.collection('attempts').find({ test_id: { $in: ids } }).sort({ attempt_no: -1 }).toArray() : [];
    const byKey = new Map(); for (const a of attempts) { const k = `${a.test_id}|${a.student_username}`, x = byKey.get(k) || { latest: a, count: 0 }; x.count++; byKey.set(k, x); }
    const rows = tests.flatMap(t => (t.student_usernames || []).map(username => { const s = students.find(x => x.username === username); if (!s) return null; const rec = byKey.get(`${t._id}|${username}`), a = rec?.latest; return { test_id: String(t._id), test: t.title, username, name: s.full_name || username, status: !a ? 'Chưa bắt đầu' : a.submitted_at ? 'Đã nộp' : 'Đang làm', attempt_count: rec?.count || 0, max_attempts: t.max_attempts ?? 1, score: a?.score ?? '—', violations: a?.violations || 0 }; }).filter(Boolean));
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
      const assignedTestId = String(b.test_id || '').trim();
      if (b.action === 'student_manual') rows = [[b.full_name, b.birth_date]];
      else { const studentFile = req.files?.sheet?.[0]; if (!studentFile) return go('Hãy chọn file Excel .xlsx.', true, 'import-accounts'); rows = await readExcelRows(studentFile.buffer); }
      let count = 0;
      const createdUsernames = [];
      for (const row of rows) {
        const { username, birth } = studentValues(row, b.action === 'students'); if (!username || !birth) continue;
        await c.collection('students').updateOne({ username }, { $set: { username, full_name: username, birth_date: birth }, $unset: { deleted_at: '' } }, { upsert: true });
        createdUsernames.push(username);
        count++;
      }
      if (assignedTestId) {
        const { ObjectId } = require('mongodb');
        const filter = assignedTestId === 'all'
          ? { ends_at: { $gt: Math.floor(Date.now() / 1000) } }
          : { _id: ObjectId.isValid(assignedTestId) ? new ObjectId(assignedTestId) : assignedTestId };
        await c.collection('tests').updateMany(filter, { $addToSet: { student_usernames: { $each: createdUsernames } } });
      }
      const savedMessage = `${count} tài khoản đã được lưu${assignedTestId ? ' và gán vào môn thi thành công' : ''}.`;
      if (b.return_test_id) {
        const query = new URLSearchParams({ view: 'accounts', test_id: String(b.return_test_id), message: savedMessage });
        return res.redirect(`/admin?${query.toString()}`);
      }
      return go(savedMessage, false, b.view || (b.action === 'students' ? 'import-accounts' : 'add-account'));
    }
    if (b.action === 'assign_subject') {
      const { ObjectId } = require('mongodb');
      const testId = String(b.test_id || '').trim();
      const selectedUsernames = (Array.isArray(b.student_username) ? b.student_username : [b.student_username])
        .map(value => String(value || '').trim()).filter(Boolean);
      if (!testId) return go('Hãy chọn môn thi cần gán.', true, 'accounts');
      const filter = testId === 'all'
        ? { ends_at: { $gt: Math.floor(Date.now() / 1000) } }
        : { _id: ObjectId.isValid(testId) ? new ObjectId(testId) : testId };
      if (selectedUsernames.includes('__ALL__')) {
        const allUsernames = await c.collection('students').distinct('username', { deleted_at: { $exists: false } });
        await c.collection('tests').updateMany(filter, { $addToSet: { student_usernames: { $each: allUsernames } } });
        return go(`Đã gán TẤT CẢ ${allUsernames.length} học sinh vào môn thi được chọn.`, false, 'accounts');
      }
      if (!selectedUsernames.length) return go('Hãy chọn ít nhất một học sinh.', true, 'accounts');
      await c.collection('tests').updateMany(filter, { $addToSet: { student_usernames: { $each: selectedUsernames } } });
      if (b.return_test_id) return res.redirect(`/admin?${new URLSearchParams({ view: 'accounts', test_id: String(b.return_test_id), message: `Đã thêm ${selectedUsernames.length} học sinh vào môn.` }).toString()}`);
      return go(`Đã gán ${selectedUsernames.length} học sinh vào môn thi.`, false, 'accounts');
    }
    if (b.action === 'student_trash') { await c.collection('students').updateOne({ username: b.username, deleted_at: { $exists: false } }, { $set: { deleted_at: Math.floor(Date.now()/1000) } }); return go('Đã chuyển tài khoản vào thùng rác.'); }
    if (b.action === 'student_restore') { await c.collection('students').updateOne({ username: b.username }, { $unset: { deleted_at: '' } }); await c.collection('tests').updateMany({ ends_at: { $gt: Math.floor(Date.now()/1000) } }, { $addToSet: { student_usernames: b.username } }); return go('Đã khôi phục tài khoản.', false, 'trash'); }
    if (b.action === 'subject_students_remove_all') {
      const { ObjectId } = require('mongodb'), testId = String(b.test_id || '');
      if (!ObjectId.isValid(testId)) return go('Mã môn thi không hợp lệ.', true, 'accounts');
      await c.collection('tests').updateOne({ _id: new ObjectId(testId) }, { $set: { student_usernames: [] } });
      const result = await c.collection('attempts').deleteMany({ test_id: testId });
      return res.redirect(`/admin?${new URLSearchParams({ view: 'accounts', test_id: testId, message: `Đã xóa toàn bộ học sinh khỏi môn và ${result.deletedCount} lượt làm liên quan.` }).toString()}`);
    }
    if (b.action === 'subject_student_remove') {
      const { ObjectId } = require('mongodb'), testId = String(b.test_id || ''), username = String(b.username || '');
      if (!ObjectId.isValid(testId) || !username) return go('Thiếu thông tin học sinh hoặc môn thi.', true, 'accounts');
      await c.collection('tests').updateOne({ _id: new ObjectId(testId) }, { $pull: { student_usernames: username } });
      await c.collection('attempts').deleteMany({ test_id: testId, student_username: username });
      const query = new URLSearchParams({ view: 'accounts', test_id: String(b.test_id_return || testId), message: 'Đã xóa học sinh khỏi môn thi này.' });
      return res.redirect(`/admin?${query.toString()}`);
    }
    if (b.action === 'attempt_delete') {
      const testId = String(b.test_id || ''), username = String(b.username || '');
      if (!testId || !username) return go('Thiếu thông tin tiến độ cần xóa.', true, 'exams');
      const result = await c.collection('attempts').deleteMany({ test_id: testId, student_username: username });
      if (b.view === 'accounts' && b.test_id_return) {
        const query = new URLSearchParams({ view: 'accounts', test_id: String(b.test_id_return), message: result.deletedCount ? 'Đã xóa tiến độ làm bài của học sinh.' : 'Học sinh chưa có tiến độ để xóa.' });
        return res.redirect(`/admin?${query.toString()}`);
      }
      return go(result.deletedCount ? 'Đã xóa tiến độ làm bài của học sinh.' : 'Học sinh chưa có tiến độ để xóa.', false, 'exams');
    }
    if (b.action === 'test_delete') {
      const { ObjectId } = require('mongodb'), id = String(b.test_id || '');
      if (!ObjectId.isValid(id)) return go('Mã kỳ thi không hợp lệ.', true, b.view || 'exams');
      const test = await c.collection('tests').findOneAndDelete({ _id: new ObjectId(id) });
      if (!test) return go('Không tìm thấy kỳ thi cần xóa.', true, b.view || 'exams');
      await c.collection('attempts').deleteMany({ test_id: id });
      if (test.file?.public_id) cloudinary.uploader.destroy(test.file.public_id, { resource_type: 'raw' }).catch(() => {});
      return go('Đã xóa kỳ thi và toàn bộ tiến độ liên quan.', false, b.view || 'exams');
    }
    if (b.action === 'test') {
      const questionFile = req.files?.sheet?.[0], studentsFile = req.files?.students_sheet?.[0];
      const starts = Math.floor(new Date(b.starts).getTime()/1000), noDeadline = b.no_deadline === '1', enteredEnd = Math.floor(new Date(b.ends).getTime()/1000), ends = noDeadline ? 253402300799 : enteredEnd, duration = Number(b.minutes), qps = Number(b.questions_per_student), max = Number(b.max_attempts);
      if (!b.title?.trim() || !Number.isFinite(starts) || (!noDeadline && (!Number.isFinite(ends) || ends <= starts)) || !Number.isInteger(duration) || duration < 1 || !Number.isInteger(qps) || qps < 1 || !Number.isInteger(max) || max < 0 || !questionFile) return go('Kiểm tra tên, thời gian, số phút, số câu, lượt làm và file đề thi.', true, 'exams');
      const questions = parseQuestionRows(await readExamRows(questionFile.buffer));
      if (!questions.length || qps > questions.length) return go(`File đề có ${questions.length} câu hợp lệ. Số câu mỗi học sinh (${qps}) không được vượt quá số câu trong đề.`, true, 'exams');
      const usernames = [];
      if (studentsFile) {
        const studentRows = await readExcelRows(studentsFile.buffer);
        for (const row of studentRows) {
          const { username, birth } = studentValues(row, true);
          if (!username || !birth) continue;
          await c.collection('students').updateOne({ username }, { $set: { username, full_name: username, birth_date: birth }, $unset: { deleted_at: '' } }, { upsert: true });
          usernames.push(username);
        }
      }
      const assignedUsernames = [...new Set(usernames)];
      if (studentsFile && !assignedUsernames.length) return go('File danh sách học sinh chưa có dòng hợp lệ. Cột A là STT, cột B là họ tên/tên đăng nhập, cột C là ngày sinh.', true, 'exams');
      const uploaded = await new Promise((resolve, reject) => { const stream = cloudinary.uploader.upload_stream({ resource_type: 'raw', folder: 'online-exams', format: 'xlsx', public_id: `${Date.now()}-${path.basename(questionFile.originalname, path.extname(questionFile.originalname))}` }, (err, result) => err ? reject(err) : resolve(result)); stream.end(questionFile.buffer); });
      await c.collection('tests').insertOne({
        title: b.title.trim(),
        subject: String(b.subject || b.title).trim(),
        questions,
        total_questions: questions.length,
        file: { url: uploaded.secure_url, public_id: uploaded.public_id },
        student_usernames: assignedUsernames,
        questions_per_student: qps,
        max_attempts: max,
        shuffle_questions: b.shuffle_questions === '1',
        starts_at: starts,
        ends_at: ends,
        no_deadline: noDeadline,
        duration_minutes: duration,
        created_at: Math.floor(Date.now()/1000)
      });
      return go(assignedUsernames.length
        ? `Đã tạo đề với ${questions.length} câu và gán cho ${assignedUsernames.length} học sinh.`
        : `Đã tạo đề với ${questions.length} câu. Bạn có thể thêm học sinh vào môn sau.`, false, 'exams');
    }
    return go('Thao tác không hợp lệ.', true);
  } catch (e) { console.error('Admin action failed:', e.message); return go(actionErrorMessage(e, b.view || 'accounts'), true, b.view || 'accounts'); }
});

app.use((err, req, res, next) => {
  console.error(err.message);
  const message = actionErrorMessage(err, req.body?.view || '');
  if (req.path === '/admin/action') return res.redirect(`/admin?view=${encodeURIComponent(req.body?.view || 'exams')}&error=${encodeURIComponent(message)}`);
  res.status(500).send('Có lỗi máy chủ. Kiểm tra cấu hình MongoDB/Cloudinary.');
});
module.exports = { app, port };
