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
  $('student-info-display').textContent = `${session.hs.hoTen} · ${session.hs.lop}`;
  document.body.classList.add('in-exam');
  show('section-exam'); active = true;
  renderNavGrid(); renderQuestion(0); tick(); timerId = setInterval(tick, 500);
}

function tick() {
  const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
  $('timer-text').textContent = fmtTime(left);
  $('exam-timer').classList.toggle('warn', left <= 300 && left > 60);
  $('exam-timer').classList.toggle('danger', left <= 60);
  if (left <= 0 && !submitting) submitExam(true);
}

/* ---------- Cảnh báo rời màn hình ---------- */
document.addEventListener('visibilitychange', () => {
  if (!active) return;
  if (document.hidden) tabCount++;
  else { const w = $('tab-warn'); w.textContent = `CẢNH BÁO: Bạn đã rời khỏi màn hình làm bài ${tabCount} lần. Ban tổ chức có thể xem xét các trường hợp bất thường.`; w.classList.remove('d-none'); }
});
window.addEventListener('beforeunload', e => { if (active) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- Hiển thị câu hỏi ---------- */
const subOk = () => /^\d+$/.test(String(duDoan).trim());
function renderNavGrid() {
  const grid = $('nav-grid'); grid.innerHTML = '';
  layout.forEach((l, i) => {
    const b = el('button', 'nav-q-btn' + (ans[l.id] ? ' done' : '') + (i === idx ? ' current' : ''));
    b.type = 'button'; b.textContent = i + 1; b.onclick = () => renderQuestion(i); grid.appendChild(b);
  });
  const sb = el('button', 'nav-sub-btn' + (subOk() ? ' done' : '') + (idx === layout.length ? ' current' : ''));
  sb.type = 'button'; sb.innerHTML = '<i class="fa-solid fa-circle-question me-2"></i>Câu hỏi phụ'; sb.onclick = renderSubQuestion; grid.appendChild(sb);
}
function choose(i, o) { const l = layout[i]; ans[l.id] = o; save(); renderQuestion(i); }
function renderQuestion(i) {
  idx = i; const l = layout[i], q = byId[l.id], box = $('question-box'); box.innerHTML = '';
  const card = el('div', 'question-card'), tag = el('div', 'q-tag'), h = el('h5', 'q-title');
  tag.textContent = `Câu ${i + 1} / ${layout.length}`; h.textContent = q.q;
  card.append(tag, h);
  l.opts.forEach((o, k) => {
    const b = el('button', 'opt-btn' + (ans[l.id] === o ? ' selected' : '')), s = el('span', 'opt-letter'), t = el('span', 'opt-text'), c = el('i', 'fa-solid fa-circle-check opt-check');
    b.type = 'button'; s.textContent = 'ABCD'[k]; t.textContent = q.o[o]; b.append(s, t, c);
    b.onclick = () => choose(i, o);
    card.appendChild(b);
  });
  box.appendChild(card); renderNavGrid(); updateProgress();
}
function renderSubQuestion() {
  idx = layout.length; const box = $('question-box'); box.innerHTML = '';
  const card = el('div', 'question-card'), tag = el('div', 'q-tag sub'), h = el('h5', 'q-title'), inp = el('input', 'form-control form-control-lg'), hint = el('div', 'small text-muted mt-2');
  tag.innerHTML = '<i class="fa-solid fa-lightbulb me-1"></i>Câu hỏi phụ dự đoán'; h.textContent = phuText;
  inp.type = 'number'; inp.min = 0; inp.step = 1; inp.value = duDoan; inp.placeholder = 'Nhập một số nguyên, ví dụ: 125'; inp.style.maxWidth = '320px';
  inp.oninput = () => { duDoan = inp.value; save(); renderNavGrid(); updateProgress(); };
  hint.textContent = 'Chỉ nhập số nguyên không âm. Bỏ trống sẽ được tính là 0.';
  card.append(tag, h, inp, hint); box.appendChild(card); renderNavGrid(); updateProgress();
}
const nextQuestion = () => idx < layout.length - 1 ? renderQuestion(idx + 1) : renderSubQuestion();
const prevQuestion = () => { if (idx > 0) renderQuestion(idx - 1); };
function updateProgress() {
  const done = Object.keys(ans).length + (subOk() ? 1 : 0), tot = layout.length + 1, pct = Math.round(done / tot * 100);
  $('exam-progress-bar').style.width = pct + '%'; $('answered-text').textContent = done + '/' + tot; $('pct-text').textContent = pct + '%';
}
document.addEventListener('keydown', e => {
  if (!active || submitting || e.target.tagName === 'INPUT' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'ArrowRight') nextQuestion();
  else if (e.key === 'ArrowLeft') prevQuestion();
  else if (idx < layout.length) { const k = 'abcd'.indexOf(e.key.toLowerCase()); if (k >= 0 && e.key.length === 1) choose(idx, layout[idx].opts[k]); }
});

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
      active = false; document.body.classList.remove('in-exam'); try { localStorage.removeItem(draftKey()); } catch {}
      $('r-dung').textContent = r.soCauDung; $('r-tong').textContent = r.tong; $('r-time').textContent = fmtTime(r.thoiGian);
      show('section-result'); window.scrollTo(0, 0); return;
    } catch (e) {
      $('sub-msg').textContent = e.app ? 'Lỗi: ' + e.message + ' - đang thử lại...' : 'Mất kết nối, đang thử nộp lại (bài làm của bạn vẫn được giữ)...';
      await sleep(3000);
    }
  }
}

