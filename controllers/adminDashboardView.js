const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const esc = (s = "") =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const hidden = (name, value) =>
  `<input type="hidden" name="${esc(name)}" value="${esc(value)}">`;

function getInitials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return String(name[0] || "?").toUpperCase();
}

function loginPage(error = "") {
  return fs
    .readFileSync(path.join(__dirname, "..", "public", "login.html"), "utf8")
    .replace(
      "{{ERROR}}",
      error
        ? `<div class="notice notice-error" role="alert">${esc(error)}</div>`
        : "",
    );
}

function page(title, name, body) {
  return fs
    .readFileSync(path.join(__dirname, "..", "public", "layout.html"), "utf8")
    .replace("{{TITLE}}", esc(title))
    .replace("{{NAME}}", esc(name))
    .replace("{{BODY}}", body);
}

function removeForm(action, fields, label = "Xóa", cls = "delete-btn") {
  return `<form method="post" action="/admin/action" class="inline-form" onsubmit="return confirm('Bạn có chắc muốn xóa?')">${hidden("action", action)}${Object.entries(
    fields,
  )
    .map(([k, v]) => hidden(k, v))
    .join("")}<button class="${cls}">${label}</button></form>`;
}

function studentCard(s, tests = []) {
  const initials = getInitials(s.ho_ten || s.ten_dang_nhap);
  const enrolledTests = tests.filter((t) =>
    (t.danh_sach_hoc_sinh || []).includes(s.ten_dang_nhap),
  );
  const enrolledBadge = enrolledTests.length
    ? `<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:12px;background:#e0f2fe;color:#0369a1;font-size:11px;font-weight:600;margin-top:2px;">${enrolledTests.length} môn: ${enrolledTests.map((t) => esc(t.tieu_de)).join(", ")}</span>`
    : `<span style="color:var(--muted);font-size:11px;">Chưa gán môn</span>`;

  const testOptions = tests
    .map((t) => `<option value="${esc(t._id)}">${esc(t.tieu_de)}</option>`)
    .join("");

  return `
<div class="student-card">
  <div class="student-card-top">
    <div class="student-avatar">${initials}</div>
    <div class="student-name-block">
      <div class="student-name">${esc(s.ho_ten || s.ten_dang_nhap)}</div>
      <div class="student-ten_dang_nhap">👤 ${esc(s.ten_dang_nhap)}</div>
    </div>
    <span class="status-live-badge">Hoạt động</span>
  </div>
  <div class="detail-grid">
    <div class="detail-item">
      <span class="detail-label">NGÀY SINH</span>
      <span class="detail-value">${esc(s.ngay_sinh || "—")}</span>
    </div>
    <div class="detail-item">
      <span class="detail-label">MÔN THI ĐÃ GÁN</span>
      <div class="detail-value" style="font-size:12px;line-height:1.4;">${enrolledBadge}</div>
    </div>
  </div>
  <div style="margin:10px 0;padding:8px;background:var(--canvas);border-radius:8px;border:1px solid var(--line);">
    <form method="post" action="/admin/action" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
      ${hidden("action", "assign_subject")}
      ${hidden("ten_dang_nhap_hoc_sinh", s.ten_dang_nhap)}
      <select name="ma_ky_thi" required style="flex:1;min-width:140px;min-height:34px;padding:4px 8px;font-size:12px;border-radius:6px;border:1px solid var(--line);background:#fff;">
        <option value="">+ Gán vào môn thi...</option>
        ${tests.length ? '<option value="all">⭐ Tất cả các môn đang mở</option>' : ""}
        ${testOptions}
      </select>
      <button type="submit" style="min-height:34px;padding:4px 12px;font-size:12px;border-radius:6px;">Gán</button>
    </form>
  </div>
  <div class="card-actions">
    ${removeForm("student_trash", { ten_dang_nhap: s.ten_dang_nhap }, "🗑️ Xóa", "delete-btn")}
  </div>
</div>`;
}

function progressRows(progress) {
  if (!progress.length)
    return '<tr><td colspan="7" class="empty-state">Chưa có dữ liệu làm bài.</td></tr>';
  return progress
    .map(
      (item) =>
        `<tr><td>${esc(item.test)}</td><td>${esc(item.name)}</td><td>${esc(item.status)}</td><td>${item.attempt_count} / ${item.so_luot_lam_toi_da === 0 ? "∞" : item.so_luot_lam_toi_da}</td><td>${esc(item.diem)}</td><td>${item.so_lan_roi_trang || 0}</td><td>${item.attempt_count ? removeForm("attempt_delete", { ma_ky_thi: item.ma_ky_thi, ten_dang_nhap: item.ten_dang_nhap, view: "exams" }, "Xóa tiến độ", "delete-btn") : ""}</td></tr>`,
    )
    .join("");
}

