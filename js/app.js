const $ = id => document.getElementById(id);
const el = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
const SECTIONS = ['section-login', 'section-exam', 'section-result', 'section-rankings'];
const show = id => SECTIONS.forEach(s => $(s).classList.toggle('d-none', s !== id));

let session = null, questions = [], byId = {}, layout = [], ans = {}, duDoan = '', phuText = '';
let idx = 0, total = 1800, endAt = 0, timerId = null, submitting = false, active = false, tabCount = 0;
let rankRows = [], classRows = [], rankTimer = null;
const draftKey = () => 'draft_' + session.hs.ma;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const save = () => { try { localStorage.setItem(draftKey(), JSON.stringify({ layout, ans, du: duDoan })); } catch {} };

/* ---------- Đăng nhập + bắt đầu thi ---------- */
$('form-login').onsubmit = async e => {
  e.preventDefault();
  const box = $('login-alert'), btn = $('btn-login'), old = btn.innerHTML;
  box.classList.add('d-none'); btn.disabled = true; btn.textContent = 'Đang kiểm tra...';
  try {
    session = await api('login', { ma: $('login-code').value, mk: $('login-pass').value });
    begin(await api('start', { token: session.token }, 3));
  } catch (err) {
    box.textContent = err.message; box.classList.remove('d-none');
  } finally { btn.disabled = false; btn.innerHTML = old; }
};

function begin(d) {
  questions = d.questions; phuText = d.phu; total = d.total;
  byId = {}; questions.forEach(q => byId[q.id] = q);
  let draft = null; try { draft = JSON.parse(localStorage.getItem(draftKey())); } catch {}
  const resumed = d.remaining < d.total - 20;   // vừa bắt đầu => bỏ qua nháp cũ
  const ok = resumed && draft && draft.layout.length === questions.length && draft.layout.every(l => byId[l.id]);
  if (ok) { layout = draft.layout; ans = draft.ans || {}; duDoan = draft.du || ''; }
  else { layout = shuffle(questions.map(q => ({ id: q.id, opts: shuffle(['A', 'B', 'C', 'D']) }))); ans = {}; duDoan = ''; save(); }
  endAt = Date.now() + d.remaining * 1000;      // thời gian còn lại do server tính
  $('student-info-display').textContent = `Thí sinh: ${session.hs.hoTen} (${session.hs.lop})`;
  show('section-exam'); active = true;
  renderNavGrid(); renderQuestion(0); tick(); timerId = setInterval(tick, 500);
}

function tick() {
  const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
  $('exam-timer').textContent = fmtTime(left);
  if (left <= 0 && !submitting) submitExam(true);
}