/* ---------- Bảng xếp hạng & In bằng ---------- */
async function showRankings() {
  show('section-rankings'); clearInterval(rankTimer);
  await loadRankings(); rankTimer = setInterval(() => { if (!document.hidden) loadRankings(); }, RANKING_REFRESH_MS);
}
async function loadRankings() {
  const tbody = $('ranking-table-body');
  try {
    const d = await api('ranking');
    
    // Kiểm tra an toàn khi bảng xếp hạng đang bị khóa/ẩn đối với thí sinh
    if (d.locked) {
      $('rank-badge').textContent = '🔒 Bảng xếp hạng đang tạm ẩn theo yêu cầu của Ban tổ chức.';
      tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4">Kết quả chưa được công bố. Vui lòng quay lại sau.</td></tr>`;
      const box = $('class-box');
      if (box) box.classList.add('d-none');
      return;
    }

    rankRows = d.rows || []; 
    classRows = d.lop || []; 
    renderClassBox();
    
    $('rank-badge').textContent = (d.finalized ? '✔ Kết quả chính thức' : '⏳ Kết quả tạm thời') + ` - ${d.total} bài đã nộp, hiển thị top ${rankRows.length}. Cập nhật ${new Date(d.updated).toLocaleTimeString('vi-VN')}`;
    
    tbody.innerHTML = rankRows.map((r, i) => `<tr class="${r.hang <= 3 ? 'top' + r.hang : ''}">
      <td><span class="rank-chip ${r.hang <= 3 ? 'r' + r.hang : ''}">${r.hang}</span></td>
      <td><b>${esc(r.ma)}</b></td><td>${esc(r.hoTen)}</td><td>${esc(r.lop)}</td>
      <td><b class="text-success">${r.dung}/30</b></td><td>${r.tg}s</td><td>${r.du}</td>
      <td><span class="badge bg-warning text-dark fw-bold">${esc(r.giai || 'Chưa tính')}</span></td>
      <td><button class="btn btn-sm btn-outline-primary" data-i="${i}"><i class="fa-solid fa-print me-1"></i>In Bằng</button></td></tr>`).join('')
      || `<tr><td colspan="9" class="text-center text-muted">Chưa có dữ liệu xếp hạng.</td></tr>`;
  } catch (e) { 
    tbody.innerHTML = `<tr><td colspan="9" class="text-danger text-center">${esc(e.message)}</td></tr>`; 
  }
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
  
  // Trì hoãn 300ms để QR Code render xong xuôi mới bật hộp thoại in
  setTimeout(() => {
    window.print();
  }, 300);
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
  
  setTimeout(() => {
    window.print();
  }, 300);
}
