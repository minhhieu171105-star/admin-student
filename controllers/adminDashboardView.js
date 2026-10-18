const path = require('path');
const fs = require('fs');

const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hidden = (name, value) => `<input type="hidden" name="${esc(name)}" value="${esc(value)}">`;

function getInitials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return String(name[0] || '?').toUpperCase();
}

function loginPage(error = '') {
  return fs.readFileSync(path.join(__dirname, '..', 'public', 'login.html'), 'utf8')
    .replace('{{ERROR}}', error ? `<div class="notice notice-error" role="alert">${esc(error)}</div>` : '');
}

function page(title, name, body) {
  return fs.readFileSync(path.join(__dirname, '..', 'public', 'layout.html'), 'utf8')
    .replace('{{TITLE}}', esc(title)).replace('{{NAME}}', esc(name)).replace('{{BODY}}', body);
}

function removeForm(action, fields, label = 'Xóa', cls = 'delete-btn') {
  return `<form method="post" action="/admin/action" class="inline-form" onsubmit="return confirm('Bạn có chắc muốn xóa?')">${hidden('action', action)}${Object.entries(fields).map(([k, v]) => hidden(k, v)).join('')}<button class="${cls}">${label}</button></form>`;
}

function studentCard(s, tests = []) {
  const initials = getInitials(s.full_name || s.username);
  const enrolledTests = tests.filter(t => (t.student_usernames || []).includes(s.username));
  const enrolledBadge = enrolledTests.length
    ? `<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:12px;background:#e0f2fe;color:#0369a1;font-size:11px;font-weight:600;margin-top:2px;">${enrolledTests.length} môn: ${enrolledTests.map(t => esc(t.title)).join(', ')}</span>`
    : `<span style="color:var(--muted);font-size:11px;">Chưa gán môn</span>`;

  const testOptions = tests.map(t => `<option value="${esc(t._id)}">${esc(t.title)}</option>`).join('');

  return `
<div class="student-card">
  <div class="student-card-top">
    <div class="student-avatar">${initials}</div>
    <div class="student-name-block">
      <div class="student-name">${esc(s.full_name || s.username)}</div>
      <div class="student-username">👤 ${esc(s.username)}</div>
    </div>
    <span class="status-live-badge">Hoạt động</span>
  </div>
  <div class="detail-grid">
    <div class="detail-item">
      <span class="detail-label">NGÀY SINH</span>
      <span class="detail-value">${esc(s.birth_date || '—')}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">MÔN THI ĐÃ GÁN</span>
      <div class="detail-value" style="font-size:12px;line-height:1.4;">${enrolledBadge}</div>
    </div>
  </div>
  <div style="margin:10px 0;padding:8px;background:var(--canvas);border-radius:8px;border:1px solid var(--line);">
    <form method="post" action="/admin/action" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
      ${hidden('action', 'assign_subject')}
      ${hidden('student_username', s.username)}
      <select name="test_id" required style="flex:1;min-width:140px;min-height:34px;padding:4px 8px;font-size:12px;border-radius:6px;border:1px solid var(--line);background:#fff;">
        <option value="">+ Gán vào môn thi...</option>
        ${tests.length ? '<option value="all">⭐ Tất cả các môn đang mở</option>' : ''}
        ${testOptions}
      </select>
      <button type="submit" style="min-height:34px;padding:4px 12px;font-size:12px;border-radius:6px;">Gán</button>
    </form>
  </div>
  <div class="card-actions">
    ${removeForm('student_trash', { username: s.username }, '🗑️ Xóa', 'delete-btn')}
  </div>
</div>`;
}

function progressRows(progress) {
  if (!progress.length) return '<tr><td colspan="7" class="empty-state">Chưa có dữ liệu làm bài.</td></tr>';
  return progress.map(item => `<tr><td>${esc(item.test)}</td><td>${esc(item.name)}</td><td>${esc(item.status)}</td><td>${item.attempt_count} / ${item.max_attempts === 0 ? '∞' : item.max_attempts}</td><td>${esc(item.score)}</td><td>${item.violations || 0}</td><td>${item.attempt_count ? removeForm('attempt_delete', { test_id: item.test_id, username: item.username, view: 'exams' }, 'Xóa tiến độ', 'delete-btn') : ''}</td></tr>`).join('');
}