function testRows(tests, view) {
  if (!tests.length)
    return '<tr><td colspan="7" class="empty-state">Chưa có kỳ thi nào.</td></tr>';
  return tests
    .map((test) => {
      const qCount = test.tong_cau_hoi || (test.danh_sach_cau_hoi || []).length;
      const qps = test.so_cau_moi_hoc_sinh || qCount;
      const studentCount = (test.danh_sach_hoc_sinh || []).length;
      return `<tr>
      <td><a href="/admin?view=accounts&amp;ma_ky_thi=${encodeURIComponent(String(test._id))}"><strong>${esc(test.tieu_de)}</strong></a><br><small style="color:var(--muted)">${studentCount} học sinh được gán</small></td>
      <td>${new Date(test.bat_dau_luc * 1000).toLocaleString("vi-VN")}</td>
      <td>${test.khong_han_nop ? "Không giới hạn" : new Date(test.ket_thuc_luc * 1000).toLocaleString("vi-VN")}</td>
      <td>${Number(test.thoi_luong_phut)} phút</td>
      <td>${qps} / ${qCount} câu${test.dao_de ? " (Đảo đề)" : ""}</td>
      <td>${test.so_luot_lam_toi_da === 0 ? "Vô số (∞)" : (test.so_luot_lam_toi_da ?? 1)}</td>
      <td style="display:flex;gap:6px;align-items:center;">
        <a class="edit-btn" href="/admin?view=accounts&amp;ma_ky_thi=${encodeURIComponent(String(test._id))}">Chi tiết</a>
        ${removeForm("test_delete", { ma_ky_thi: test._id, view }, "🗑️ Xóa", "delete-btn")}
      </td>
    </tr>`;
    })
    .join("");
}

function vocabCard(v) {
  const wordCount = v.tu_vung?.length || v.tong_tu_vung || 0;
  const studentCount = (v.danh_sach_hoc_sinh || []).length;
  return `<a class="subject-card" href="/admin?view=accounts&amp;vocab_id=${encodeURIComponent(String(v._id))}"><span class="subject-card-icon">📖</span><span class="subject-card-body"><strong>${esc(v.tieu_de)}</strong><small>${esc(v.ngon_ngu || "Ngoại ngữ")} · ${esc(v.cap_do || "Cơ bản")}</small><em>${wordCount} từ vựng · ${studentCount} học sinh</em></span><span class="subject-card-arrow">›</span></a>`;
}