/* ---------- Cảnh báo rời màn hình (không dùng alert) ---------- */
document.addEventListener('visibilitychange', () => {
  if (!active) return;
  if (document.hidden) tabCount++;
  else { const w = $('tab-warn'); w.textContent = `CẢNH BÁO: Bạn đã rời khỏi màn hình làm bài ${tabCount} lần. Ban tổ chức có thể xem xét các trường hợp bất thường.`; w.classList.remove('d-none'); }
});
window.addEventListener('beforeunload', e => { if (active) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- Hiển thị câu hỏi ---------- */
function renderNavGrid() {
  const grid = $('nav-grid'); grid.innerHTML = '';
  layout.forEach((l, i) => {
    const b = el('button', 'btn nav-q-btn ' + (ans[l.id] ? 'btn-success text-white' : 'btn-outline-secondary') + (i === idx ? ' border-3 border-primary' : ''));
    b.type = 'button'; b.textContent = i + 1; b.onclick = () => renderQuestion(i); grid.appendChild(b);
  });
  const sb = el('button', 'btn nav-q-btn w-100 mt-2 ' + (/^\d+$/.test(String(duDoan).trim()) ? 'btn-primary text-white' : 'btn-outline-primary'));
  sb.type = 'button'; sb.textContent = 'Câu phụ'; sb.onclick = renderSubQuestion; grid.appendChild(sb);
}
function renderQuestion(i) {
  idx = i; const l = layout[i], q = byId[l.id], box = $('question-box'); box.innerHTML = '';
  const card = el('div', 'question-card'), h = el('h5', 'fw-bold'), wrap = el('div', 'mt-3');
  h.textContent = `Câu ${i + 1}: ${q.q}`;
  l.opts.forEach((o, k) => {
    const b = el('button', 'opt-btn' + (ans[l.id] === o ? ' selected' : '')), s = el('b');
    b.type = 'button'; s.textContent = 'ABCD'[k] + '.'; b.append(s, ' ' + q.o[o]);
    b.onclick = () => { ans[l.id] = o; save(); renderNavGrid(); renderQuestion(i); };
    wrap.appendChild(b);
  });
  card.append(h, wrap); box.appendChild(card); renderNavGrid(); updateProgress();
}
function renderSubQuestion() {
  idx = layout.length; const box = $('question-box'); box.innerHTML = '';
  const card = el('div', 'question-card'), h = el('h5', 'fw-bold text-primary'), p = el('p', 'fs-6'), inp = el('input', 'form-control form-control-lg mt-3');
  h.textContent = 'CÂU HỎI PHỤ DỰ ĐOÁN'; p.textContent = phuText;
  inp.type = 'number'; inp.min = 0; inp.step = 1; inp.value = duDoan; inp.placeholder = 'Nhập một số nguyên (ví dụ: 125)';
  inp.oninput = () => { duDoan = inp.value; save(); renderNavGrid(); updateProgress(); };
  card.append(h, p, inp); box.appendChild(card); renderNavGrid(); updateProgress();
}
const nextQuestion = () => idx < layout.length - 1 ? renderQuestion(idx + 1) : renderSubQuestion();
const prevQuestion = () => { if (idx > 0) renderQuestion(idx - 1); };
function updateProgress() {
  const done = Object.keys(ans).length + (/^\d+$/.test(String(duDoan).trim()) ? 1 : 0);
  $('exam-progress-bar').style.width = Math.round(done / (layout.length + 1) * 100) + '%';
}

/* ---------- Nộp bài ---------- */
function confirmSubmit() {
  const miss = layout.length - Object.keys(ans).length;
  const bad = !/^\d+$/.test(String(duDoan).trim());
  if (confirm((miss ? `Bạn còn ${miss} câu chưa trả lời. ` : '') + (bad ? 'Câu hỏi phụ chưa có số nguyên hợp lệ (tính là 0). ' : '') + 'Bạn có chắc chắn muốn nộp bài thi không?')) submitExam(false);
}
async function submitExam(auto) {
  if (submitting) return; submitting = true; clearInterval(timerId);
  const box = $('question-box'); box.innerHTML = '';
  const msg = el('div', 'text-center py-5'); msg.innerHTML = '<div class="spinner-border text-primary mb-3"></div><h5 id="sub-msg">' + (auto ? 'Hết giờ, đang nộp bài...' : 'Đang nộp bài...') + '</h5>';
  box.appendChild(msg);
  const du = /^\d+$/.test(String(duDoan).trim()) ? Number(duDoan) : 0;
  for (;;) {
    try {
      const r = await api('submit', { token: session.token, answers: ans, duDoan: du }, 4);
      active = false; try { localStorage.removeItem(draftKey()); } catch {}
      $('r-dung').textContent = r.soCauDung; $('r-tong').textContent = r.tong; $('r-time').textContent = fmtTime(r.thoiGian);
      show('section-result'); window.scrollTo(0, 0); return;
    } catch (e) {
      $('sub-msg').textContent = e.app ? 'Lỗi: ' + e.message + ' - đang thử lại...' : 'Mất kết nối, đang thử nộp lại (bài làm của bạn vẫn được giữ)...';
      await sleep(3000);
    }
  }
}

/* ---------- Bảng xếp hạng ---------- */
async function showRankings() {
  show('section-rankings'); clearInterval(rankTimer);
  await loadRankings(); rankTimer = setInterval(() => { if (!document.hidden) loadRankings(); }, RANKING_REFRESH_MS);
}
async function loadRankings() {
  const tbody = $('ranking-table-body');
  try {
    const d = await api('ranking'); rankRows = d.rows; classRows = d.lop || []; renderClassBox();
    $('rank-badge').textContent = (d.finalized ? '✔ Kết quả chính thức' : '⏳ Kết quả tạm thời') + ` - ${d.total} bài đã nộp, hiển thị top ${d.rows.length}. Cập nhật ${new Date(d.updated).toLocaleTimeString('vi-VN')}`;
    tbody.innerHTML = rankRows.map((r, i) => `<tr>
      <td><span class="badge ${r.hang <= 3 ? 'bg-danger' : 'bg-secondary'} fs-6">${r.hang}</span></td>
      <td><b>${esc(r.ma)}</b></td><td>${esc(r.hoTen)}</td><td>${esc(r.lop)}</td>
      <td><b class="text-success">${r.dung}/30</b></td><td>${r.tg}s</td><td>${r.du}</td>
      <td><span class="badge bg-warning text-dark fw-bold">${esc(r.giai || 'Chưa tính')}</span></td>
      <td><button class="btn btn-sm btn-outline-primary" data-i="${i}"><i class="fa-solid fa-print me-1"></i>In Bằng</button></td></tr>`).join('');
  } catch (e) { tbody.innerHTML = `<tr><td colspan="9" class="text-danger text-center">${esc(e.message)}</td></tr>`; }
}
$('ranking-table-body').addEventListener('click', e => {
  const b = e.target.closest('button[data-i]'); if (b) printCertificate(rankRows[b.dataset.i]);
});

async function triggerAppScriptRankings() {
  const key = prompt('Nhập khóa quản trị để tổng kết và trao giải:');
  if (!key) return;
  try { const r = await api('admin_finalize', { key }); alert(`Đã tổng kết, trao giải cho ${r.winners.length} thí sinh.`); loadRankings(); }
  catch (e) { alert(e.message); }
}

function printCertificate(r) {
  if (!r || !r.giai) { alert('Thí sinh này chưa có kết quả xếp giải!'); return; }
  const award = r.giai.split(' - ')[0];
  $('cert-name').textContent = r.hoTen; $('cert-class').textContent = r.lop; $('cert-award').textContent = award;
  $('cert-date').textContent = CERT_DATE;
  const qr = $('cert-qr'); qr.innerHTML = '';
  new QRCode(qr, { text: `XAC NHAN: ${r.hoTen} - Lop ${r.lop} - Dat ${award} Cuoc thi Phap Luat 2026`, width: 90, height: 90 });
  window.print();
}

function renderClassBox() {
  const box = $('class-box');
  if (!classRows.length) { box.classList.add('d-none'); return; }
  box.classList.remove('d-none');
  const w = classRows[0];
  $('class-winner').innerHTML = `<span><i class="fa-solid fa-people-group me-2"></i>Lớp dẫn đầu: <b>${esc(w.lop)}</b> - ${w.soHS} thí sinh (${w.tyLe}% sĩ số), TB ${w.tbDung}/30 câu, ${w.tbTg}s</span>` +
    (w.giai ? `<span class="badge bg-warning text-dark">${esc(w.giai)}</span><button class="btn btn-sm btn-outline-primary" id="btn-cert-class"><i class="fa-solid fa-print me-1"></i>In bằng khen tập thể</button>` : '');
  $('class-body').innerHTML = classRows.slice(0, 10).map(c => `<tr><td><b>${c.hang}</b></td><td>${esc(c.lop)}</td><td>${c.soHS}/${c.siSo}</td><td>${c.tyLe}%</td><td>${c.tbDung}</td><td>${c.tbTg}s</td></tr>`).join('');
}
$('class-box').addEventListener('click', e => { if (e.target.closest('#btn-cert-class')) printClassCertificate(classRows[0]); });
function printClassCertificate(c) {
  if (!c || !c.giai) return;
  const award = c.giai.split(' - ')[0];
  $('cert-name').textContent = 'Tập thể lớp ' + c.lop; $('cert-class').textContent = c.lop; $('cert-award').textContent = award;
  $('cert-date').textContent = CERT_DATE;
  const qr = $('cert-qr'); qr.innerHTML = '';
  new QRCode(qr, { text: `XAC NHAN: Tap the lop ${c.lop} - Dat ${award} Cuoc thi Phap Luat 2026`, width: 90, height: 90 });
  window.print();
}