function testRows(tests, view) {
  if (!tests.length) return '<tr><td colspan="7" class="empty-state">Chưa có kỳ thi nào.</td></tr>';
  return tests.map(test => {
    const qCount = test.total_questions || (test.questions || []).length;
    const qps = test.questions_per_student || qCount;
    const studentCount = (test.student_usernames || []).length;
    return `<tr>
      <td><a href="/admin?view=accounts&amp;test_id=${encodeURIComponent(String(test._id))}"><strong>${esc(test.title)}</strong></a><br><small style="color:var(--muted)">${studentCount} học sinh được gán</small></td>
      <td>${new Date(test.starts_at * 1000).toLocaleString('vi-VN')}</td>
      <td>${test.no_deadline ? 'Không giới hạn' : new Date(test.ends_at * 1000).toLocaleString('vi-VN')}</td>
      <td>${Number(test.duration_minutes)} phút</td>
      <td>${qps} / ${qCount} câu${test.shuffle_questions ? ' (Đảo đề)' : ''}</td>
      <td>${test.max_attempts === 0 ? 'Vô số (∞)' : test.max_attempts ?? 1}</td>
      <td>${removeForm('test_delete', { test_id: test._id, view }, '🗑️ Xóa', 'delete-btn')}</td>
    </tr>`;
  }).join('');
}