function renderAdmin({
  name,
  students,
  trash,
  tests,
  progress,
  vocabSets = [],
  selectedVocabId = "",
  view,
  selectedTestId = "",
  message,
  error,
}) {
  const current = Math.floor(Date.now() / 1000);
  const activeTests = tests.filter((test) => Number(test.ket_thuc_luc) >= current);
  const finishedTests = tests.filter((test) => Number(test.ket_thuc_luc) < current);

  const tabs = [
    ["accounts", "👥 Môn học & học sinh", students.length],
    ["exams", "📝 Giao đề & Kỳ thi", activeTests.length],
    ["finished-exams", "✅ Đã kết thúc", finishedTests.length],
    ["vocab", "📖 Luyện từ vựng", vocabSets.length],
  ];

  const tabNav = `<div class="tab-nav">${tabs.map(([key, label, count]) => `<button class="tab-btn${view === key ? " active" : ""}" onclick="location.href='/admin?view=${key}'">${label}${count !== null ? `<span class="tab-count">${count}</span>` : ""}</button>`).join("")}</div>`;

  const testSelectOptions = tests
    .map((t) => `<option value="${esc(t._id)}">${esc(t.tieu_de)}</option>`)
    .join("");

  let content = "";

  if (view === "accounts") {
    const selectedTest = tests.find(
      (test) => String(test._id) === selectedTestId,
    );
    const selectedVocab = vocabSets.find(
      (v) => String(v._id) === selectedVocabId,
    );

    if (selectedVocab) {
      const vocabStudents = students.filter((student) =>
        (selectedVocab.danh_sach_hoc_sinh || []).includes(student.ten_dang_nhap),
      );
      const availableStudents = students.filter(
        (student) =>
          !(selectedVocab.danh_sach_hoc_sinh || []).includes(student.ten_dang_nhap),
      );

      const memberTools = `<div class="grid" style="margin-bottom:16px">
        <section class="card">
          <h2>Thêm học sinh vào bộ từ vựng</h2>
          <form method="post" action="/admin/action">
            ${hidden("action", "vocab_student_manual")}
            ${hidden("vocab_id", selectedVocab._id)}
            <label>Họ tên học sinh</label>
            <input name="ho_ten" required>
            <label>Ngày sinh</label>
            <input name="ngay_sinh" type="date" required>
            <button>Thêm vào bộ từ</button>
          </form>
        </section>
        <section class="card">
          <h2>Nhập danh sách Excel</h2>
          <form method="post" action="/admin/action" enctype="multipart/form-data">
            ${hidden("action", "vocab_students_excel")}
            ${hidden("vocab_id", selectedVocab._id)}
            <label>Tệp Excel .xlsx</label>
            <input type="file" name="sheet" accept=".xlsx" required>
            <p class="card-intro">Cột A: STT · Cột B: họ tên/tên đăng nhập · Cột C: ngày sinh.</p>
            <button>Nhập vào bộ từ</button>
          </form>
        </section>
      </div>`;

      const existingAccounts = availableStudents.length
        ? `<section class="card" style="margin-bottom:16px">
            <div class="section-heading">
              <div>
                <h2>Thêm tài khoản có sẵn</h2>
                <p class="card-intro">Mở danh sách rồi chọn các học sinh cần gán vào bộ từ vựng này.</p>
              </div>
              <button type="button" data-show-account-picker>Thêm tài khoản có sẵn (${availableStudents.length})</button>
            </div>
            <form method="post" action="/admin/action" id="available-account-picker" hidden>
              ${hidden("action", "vocab_assign")}
              ${hidden("vocab_id", selectedVocab._id)}
              <div class="table-wrap">
                <table>
                  <thead><tr><th><input type="checkbox" aria-label="Chọn tất cả" data-select-all></th><th>Họ tên</th><th>Ngày sinh</th></tr></thead>
                  <tbody>${availableStudents.map((student) => `<tr><td><input type="checkbox" name="ten_dang_nhap_hoc_sinh" value="${esc(student.ten_dang_nhap)}" data-available-student></td><td>${esc(student.ho_ten || student.ten_dang_nhap)}</td><td>${esc(student.ngay_sinh || "")}</td></tr>`).join("")}</tbody>
                </table>
              </div>
              <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
                <button type="button" class="button-secondary" data-select-all>Thêm tất cả</button>
                <button type="submit">Thêm học sinh đã chọn</button>
                <button type="button" class="button-secondary" data-hide-account-picker>Đóng danh sách</button>
              </div>
            </form>
          </section>`
        : "";

      const studentRows = vocabStudents.length
        ? vocabStudents
            .map(
              (s, idx) =>
                `<tr><td>${idx + 1}</td><td>${esc(s.ho_ten || s.ten_dang_nhap)}</td><td>${esc(s.ten_dang_nhap)}</td><td>${esc(s.ngay_sinh || "—")}</td><td>${removeForm("vocab_student_remove", { vocab_id: selectedVocab._id, ten_dang_nhap: s.ten_dang_nhap }, "Xóa khỏi bộ", "delete-btn")}</td></tr>`,
            )
            .join("")
        : '<tr><td colspan="5" class="empty-state">Chưa có học sinh nào được gán vào bộ từ vựng này.</td></tr>';

      const wordRows = (selectedVocab.tu_vung || [])
        .map(
          (w, idx) =>
            `<tr><td>${idx + 1}</td><td><strong>${esc(w.tu)}</strong></td><td><code style="color:var(--primary);">${esc(w.phien_am || "—")}</code></td><td>${esc(w.nghia)}</td></tr>`,
        )
        .join("");

      content = `
        <div class="section-header">
          <div>
            <p class="section-title">${esc(selectedVocab.tieu_de)}</p>
            <p class="section-sub"><span class="vocab-badge-lang">${esc(selectedVocab.ngon_ngu)}</span> <span class="vocab-badge-cap_do">${esc(selectedVocab.cap_do)}</span> · ${selectedVocab.tu_vung?.length || 0} từ vựng · ${vocabStudents.length} học sinh được gán</p>
          </div>
          <a class="add-btn" href="/admin?view=accounts">← Danh sách môn thi &amp; từ vựng</a>
        </div>
        ${memberTools}
        ${existingAccounts}
        <div class="card" style="margin-bottom:16px;">
          <h2 style="font-size:16px;margin-bottom:12px;">👥 Danh sách học sinh được ôn luyện (${vocabStudents.length})</h2>
          <div class="table-wrap">
            <table>
              <thead><tr><th>STT</th><th>Họ tên</th><th>Tên đăng nhập</th><th>Ngày sinh</th><th>Thao tác</th></tr></thead>
              <tbody>${studentRows}</tbody>
            </table>
          </div>
        </div>
        <div class="card">
          <h2 style="font-size:16px;margin-bottom:12px;">📖 Danh sách từ vựng trong bộ (${selectedVocab.tu_vung?.length || 0} từ)</h2>
          <div class="table-wrap">
            <table>
              <thead><tr><th>STT</th><th>Từ vựng</th><th>Phiên âm</th><th>Tiếng Việt (Nghĩa)</th></tr></thead>
              <tbody>${wordRows || '<tr><td colspan="4" class="empty-state">Chưa có từ vựng.</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      `;
    } else if (selectedTestId === "legacy-all-accounts") {
      const accountRows = students.length
        ? students
            .map(
              (student) =>
                `<tr><td>${esc(student.ho_ten || student.ten_dang_nhap)}</td><td>${esc(student.ten_dang_nhap)}</td><td>${esc(student.ngay_sinh || "")}</td></tr>`,
            )
            .join("")
        : '<tr><td colspan="3" class="empty-state">Chưa có tài khoản học sinh.</td></tr>';
      content = `<div class="section-header"><div><p class="section-title">Tài khoản riêng</p><p class="section-sub">Tạo tài khoản trước, sau đó có thể gán toàn bộ vào một môn thi.</p></div><a class="add-btn" href="/admin?view=accounts">← Danh sách môn thi</a></div><div class="card" style="margin-bottom:16px"><div style="display:flex;gap:10px;flex-wrap:wrap"><a class="button" href="/admin?view=add-account">+ Thêm tài khoản</a><a class="button button-secondary" href="/admin?view=import-accounts">Nhập từ Excel</a></div><form method="post" action="/admin/action" style="margin-top:18px;display:flex;gap:10px;align-items:end;flex-wrap:wrap">${hidden("action", "assign_subject")}${hidden("ten_dang_nhap_hoc_sinh", "__ALL__")}<div style="min-width:260px;flex:1"><label>Gán tất cả ${students.length} tài khoản vào môn thi</label><select name="ma_ky_thi" required><option value="">-- Chọn môn thi --</option>${testSelectOptions}</select></div><button type="submit">Gán tất cả vào môn</button></form></div><div class="card"><div class="table-wrap"><table><thead><tr><th>Họ tên</th><th>Tên đăng nhập</th><th>Ngày sinh</th></tr></thead><tbody>${accountRows}</tbody></table></div></div>`;
    } else if (selectedTest) {
      const rows = progress.filter(
        (item) => item.ma_ky_thi === String(selectedTest._id),
      );
      const availableStudents = students.filter(
        (student) =>
          !(selectedTest.danh_sach_hoc_sinh || []).includes(student.ten_dang_nhap),
      );
      const tableRows = rows.length
        ? rows
            .map(
              (item, index) =>
                `<tr data-student="${esc(item.ten_dang_nhap)}"><td>${index + 1}</td><td>${esc(item.name)}</td><td>${esc(item.ten_dang_nhap)}</td><td data-field="status">${esc(item.status)}</td><td data-field="attempts">${item.attempt_count} / ${item.so_luot_lam_toi_da === 0 ? "∞" : item.so_luot_lam_toi_da}</td><td data-field="diem">${esc(item.diem)}</td><td data-field="so_lan_roi_trang">${item.so_lan_roi_trang || 0}</td><td>${removeForm("subject_student_remove", { ten_dang_nhap: item.ten_dang_nhap, ma_ky_thi: selectedTest._id, ma_ky_thi_quay_lai: selectedTest._id }, "Xóa khỏi môn", "delete-btn")}</td></tr>`,
            )
            .join("")
        : '<tr><td colspan="8" class="empty-state">Chưa có học sinh được gán vào môn thi này.</td></tr>';
      const memberTools = `<div class="grid" style="margin-bottom:16px"><section class="card"><h2>Thêm học sinh vào môn</h2><form method="post" action="/admin/action">${hidden("action", "student_manual")}${hidden("ma_ky_thi", selectedTest._id)}${hidden("ma_ky_thi_quay_lai", selectedTest._id)}<label>Họ tên học sinh</label><input name="ho_ten" required><label>Ngày sinh</label><input name="ngay_sinh" type="date" required><button>Thêm vào môn</button></form></section><section class="card"><h2>Nhập danh sách Excel</h2><form method="post" action="/admin/action" enctype="multipart/form-data">${hidden("action", "students")}${hidden("ma_ky_thi", selectedTest._id)}${hidden("ma_ky_thi_quay_lai", selectedTest._id)}<label>Tệp Excel .xlsx</label><input type="file" name="sheet" accept=".xlsx" required><p class="card-intro">Cột A: STT · Cột B: họ tên/tên đăng nhập · Cột C: ngày sinh.</p><button>Nhập vào môn</button></form></section></div>`;
      const existingAccounts = availableStudents.length
        ? `<section class="card" style="margin-bottom:16px"><div class="section-heading"><div><h2>Thêm tài khoản có sẵn</h2><p class="card-intro">Mở danh sách rồi chọn các học sinh cần gán vào môn này.</p></div><button type="button" data-show-account-picker>Thêm tài khoản có sẵn (${availableStudents.length})</button></div><form method="post" action="/admin/action" id="available-account-picker" hidden>${hidden("action", "assign_subject")}${hidden("ma_ky_thi", selectedTest._id)}${hidden("ma_ky_thi_quay_lai", selectedTest._id)}<div class="table-wrap"><table><thead><tr><th><input type="checkbox" aria-label="Chọn tất cả" data-select-all></th><th>Họ tên</th><th>Ngày sinh</th></tr></thead><tbody>${availableStudents.map((student) => `<tr><td><input type="checkbox" name="ten_dang_nhap_hoc_sinh" value="${esc(student.ten_dang_nhap)}" data-available-student></td><td>${esc(student.ho_ten || student.ten_dang_nhap)}</td><td>${esc(student.ngay_sinh || "")}</td></tr>`).join("")}</tbody></table></div><div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="button-secondary" data-select-all>Thêm tất cả</button><button type="submit">Thêm học sinh đã chọn</button><button type="button" class="button-secondary" data-hide-account-picker>Đóng danh sách</button></div></form></section>`
        : `<section class="card" style="margin-bottom:16px"><div class="empty-state">Tất cả tài khoản học sinh hiện có đã được thêm vào môn này.</div></section>`;
      const removeAllStudents = rows.length
        ? `<form method="post" action="/admin/action" style="margin:0 0 14px" onsubmit="return confirm('Xóa toàn bộ học sinh khỏi môn này và xóa các lượt làm liên quan?')">${hidden("action", "subject_students_remove_all")}${hidden("ma_ky_thi", selectedTest._id)}<button type="submit" class="button-danger">Xóa tất cả học sinh của môn</button></form>`
        : "";
      content = `<div class="section-header"><div><p class="section-title">${esc(selectedTest.mon_hoc || selectedTest.tieu_de)}</p><p class="section-sub">${esc(selectedTest.tieu_de)} · Tiến độ làm bài của ${rows.length} học sinh</p></div><a class="add-btn" href="/admin?view=accounts">← Danh sách môn thi</a></div>${memberTools}${existingAccounts}<div class="card">${removeAllStudents}<div class="table-wrap"><table id="mon_hoc-progress"><thead><tr><th>STT</th><th>Họ tên</th><th>Tên đăng nhập</th><th>Trạng thái</th><th>Lượt làm</th><th>Điểm</th><th>Rời trang</th><th></th></tr></thead><tbody>${tableRows}</tbody></table></div></div>`;
    } else {
      const subjectCards = tests
        .map((test) => {
          const enrolled = students.filter((student) =>
            (test.danh_sach_hoc_sinh || []).includes(student.ten_dang_nhap),
          ).length;
          const ended = Number(test.ket_thuc_luc) < current;
          return `<a class="subject-card" href="/admin?view=accounts&amp;ma_ky_thi=${encodeURIComponent(String(test._id))}"><span class="subject-card-icon">📚</span><span class="subject-card-body"><strong>${esc(test.mon_hoc || test.tieu_de)}</strong><small>${esc(test.tieu_de)}</small><em>${enrolled} học sinh${ended ? " · Đã kết thúc" : ""}</em></span><span class="subject-card-arrow">›</span></a>`;
        })
        .join("");
      const vocabSliderCards = vocabSets.map((v) => vocabCard(v)).join("");
      content = `
        <div class="section-header"><div><p class="section-title">Danh sách môn thi</p><p class="section-sub">Chọn một môn để thêm học sinh, nhập Excel và xem tiến độ.</p></div></div>
        <div class="subject-grid" style="margin-bottom:28px;">${subjectCards || '<div class="card"><div class="empty-state">Chưa có môn thi nào. Hãy tạo kỳ thi trước.</div></div>'}</div>
        <div class="section-header"><div><p class="section-title">Danh sách ôn từ vựng</p><p class="section-sub">Chọn một bộ từ vựng để thêm học sinh và quản lý danh sách.</p></div></div>
        <div class="subject-grid">${vocabSliderCards || '<div class="card"><div class="empty-state">Chưa có bộ từ vựng nào.</div></div>'}</div>
      `;
    }
  } else if (view === "legacy-accounts") {
    const selectedTest = tests.find(
      (test) => String(test._id) === selectedTestId,
    );
    const isUnassigned = selectedTestId === "unassigned";
    if (selectedTest || isUnassigned) {
      const subjectStudents = isUnassigned
        ? students.filter(
            (student) =>
              !tests.some((test) =>
                (test.danh_sach_hoc_sinh || []).includes(student.ten_dang_nhap),
              ),
          )
        : students.filter((student) =>
            (selectedTest.danh_sach_hoc_sinh || []).includes(student.ten_dang_nhap),
          );
      const heading = isUnassigned
        ? "Học sinh chưa gán môn thi"
        : selectedTest.mon_hoc || selectedTest.tieu_de;
      const description = isUnassigned
        ? "Các tài khoản này chưa được gán vào bất kỳ môn thi nào."
        : `${selectedTest.tieu_de} · ${subjectStudents.length} học sinh được gán`;
      content = `<div class="section-header"><div><p class="section-title">${esc(heading)}</p><p class="section-sub">${esc(description)}</p></div><a class="add-btn" href="/admin?view=accounts">← Danh sách môn thi</a></div><div class="search-row"><div class="search-wrap"><span class="search-icon">🔍</span><input class="search-input" type="search" placeholder="Tìm họ tên, tài khoản..." oninput="filterSubjectStudents(this.value)"></div></div><div id="student-list">${subjectStudents.length ? subjectStudents.map((student) => studentCard(student, tests)).join("") : '<div class="card"><div class="empty-state">Chưa có học sinh trong môn thi này.</div></div>'}</div><script>function filterSubjectStudents(query){const text=query.toLowerCase();document.querySelectorAll('#student-list .student-card').forEach(card=>card.style.display=card.textContent.toLowerCase().includes(text)?'':'none')}</script>`;
    } else {
      const subjectCards = tests
        .map((test) => {
          const enrolled = students.filter((student) =>
            (test.danh_sach_hoc_sinh || []).includes(student.ten_dang_nhap),
          ).length;
          const ended = Number(test.ket_thuc_luc) < current;
          return `<a class="subject-card" href="/admin?view=accounts&amp;ma_ky_thi=${encodeURIComponent(String(test._id))}"><span class="subject-card-icon">📚</span><span class="subject-card-body"><strong>${esc(test.mon_hoc || test.tieu_de)}</strong><small>${esc(test.tieu_de)}</small><em>${enrolled} học sinh${ended ? " · Đã kết thúc" : ""}</em></span><span class="subject-card-arrow">›</span></a>`;
        })
        .join("");
      const unassigned = students.filter(
        (student) =>
          !tests.some((test) =>
            (test.danh_sach_hoc_sinh || []).includes(student.ten_dang_nhap),
          ),
      ).length;
      content = `<div class="section-header"><div><p class="section-title">Danh sách môn thi</p><p class="section-sub">Chọn một môn thi để xem danh sách tài khoản học sinh.</p></div><a class="add-btn" href="/admin?view=add-account">+ Thêm mới</a></div><div class="subject-grid">${subjectCards || '<div class="card"><div class="empty-state">Chưa có môn thi nào. Hãy tạo kỳ thi trước.</div></div>'}${unassigned ? `<a class="subject-card subject-card-muted" href="/admin?view=accounts&amp;ma_ky_thi=unassigned"><span class="subject-card-icon">👥</span><span class="subject-card-body"><strong>Chưa gán môn</strong><small>Tài khoản chưa thuộc môn thi nào</small><em>${unassigned} học sinh</em></span><span class="subject-card-arrow">›</span></a>` : ""}</div>`;
    }
  } else if (view === "legacy-accounts") {
    const cards = students.length
      ? students.map((s) => studentCard(s, tests)).join("")
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
      ${hidden("action", "assign_subject")}
      ${hidden("ten_dang_nhap_hoc_sinh", "__ALL__")}
      <select name="ma_ky_thi" required style="min-height:38px;padding:6px 12px;border-radius:8px;font-size:13px;background:#fff;">
        <option value="">-- Chọn môn thi --</option>
        ${tests.length ? '<option value="all">⭐ Tất cả các kỳ thi đang mở</option>' : ""}
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
    ${hidden("action", "students")}
    ${hidden("view", "exams")}
    <div class="form-grid">
      <div><label>Môn thi</label><select name="ma_ky_thi" required><option value="">-- Chọn môn thi --</option>${testSelectOptions}</select></div>
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
  } else if (view === "trash") {
    content = `
<div class="section-header"><div><p class="section-title">Thùng rác</p><p class="section-sub">${trash.length} tài khoản đã xóa</p></div></div>
<div class="card">
  <div class="table-wrap">
    <table><thead><tr><th>Họ tên</th><th>Ngày sinh</th><th>Thao tác</th></tr></thead><tbody>
    ${trash.map((s) => `<tr><td>${esc(s.ho_ten || s.ten_dang_nhap)}</td><td>${esc(s.ngay_sinh || "")}</td><td><form method="post" action="/admin/action">${hidden("action", "student_restore")}${hidden("ten_dang_nhap", s.ten_dang_nhap)}${hidden("view", "trash")}<button class="edit-btn">↩️ Khôi phục</button></form></td></tr>`).join("") || '<tr><td colspan="3" class="empty-state">Thùng rác đang trống.</td></tr>'}
    </tbody></table>
  </div>
</div>`;
  } else if (view === "add-account") {
    content = `
<div class="card" style="max-width:680px;margin:0 auto 20px;">
  <h2 style="font-size:18px;margin-bottom:6px;">➕ Thêm học sinh thủ công</h2>
  <p style="color:var(--muted);font-size:13px;margin:0 0 18px">Tên đăng nhập được tạo từ họ tên; mật khẩu đăng nhập của học sinh là ngày sinh.</p>
  <form method="post" action="/admin/action">${hidden("action", "student_manual")}
    <label>Họ tên học sinh</label>
    <input name="ho_ten" placeholder="Ví dụ: Đặng Ngọc Thảo Phương" required>
    
    <label>Ngày sinh (dùng làm mật khẩu đăng nhập)</label>
    <input name="ngay_sinh" type="date" required>

    <label>Gán vào môn thi (tùy chọn)</label>
    <select name="ma_ky_thi">
      <option value="">-- Chưa gán môn (có thể gán sau) --</option>
      ${tests.length ? '<option value="all">⭐ Gán vào tất cả các môn đang mở</option>' : ""}
      ${testSelectOptions}
    </select>
    
    <div style="margin-top:20px;display:flex;gap:10px;">
      <button type="submit">💾 Lưu tài khoản</button>
      <a class="button button-secondary" href="/admin?view=accounts">Quay lại danh sách</a>
    </div>
  </form>
</div>`;
  } else if (view === "import-accounts") {
    content = `
<div class="card" style="max-width:680px;margin:0 auto 20px;">
  <h2 style="font-size:18px;margin-bottom:6px;">📋 Nhập danh sách học sinh từ Excel</h2>
  <p style="color:var(--muted);font-size:13px;margin:0 0 18px">File Excel gồm <strong>Cột A:</strong> Họ tên / Tên đăng nhập; <strong>Cột B:</strong> Ngày sinh (YYYY-MM-DD hoặc DD/MM/YYYY).</p>
  <form method="post" action="/admin/action" enctype="multipart/form-data">${hidden("action", "students")}
    <label>Chọn tệp Excel .xlsx danh sách học sinh</label>
    <input type="file" name="sheet" accept=".xlsx" required>

    <label>Gán toàn bộ danh sách vừa nhập vào môn thi nào:</label>
    <select name="ma_ky_thi">
      <option value="">-- Chỉ tạo tài khoản, chưa gán môn thi --</option>
      ${tests.length ? '<option value="all">⭐ Gán vào TẤT CẢ môn thi đang mở</option>' : ""}
      ${testSelectOptions}
    </select>

    <div style="margin-top:20px;display:flex;gap:10px;">
      <button type="submit">📋 Tiến hành nhập dữ liệu</button>
      <a class="button button-secondary" href="/admin?view=accounts">Quay lại danh sách</a>
    </div>
  </form>
</div>`;
  } else if (view === "finished-exams") {
    content = `
<div class="section-header"><div><p class="section-title">Kỳ thi đã kết thúc</p><p class="section-sub">Các kỳ thi quá thời hạn làm bài.</p></div></div>
<div class="card">
  <div class="table-wrap">
    <table><thead><tr><th>Tên kỳ thi / Môn</th><th>Bắt đầu</th><th>Kết thúc</th><th>Thời lượng</th><th>Số câu / Đề</th><th>Lượt tối đa</th><th>Thao tác</th></tr></thead>
    <tbody>${testRows(finishedTests, "finished-exams")}</tbody>
    </table>
  </div>
</div>`;
  } else if (view === "vocab") {
    const vocabListRows = vocabSets
      .map(
        (v, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td><strong><a href="/admin?view=accounts&amp;vocab_id=${encodeURIComponent(String(v._id))}">${esc(v.tieu_de)}</a></strong></td>
        <td><span class="vocab-badge-lang">${esc(v.ngon_ngu || "Ngoại ngữ")}</span></td>
        <td><span class="vocab-badge-cap_do">${esc(v.cap_do || "Cơ bản")}</span></td>
        <td><strong>${v.tu_vung?.length || v.tong_tu_vung || 0}</strong> từ</td>
        <td><strong>${(v.danh_sach_hoc_sinh || []).length}</strong> học sinh</td>
        <td>${v.tao_luc ? new Date(v.tao_luc * 1000).toLocaleDateString("vi-VN") : "—"}</td>
        <td style="display:flex;gap:6px;align-items:center;">
          <a class="edit-btn" href="/admin?view=accounts&amp;vocab_id=${encodeURIComponent(String(v._id))}">Chi tiết</a>
          ${removeForm("vocab_delete", { vocab_id: v._id, view: "vocab" }, "🗑️ Xóa", "delete-btn")}
        </td>
      </tr>
    `,
      )
      .join("");

    content = `
<div class="card" style="margin-bottom:24px;">
  <div style="border-bottom:1px solid var(--line);padding-bottom:14px;margin-bottom:18px;">
    <h2 style="font-size:18px;margin:0 0 4px;color:var(--ink);">📖 Thêm bộ từ vựng &amp; Giao cho học sinh</h2>
    <p style="margin:0;font-size:13px;color:var(--muted);">Nhập từ vựng kèm phiên âm và nghĩa tiếng Việt từ file Excel, phân loại theo ngôn ngữ / cấp độ.</p>
  </div>

  <form method="post" action="/admin/action" enctype="multipart/form-data">
    ${hidden("action", "vocab_create")}
    ${hidden("view", "vocab")}
    ${hidden("submission_key", crypto.randomUUID())}

    <div class="form-grid" style="margin-bottom:12px;">
      <div>
        <label>Tên ngôn ngữ <span style="color:var(--danger)">*</span></label>
        <input name="ngon_ngu" placeholder="VD: Tiếng Anh, Tiếng Nhật, Tiếng Hàn..." required>
      </div>
      <div>
        <label>Cấp độ <span style="color:var(--danger)">*</span></label>
        <input name="cap_do" placeholder="VD: A1, A2, B1, B2, C1, N5, N4, HSK 1..." required>
      </div>
    </div>

    <div class="form-grid" style="margin-bottom:12px;">
      <div>
        <label>📂 Tệp Excel từ vựng (.xlsx) <span style="color:var(--danger)">*</span></label>
        <input name="vocab_sheet" type="file" accept=".xlsx" required>
        <p style="margin:4px 0 0;font-size:12px;color:var(--muted);">Cột A: STT · Cột B: Từ vựng · Cột C: Phiên âm · Cột D: Tiếng Việt (nghĩa từ vựng)</p>
      </div>
      <div>
        <label>👥 Danh sách học sinh Excel .xlsx</label>
        <input name="students_sheet" type="file" accept=".xlsx">
        <p style="margin:4px 0 0;font-size:12px;color:var(--muted);">Không bắt buộc — cột A: STT, cột B: họ tên/tên đăng nhập, cột C: ngày sinh.</p>
      </div>
    </div>

    <div style="margin-top:20px;display:flex;gap:12px;align-items:center;">
      <button type="submit" style="padding:10px 24px;font-size:14px;">🚀 Xác nhận tạo &amp; Giao bộ từ vựng</button>
    </div>
  </form>
</div>

<div class="section-header">
  <div>
    <p class="section-title">📋 Danh sách các bộ từ vựng đã tạo</p>
    <p class="section-sub">Tổng số ${vocabSets.length} bộ từ vựng trong hệ thống.</p>
  </div>
</div>

<div class="card">
  <div class="table-wrap">
    <table>
      <thead>
        <tr><th>STT</th><th>Tên bộ từ vựng</th><th>Ngôn ngữ</th><th>Cấp độ</th><th>Số từ</th><th>Học sinh</th><th>Ngày tạo</th><th>Thao tác</th></tr>
      </thead>
      <tbody>
        ${vocabListRows || '<tr><td colspan="8" class="empty-state">Chưa có bộ từ vựng nào. Hãy điền biểu mẫu ở trên để tạo mới.</td></tr>'}
      </tbody>
    </table>
  </div>
</div>`;
  } else if (view === "legacy-progress-view") {
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
    ${hidden("action", "test")}
    ${hidden("view", "exams")}
    ${hidden("submission_key", crypto.randomUUID())}
    
    <div class="form-grid" style="margin-bottom:12px;">
      <div>
        <label>Môn thi / Tên kỳ thi <span style="color:var(--danger)">*</span></label>
        <input name="tieu_de" placeholder="VD: Toán 12 - Kiểm tra 1 tiết" required>
      </div>
      <div>
        <label>Tên môn học (phân loại)</label>
        <input name="mon_hoc" placeholder="VD: Toán học, Tiếng Anh...">
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
        <input name="so_cau_moi_hoc_sinh" type="number" min="1" placeholder="VD: 40 (trích xuất từ file đề)" required>
      </div>
      <div>
        <label>🔄 Giới hạn số lượt làm bài <span style="color:var(--danger)">*</span></label>
        <select name="so_luot_lam_toi_da" required>
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
        <input type="checkbox" name="khong_han_nop" value="1" style="width:18px;height:18px;">
        <span><strong>Không đặt hạn nộp</strong> — học sinh có thể làm bài sau thời gian bắt đầu; mỗi lượt vẫn giới hạn theo số phút làm bài.</span>
      </label>
    </div>

    <div style="margin:16px 0;padding:12px 16px;background:var(--canvas);border-radius:var(--r-md);border:1px solid var(--line);">
      <label style="display:inline-flex;align-items:center;gap:10px;cursor:pointer;margin:0;">
        <input type="checkbox" name="dao_de" value="1" checked style="width:18px;height:18px;">
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
      <tbody>${testRows(activeTests, "exams")}</tbody>
    </table>
  </div>
</div>
`;
  }

  const notices = `${message ? `<div class="notice">${esc(message)}</div>` : ""}${error ? `<div class="notice notice-error">${esc(error)}</div>` : ""}`;
  const script =
    view === "accounts" &&
    (selectedTestId || selectedVocabId) &&
    selectedTestId !== "legacy-all-accounts"
      ? `<script>(()=>{const picker=document.querySelector('#available-account-picker'),showPicker=document.querySelector('[data-show-account-picker]'),hidePicker=document.querySelector('[data-hide-account-picker]'),checks=()=>document.querySelectorAll('[data-available-student]');showPicker?.addEventListener('click',()=>{picker.hidden=false;showPicker.hidden=true});hidePicker?.addEventListener('click',()=>{picker.hidden=true;showPicker.hidden=false});document.querySelectorAll('[data-select-all]').forEach(control=>control.addEventListener(control.type==='checkbox'?'change':'click',()=>{const checked=control.type==='checkbox'?control.checked:true;checks().forEach(input=>{input.checked=checked});document.querySelectorAll('[data-select-all]').forEach(item=>{if(item.type==='checkbox')item.checked=checked})}));const table=document.querySelector('#mon_hoc-progress');if(!table)return;const refresh=async()=>{if(document.hidden)return;try{const response=await fetch('/admin/progress',{method:'POST',headers:{'Accept':'application/json'}});if(!response.ok)return;const data=await response.json();const rows=new Map(data.rows.filter(row=>row.ma_ky_thi===${JSON.stringify(selectedTestId)}).map(row=>[row.ten_dang_nhap,row]));table.querySelectorAll('tbody tr[data-student]').forEach(tr=>{const row=rows.get(tr.dataset.student);if(!row)return;tr.querySelector('[data-field="status"]').textContent=row.status;tr.querySelector('[data-field="attempts"]').textContent=row.attempt_count+' / '+(row.so_luot_lam_toi_da===0?'∞':row.so_luot_lam_toi_da);tr.querySelector('[data-field="diem"]').textContent=row.diem;tr.querySelector('[data-field="so_lan_roi_trang"]').textContent=row.so_lan_roi_trang||0;});}catch(_){}};refresh();setInterval(refresh,3000);})()</script>`
      : view === "legacy-progress-view"
        ? `<script>const hidden=(form,name,value)=>{const input=document.createElement('input');input.type='hidden';input.name=name;input.value=String(value);form.append(input)};const remove=(testId,ten_dang_nhap)=>{const form=document.createElement('form');form.method='post';form.action='/admin/action';form.className='inline-form';form.onsubmit=()=>confirm('Bạn có chắc muốn xóa tiến độ này?');hidden(form,'action','attempt_delete');hidden(form,'ma_ky_thi',testId);hidden(form,'ten_dang_nhap',ten_dang_nhap);hidden(form,'view','${esc(view)}');const button=document.createElement('button');button.className='delete-btn';button.textContent='Xóa tiến độ';form.append(button);return form};setInterval(async()=>{try{const data=await(await fetch('/admin/progress',{method:'POST'})).json(),body=document.querySelector('#progress tbody');if(body){body.replaceChildren(...data.rows.map(row=>{const tr=document.createElement('tr');[row.test,row.name,row.status,row.attempt_count+' / '+(row.so_luot_lam_toi_da===0?'∞':row.so_luot_lam_toi_da),row.diem,row.so_lan_roi_trang].forEach(value=>{const td=document.createElement('td');td.textContent=String(value);tr.append(td)});const action=document.createElement('td');if(row.attempt_count)action.append(remove(row.ma_ky_thi,row.ten_dang_nhap));tr.append(action);return tr}))}}catch(error){}},5000)</script>`
        : "";

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

  return page("Quản trị hệ thống", name, bodyHtml);
}

module.exports = { esc, loginPage, page, renderAdmin };