function renderAdmin({ name, students, trash, tests, progress, view, selectedTestId = '', message, error }) {
  const current = Math.floor(Date.now() / 1000);
  const activeTests = tests.filter(test => Number(test.ends_at) >= current);
  const finishedTests = tests.filter(test => Number(test.ends_at) < current);

  const tabs = [
    ['accounts', '👥 Môn học & học sinh', students.length],
    ['exams', '📝 Giao đề & Kỳ thi', activeTests.length],
    ['finished-exams', '✅ Đã kết thúc', finishedTests.length],
  ];

  const tabNav = `<div class="tab-nav">${tabs.map(([key, label, count]) => `<button class="tab-btn${view === key ? ' active' : ''}" onclick="location.href='/admin?view=${key}'">${label}${count !== null ? `<span class="tab-count">${count}</span>` : ''}</button>`).join('')}</div>`;

  const testSelectOptions = tests.map(t => `<option value="${esc(t._id)}">${esc(t.title)}</option>`).join('');

  let content = '';

  if (view === 'accounts') {
    const selectedTest = tests.find(test => String(test._id) === selectedTestId);
    if (selectedTestId === 'legacy-all-accounts') {
      const accountRows = students.length ? students.map(student => `<tr><td>${esc(student.full_name || student.username)}</td><td>${esc(student.username)}</td><td>${esc(student.birth_date || '')}</td></tr>`).join('') : '<tr><td colspan="3" class="empty-state">Chưa có tài khoản học sinh.</td></tr>';
      content = `<div class="section-header"><div><p class="section-title">Tài khoản riêng</p><p class="section-sub">Tạo tài khoản trước, sau đó có thể gán toàn bộ vào một môn thi.</p></div><a class="add-btn" href="/admin?view=accounts">← Danh sách môn thi</a></div><div class="card" style="margin-bottom:16px"><div style="display:flex;gap:10px;flex-wrap:wrap"><a class="button" href="/admin?view=add-account">+ Thêm tài khoản</a><a class="button button-secondary" href="/admin?view=import-accounts">Nhập từ Excel</a></div><form method="post" action="/admin/action" style="margin-top:18px;display:flex;gap:10px;align-items:end;flex-wrap:wrap">${hidden('action', 'assign_subject')}${hidden('student_username', '__ALL__')}<div style="min-width:260px;flex:1"><label>Gán tất cả ${students.length} tài khoản vào môn thi</label><select name="test_id" required><option value="">-- Chọn môn thi --</option>${testSelectOptions}</select></div><button type="submit">Gán tất cả vào môn</button></form></div><div class="card"><div class="table-wrap"><table><thead><tr><th>Họ tên</th><th>Tên đăng nhập</th><th>Ngày sinh</th></tr></thead><tbody>${accountRows}</tbody></table></div></div>`;
    } else if (selectedTest) {
      const rows = progress.filter(item => item.test_id === String(selectedTest._id));
      const availableStudents = students.filter(student => !(selectedTest.student_usernames || []).includes(student.username));
      const tableRows = rows.length ? rows.map((item, index) => `<tr data-student="${esc(item.username)}"><td>${index + 1}</td><td>${esc(item.name)}</td><td>${esc(item.username)}</td><td data-field="status">${esc(item.status)}</td><td data-field="attempts">${item.attempt_count} / ${item.max_attempts === 0 ? '∞' : item.max_attempts}</td><td data-field="score">${esc(item.score)}</td><td data-field="violations">${item.violations || 0}</td><td>${removeForm('subject_student_remove', { username: item.username, test_id: selectedTest._id, test_id_return: selectedTest._id }, 'Xóa khỏi môn', 'delete-btn')}</td></tr>`).join('') : '<tr><td colspan="8" class="empty-state">Chưa có học sinh được gán vào môn thi này.</td></tr>';
      const memberTools = `<div class="grid" style="margin-bottom:16px"><section class="card"><h2>Thêm học sinh vào môn</h2><form method="post" action="/admin/action">${hidden('action', 'student_manual')}${hidden('test_id', selectedTest._id)}${hidden('return_test_id', selectedTest._id)}<label>Họ tên học sinh</label><input name="full_name" required><label>Ngày sinh</label><input name="birth_date" type="date" required><button>Thêm vào môn</button></form></section><section class="card"><h2>Nhập danh sách Excel</h2><form method="post" action="/admin/action" enctype="multipart/form-data">${hidden('action', 'students')}${hidden('test_id', selectedTest._id)}${hidden('return_test_id', selectedTest._id)}<label>Tệp Excel .xlsx</label><input type="file" name="sheet" accept=".xlsx" required><p class="card-intro">Cột A: STT · Cột B: họ tên/tên đăng nhập · Cột C: ngày sinh.</p><button>Nhập vào môn</button></form></section></div>`;
      const existingAccounts = availableStudents.length
        ? `<section class="card" style="margin-bottom:16px"><div class="section-heading"><div><h2>Thêm tài khoản có sẵn</h2><p class="card-intro">Mở danh sách rồi chọn các học sinh cần gán vào môn này.</p></div><button type="button" data-show-account-picker>Thêm tài khoản có sẵn (${availableStudents.length})</button></div><form method="post" action="/admin/action" id="available-account-picker" hidden>${hidden('action', 'assign_subject')}${hidden('test_id', selectedTest._id)}${hidden('return_test_id', selectedTest._id)}<div class="table-wrap"><table><thead><tr><th><input type="checkbox" aria-label="Chọn tất cả" data-select-all></th><th>Họ tên</th><th>Ngày sinh</th></tr></thead><tbody>${availableStudents.map(student => `<tr><td><input type="checkbox" name="student_username" value="${esc(student.username)}" data-available-student></td><td>${esc(student.full_name || student.username)}</td><td>${esc(student.birth_date || '')}</td></tr>`).join('')}</tbody></table></div><div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="button-secondary" data-select-all>Thêm tất cả</button><button type="submit">Thêm học sinh đã chọn</button><button type="button" class="button-secondary" data-hide-account-picker>Đóng danh sách</button></div></form></section>`
        : `<section class="card" style="margin-bottom:16px"><div class="empty-state">Tất cả tài khoản học sinh hiện có đã được thêm vào môn này.</div></section>`;
      const removeAllStudents = rows.length ? `<form method="post" action="/admin/action" style="margin:0 0 14px" onsubmit="return confirm('Xóa toàn bộ học sinh khỏi môn này và xóa các lượt làm liên quan?')">${hidden('action', 'subject_students_remove_all')}${hidden('test_id', selectedTest._id)}<button type="submit" class="button-danger">Xóa tất cả học sinh của môn</button></form>` : '';
      content = `<div class="section-header"><div><p class="section-title">${esc(selectedTest.subject || selectedTest.title)}</p><p class="section-sub">${esc(selectedTest.title)} · Tiến độ làm bài của ${rows.length} học sinh</p></div><a class="add-btn" href="/admin?view=accounts">← Danh sách môn thi</a></div>${memberTools}${existingAccounts}<div class="card">${removeAllStudents}<div class="table-wrap"><table id="subject-progress"><thead><tr><th>STT</th><th>Họ tên</th><th>Tên đăng nhập</th><th>Trạng thái</th><th>Lượt làm</th><th>Điểm</th><th>Rời trang</th><th></th></tr></thead><tbody>${tableRows}</tbody></table></div></div>`;
    } else {
      const subjectCards = tests.map(test => {
        const enrolled = students.filter(student => (test.student_usernames || []).includes(student.username)).length;
        const ended = Number(test.ends_at) < current;
        return `<a class="subject-card" href="/admin?view=accounts&amp;test_id=${encodeURIComponent(String(test._id))}"><span class="subject-card-icon">📚</span><span class="subject-card-body"><strong>${esc(test.subject || test.title)}</strong><small>${esc(test.title)}</small><em>${enrolled} học sinh${ended ? ' · Đã kết thúc' : ''}</em></span><span class="subject-card-arrow">›</span></a>`;
      }).join('');
      content = `<div class="section-header"><div><p class="section-title">Danh sách môn thi</p><p class="section-sub">Chọn một môn để thêm học sinh, nhập Excel và xem tiến độ.</p></div></div><div class="subject-grid">${subjectCards || '<div class="card"><div class="empty-state">Chưa có môn thi nào. Hãy tạo kỳ thi trước.</div></div>'}</div>`;
    }
  } else if (view === 'legacy-accounts') {
    const selectedTest = tests.find(test => String(test._id) === selectedTestId);
    const isUnassigned = selectedTestId === 'unassigned';
    if (selectedTest || isUnassigned) {
      const subjectStudents = isUnassigned
        ? students.filter(student => !tests.some(test => (test.student_usernames || []).includes(student.username)))
        : students.filter(student => (selectedTest.student_usernames || []).includes(student.username));
      const heading = isUnassigned ? 'Học sinh chưa gán môn thi' : (selectedTest.subject || selectedTest.title);
      const description = isUnassigned
        ? 'Các tài khoản này chưa được gán vào bất kỳ môn thi nào.'
        : `${selectedTest.title} · ${subjectStudents.length} học sinh được gán`;
      content = `<div class="section-header"><div><p class="section-title">${esc(heading)}</p><p class="section-sub">${esc(description)}</p></div><a class="add-btn" href="/admin?view=accounts">← Danh sách môn thi</a></div><div class="search-row"><div class="search-wrap"><span class="search-icon">🔍</span><input class="search-input" type="search" placeholder="Tìm họ tên, tài khoản..." oninput="filterSubjectStudents(this.value)"></div></div><div id="student-list">${subjectStudents.length ? subjectStudents.map(student => studentCard(student, tests)).join('') : '<div class="card"><div class="empty-state">Chưa có học sinh trong môn thi này.</div></div>'}</div><script>function filterSubjectStudents(query){const text=query.toLowerCase();document.querySelectorAll('#student-list .student-card').forEach(card=>card.style.display=card.textContent.toLowerCase().includes(text)?'':'none')}</script>`;
    } else {
      const subjectCards = tests.map(test => {
        const enrolled = students.filter(student => (test.student_usernames || []).includes(student.username)).length;
        const ended = Number(test.ends_at) < current;
        return `<a class="subject-card" href="/admin?view=accounts&amp;test_id=${encodeURIComponent(String(test._id))}"><span class="subject-card-icon">📚</span><span class="subject-card-body"><strong>${esc(test.subject || test.title)}</strong><small>${esc(test.title)}</small><em>${enrolled} học sinh${ended ? ' · Đã kết thúc' : ''}</em></span><span class="subject-card-arrow">›</span></a>`;
      }).join('');
      const unassigned = students.filter(student => !tests.some(test => (test.student_usernames || []).includes(student.username))).length;
      content = `<div class="section-header"><div><p class="section-title">Danh sách môn thi</p><p class="section-sub">Chọn một môn thi để xem danh sách tài khoản học sinh.</p></div><a class="add-btn" href="/admin?view=add-account">+ Thêm mới</a></div><div class="subject-grid">${subjectCards || '<div class="card"><div class="empty-state">Chưa có môn thi nào. Hãy tạo kỳ thi trước.</div></div>'}${unassigned ? `<a class="subject-card subject-card-muted" href="/admin?view=accounts&amp;test_id=unassigned"><span class="subject-card-icon">👥</span><span class="subject-card-body"><strong>Chưa gán môn</strong><small>Tài khoản chưa thuộc môn thi nào</small><em>${unassigned} học sinh</em></span><span class="subject-card-arrow">›</span></a>` : ''}</div>`;
    }
  } else if (view === 'legacy-accounts') {
    const cards = students.length
      ? students.map(s => studentCard(s, tests)).join('')
      : `<div class="card"><div class="empty-state">📂 Chưa có học sinh nào trong hệ thống.</div></div>`;
    content = `
<div class="search-row">
  <div class="search-wrap">
    <span class="search-icon">🔍</span>
    <input class="search-input" type="search" placeholder="Tìm họ tên, tài khoản..." oninput="filterCards(this.value)">
  </div>
  <button type="button" class="filter-btn" title="Lọc">⊞</button>
</div>

<div class="card" style="padding:16px;margin-bottom:16px;background:#f0fdf4;border-color:#bbf7d0;">
  <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
    <div>
      <strong style="color:#166534;font-size:14px;">🎯 Gán hàng loạt (All học sinh vào môn thi):</strong>
      <p style="margin:2px 0 0;font-size:12px;color:#15803d;">Chọn môn thi để cấp quyền thi cho toàn bộ học sinh đang có trong hệ thống.</p>
    </div>
    <form method="post" action="/admin/action" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      ${hidden('action', 'assign_subject')}
      ${hidden('student_username', '__ALL__')}
      <select name="test_id" required style="min-height:38px;padding:6px 12px;border-radius:8px;font-size:13px;background:#fff;">
        <option value="">-- Chọn môn thi --</option>
        ${tests.length ? '<option value="all">⭐ Tất cả các kỳ thi đang mở</option>' : ''}
        ${testSelectOptions}
      </select>
      <button type="submit" style="background:#16a34a;min-height:38px;padding:6px 16px;font-size:13px;border-radius:8px;">Áp dụng cho tất cả</button>
    </form>
  </div>
</div>

<div class="card" style="margin-bottom:24px">
  <h2 style="font-size:18px;margin-bottom:6px;">Thêm danh sách học sinh vào môn</h2>
  <p class="card-intro">Tệp Excel: cột A là họ tên/tên đăng nhập, cột B là ngày sinh. Chọn môn để gán danh sách ngay sau khi nhập.</p>
  <form method="post" action="/admin/action" enctype="multipart/form-data">
    ${hidden('action', 'students')}
    ${hidden('view', 'exams')}
    <div class="form-grid">
      <div><label>Môn thi</label><select name="test_id" required><option value="">-- Chọn môn thi --</option>${testSelectOptions}</select></div>
      <div><label>Tệp Excel danh sách học sinh</label><input type="file" name="sheet" accept=".xlsx" required></div>
    </div>
    <div style="margin-top:16px"><button type="submit">Nhập và gán vào môn</button></div>
  </form>
</div>

<div class="section-header">
  <div>
    <p class="section-title">Danh sách tài khoản học sinh</p>
    <p class="section-sub">${students.length} học sinh trong hệ thống</p>
  </div>
  <a class="add-btn" href="/admin?view=add-account">+ Thêm mới</a>
</div>
<div id="student-list">${cards}</div>
<div class="tip-card">
  <span class="tip-icon">💡</span>
  <span class="tip-text">Bạn có thể tạo đề thi môn học trước, sau đó dùng mục <strong>Nhập từ Excel</strong> hoặc gán nhanh bằng nút trên để cho tất cả học sinh vào thi môn tùy ý.</span>
</div>
<script>
function filterCards(q) {
  const lower = q.toLowerCase();
  document.querySelectorAll('#student-list .student-card').forEach(card => {
    const text = card.textContent.toLowerCase();
    card.style.display = text.includes(lower) ? '' : 'none';
  });
}
</script>`;
  } else if (view === 'trash') {
    content = `
<div class="section-header"><div><p class="section-title">Thùng rác</p><p class="section-sub">${trash.length} tài khoản đã xóa</p></div></div>
<div class="card">
  <div class="table-wrap">
    <table><thead><tr><th>Họ tên</th><th>Ngày sinh</th><th>Thao tác</th></tr></thead><tbody>
    ${trash.map(s => `<tr><td>${esc(s.full_name || s.username)}</td><td>${esc(s.birth_date || '')}</td><td><form method="post" action="/admin/action">${hidden('action', 'student_restore')}${hidden('username', s.username)}${hidden('view', 'trash')}<button class="edit-btn">↩️ Khôi phục</button></form></td></tr>`).join('') || '<tr><td colspan="3" class="empty-state">Thùng rác đang trống.</td></tr>'}
    </tbody></table>
  </div>
</div>`;
  } else if (view === 'add-account') {
    content = `
<div class="card" style="max-width:680px;margin:0 auto 20px;">
  <h2 style="font-size:18px;margin-bottom:6px;">➕ Thêm học sinh thủ công</h2>
  <p style="color:var(--muted);font-size:13px;margin:0 0 18px">Tên đăng nhập được tạo từ họ tên; mật khẩu đăng nhập của học sinh là ngày sinh.</p>
  <form method="post" action="/admin/action">${hidden('action', 'student_manual')}
    <label>Họ tên học sinh</label>
    <input name="full_name" placeholder="Ví dụ: Đặng Ngọc Thảo Phương" required>
    
    <label>Ngày sinh (dùng làm mật khẩu đăng nhập)</label>
    <input name="birth_date" type="date" required>

    <label>Gán vào môn thi (tùy chọn)</label>
    <select name="test_id">
      <option value="">-- Chưa gán môn (có thể gán sau) --</option>
      ${tests.length ? '<option value="all">⭐ Gán vào tất cả các môn đang mở</option>' : ''}
      ${testSelectOptions}
    </select>
    
    <div style="margin-top:20px;display:flex;gap:10px;">
      <button type="submit">💾 Lưu tài khoản</button>
      <a class="button button-secondary" href="/admin?view=accounts">Quay lại danh sách</a>
    </div>
  </form>
</div>`;
  } else if (view === 'import-accounts') {
    content = `
<div class="card" style="max-width:680px;margin:0 auto 20px;">
  <h2 style="font-size:18px;margin-bottom:6px;">📋 Nhập danh sách học sinh từ Excel</h2>
  <p style="color:var(--muted);font-size:13px;margin:0 0 18px">File Excel gồm <strong>Cột A:</strong> Họ tên / Tên đăng nhập; <strong>Cột B:</strong> Ngày sinh (YYYY-MM-DD hoặc DD/MM/YYYY).</p>
  <form method="post" action="/admin/action" enctype="multipart/form-data">${hidden('action', 'students')}
    <label>Chọn tệp Excel .xlsx danh sách học sinh</label>
    <input type="file" name="sheet" accept=".xlsx" required>

    <label>Gán toàn bộ danh sách vừa nhập vào môn thi nào:</label>
    <select name="test_id">
      <option value="">-- Chỉ tạo tài khoản, chưa gán môn thi --</option>
      ${tests.length ? '<option value="all">⭐ Gán vào TẤT CẢ môn thi đang mở</option>' : ''}
      ${testSelectOptions}
    </select>

    <div style="margin-top:20px;display:flex;gap:10px;">
      <button type="submit">📋 Tiến hành nhập dữ liệu</button>
      <a class="button button-secondary" href="/admin?view=accounts">Quay lại danh sách</a>
    </div>
  </form>
</div>`;
  } else if (view === 'finished-exams') {
    content = `
<div class="section-header"><div><p class="section-title">Kỳ thi đã kết thúc</p><p class="section-sub">Các kỳ thi quá thời hạn làm bài.</p></div></div>
<div class="card">
  <div class="table-wrap">
    <table><thead><tr><th>Tên kỳ thi / Môn</th><th>Bắt đầu</th><th>Kết thúc</th><th>Thời lượng</th><th>Số câu / Đề</th><th>Lượt tối đa</th><th>Thao tác</th></tr></thead>
    <tbody>${testRows(finishedTests, 'finished-exams')}</tbody>
    </table>
  </div>
</div>`;
  } else if (view === 'legacy-progress-view') {
    content = `
<div class="section-header">
  <div>
    <p class="section-title">📊 Tiến độ làm bài thi của học sinh</p>
    <p class="section-sub">Bảng tự động cập nhật kết quả mỗi 5 giây.</p>
  </div>
</div>
<div class="card" style="margin-bottom:16px">
  <div class="table-wrap">
    <table id="progress">
      <thead>
        <tr><th>Kỳ thi</th><th>Học sinh</th><th>Trạng thái</th><th>Lượt làm</th><th>Điểm số</th><th>Rời trang</th><th>Thao tác</th></tr>
      </thead>
      <tbody>${progressRows(progress)}</tbody>
    </table>
  </div>
</div>`;
  } else {
    // exams view
    content = `
<div class="card" style="margin-bottom:24px">
  <div style="border-bottom:1px solid var(--line);padding-bottom:14px;margin-bottom:18px;">
    <h2 style="font-size:18px;margin:0 0 4px;color:var(--ink);">📝 Giao đề thi mới</h2>
    <p style="margin:0;font-size:13px;color:var(--muted);">Tạo kỳ thi, phân chia số câu hỏi đảo đề từ Excel và thiết lập thời gian làm bài chi tiết.</p>
  </div>

  <form method="post" action="/admin/action" enctype="multipart/form-data">
    ${hidden('action', 'test')}
    ${hidden('view', 'exams')}
    
    <div class="form-grid" style="margin-bottom:12px;">
      <div>
        <label>Môn thi / Tên kỳ thi <span style="color:var(--danger)">*</span></label>
        <input name="title" placeholder="VD: Toán 12 - Kiểm tra 1 tiết" required>
      </div>
      <div>
        <label>Tên môn học (phân loại)</label>
        <input name="subject" placeholder="VD: Toán học, Tiếng Anh...">
      </div>
    </div>

    <div class="form-grid" style="margin-bottom:12px;">
      <div>
        <label>📅 Thời gian bắt đầu (Ngày & Giờ) <span style="color:var(--danger)">*</span></label>
        <input name="starts" type="datetime-local" required>
      </div>
      <div>
        <label>⏳ Thời gian kết thúc (hạn nộp, tùy chọn)</label>
        <input name="ends" type="datetime-local">
      </div>
    </div>

    <div class="form-grid" style="margin-bottom:12px;">
      <div>
        <label>⏱️ Thời gian làm bài (phút) <span style="color:var(--danger)">*</span></label>
        <input name="minutes" type="number" min="1" placeholder="VD: 45" required>
      </div>
      <div>
        <label>🔀 Số câu hỏi mỗi học sinh làm <span style="color:var(--danger)">*</span></label>
        <input name="questions_per_student" type="number" min="1" placeholder="VD: 40 (trích xuất từ file đề)" required>
      </div>
      <div>
        <label>🔄 Giới hạn số lượt làm bài <span style="color:var(--danger)">*</span></label>
        <select name="max_attempts" required>
          <option value="1">1 lượt duy nhất</option>
          <option value="2">2 lượt</option>
          <option value="3">3 lượt</option>
          <option value="4">4 lượt</option>
          <option value="0">Không giới hạn (Vô số lượt - ∞)</option>
        </select>
      </div>
    </div>

    <div style="margin:0 0 16px;padding:12px 16px;background:var(--canvas);border-radius:var(--r-md);border:1px solid var(--line);">
      <label style="display:inline-flex;align-items:center;gap:10px;cursor:pointer;margin:0;">
        <input type="checkbox" name="no_deadline" value="1" style="width:18px;height:18px;">
        <span><strong>Không đặt hạn nộp</strong> — học sinh có thể làm bài sau thời gian bắt đầu; mỗi lượt vẫn giới hạn theo số phút làm bài.</span>
      </label>
    </div>

    <div style="margin:16px 0;padding:12px 16px;background:var(--canvas);border-radius:var(--r-md);border:1px solid var(--line);">
      <label style="display:inline-flex;align-items:center;gap:10px;cursor:pointer;margin:0;">
        <input type="checkbox" name="shuffle_questions" value="1" checked style="width:18px;height:18px;">
        <span><strong>Trộn câu hỏi và đảo thứ tự đáp án (A, B, C, D)</strong> cho từng học sinh</span>
      </label>
    </div>

    <label>📂 Tệp đề thi Excel .xlsx <span style="color:var(--muted);font-weight:400">(Cột A: STT, B: Câu hỏi, C-F: Đáp án A,B,C,D, G: Đáp án đúng)</span> <span style="color:var(--danger)">*</span></label>
    <input name="sheet" type="file" accept=".xlsx" required>

    <label>👥 Danh sách học sinh Excel .xlsx <span style="color:var(--muted);font-weight:400">(không bắt buộc — cột A: STT, cột B: họ tên/tên đăng nhập, cột C: ngày sinh)</span></label>
    <input name="students_sheet" type="file" accept=".xlsx">

    <div style="margin-top:20px;display:flex;gap:12px;align-items:center;">
      <button type="submit" style="padding:10px 24px;font-size:14px;">🚀 Xác nhận giao đề thi</button>
    </div>
  </form>
</div>

<div class="section-header">
  <div>
    <p class="section-title">📋 Danh sách kỳ thi đang mở</p>
    <p class="section-sub">Các kỳ thi còn trong thời hạn làm bài.</p>
  </div>
</div>
<div class="card" style="margin-bottom:24px">
  <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Kỳ thi / Môn</th><th>Bắt đầu</th><th>Kết thúc</th><th>Thời lượng</th><th>Số câu / Đề</th><th>Lượt làm</th><th>Thao tác</th></tr>
      </thead>
      <tbody>${testRows(activeTests, 'exams')}</tbody>
    </table>
  </div>
</div>
`;
  }

  const notices = `${message ? `<div class="notice">${esc(message)}</div>` : ''}${error ? `<div class="notice notice-error">${esc(error)}</div>` : ''}`;
  const script = view === 'accounts' && selectedTestId && selectedTestId !== 'legacy-all-accounts'
    ? `<script>(()=>{const picker=document.querySelector('#available-account-picker'),showPicker=document.querySelector('[data-show-account-picker]'),hidePicker=document.querySelector('[data-hide-account-picker]'),checks=()=>document.querySelectorAll('[data-available-student]');showPicker?.addEventListener('click',()=>{picker.hidden=false;showPicker.hidden=true});hidePicker?.addEventListener('click',()=>{picker.hidden=true;showPicker.hidden=false});document.querySelectorAll('[data-select-all]').forEach(control=>control.addEventListener(control.type==='checkbox'?'change':'click',()=>{const checked=control.type==='checkbox'?control.checked:true;checks().forEach(input=>{input.checked=checked});document.querySelectorAll('[data-select-all]').forEach(item=>{if(item.type==='checkbox')item.checked=checked})}));const table=document.querySelector('#subject-progress');if(!table)return;const refresh=async()=>{if(document.hidden)return;try{const response=await fetch('/admin/progress',{method:'POST',headers:{'Accept':'application/json'}});if(!response.ok)return;const data=await response.json();const rows=new Map(data.rows.filter(row=>row.test_id===${JSON.stringify(selectedTestId)}).map(row=>[row.username,row]));table.querySelectorAll('tbody tr[data-student]').forEach(tr=>{const row=rows.get(tr.dataset.student);if(!row)return;tr.querySelector('[data-field="status"]').textContent=row.status;tr.querySelector('[data-field="attempts"]').textContent=row.attempt_count+' / '+(row.max_attempts===0?'∞':row.max_attempts);tr.querySelector('[data-field="score"]').textContent=row.score;tr.querySelector('[data-field="violations"]').textContent=row.violations||0;});}catch(_){}};refresh();setInterval(refresh,3000);})()</script>`
    : view === 'legacy-progress-view' ? `<script>const hidden=(form,name,value)=>{const input=document.createElement('input');input.type='hidden';input.name=name;input.value=String(value);form.append(input)};const remove=(testId,username)=>{const form=document.createElement('form');form.method='post';form.action='/admin/action';form.className='inline-form';form.onsubmit=()=>confirm('Bạn có chắc muốn xóa tiến độ này?');hidden(form,'action','attempt_delete');hidden(form,'test_id',testId);hidden(form,'username',username);hidden(form,'view','${esc(view)}');const button=document.createElement('button');button.className='delete-btn';button.textContent='Xóa tiến độ';form.append(button);return form};setInterval(async()=>{try{const data=await(await fetch('/admin/progress',{method:'POST'})).json(),body=document.querySelector('#progress tbody');if(body){body.replaceChildren(...data.rows.map(row=>{const tr=document.createElement('tr');[row.test,row.name,row.status,row.attempt_count+' / '+(row.max_attempts===0?'∞':row.max_attempts),row.score,row.violations].forEach(value=>{const td=document.createElement('td');td.textContent=String(value);tr.append(td)});const action=document.createElement('td');if(row.attempt_count)action.append(remove(row.test_id,row.username));tr.append(action);return tr}))}}catch(error){}},5000)</script>` : '';

  const bodyHtml = `
<div class="page-title-row">
  <h1 class="page-title">Quản trị hệ thống</h1>
  <span class="role-badge">Quản trị viên</span>
</div>
<p class="page-subtitle">Quản lý môn thi, học sinh, giao đề thi trực tuyến và theo dõi tiến độ.</p>
${notices}
${tabNav}
${content}
${script}`;

  return page('Quản trị hệ thống', name, bodyHtml);
}

module.exports = { esc, loginPage, page, renderAdmin };
