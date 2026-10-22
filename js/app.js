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
  const resumed = d.remaining < d.total - 20;   
  const ok = resumed && draft && draft.layout && Array.isArray(draft.layout) && draft.layout.length === questions.length && draft.layout.every(l => byId[l.id]);
  if (ok) { layout = draft.layout; ans = draft.ans || {}; duDoan = draft.du || ''; }
  else { layout = shuffle(questions.map(q => ({ id: q.id, opts: shuffle(['A', 'B', 'C', 'D']) }))); ans = {}; duDoan = ''; save(); }
  endAt = Date.now() + d.remaining * 1000;      
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

/* ---------- Bảng xếp hạng & Xuất file PDF bằng khen ---------- */
async function showRankings() {
  show('section-rankings'); clearInterval(rankTimer);
  await loadRankings(); rankTimer = setInterval(() => { if (!document.hidden) loadRankings(); }, RANKING_REFRESH_MS);
}

async function loadRankings() {
  const tbody = $('ranking-table-body');
  try {
    const adminKey = sessionStorage.getItem('adminKey') || '';
    const d = await api('ranking', { key: adminKey });
    
    if (!d || d.locked) {
      $('rank-badge').textContent = '🔒 Bảng xếp hạng đang tạm ẩn theo yêu cầu của Ban tổ chức.';
      tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4">Kết quả chưa được công bố. Vui lòng quay lại sau.</td></tr>`;
      const box = $('class-box');
      if (box) box.classList.add('d-none');
      return;
    }

    rankRows = Array.isArray(d.rows) ? d.rows : []; 
    classRows = Array.isArray(d.lop) ? d.lop : []; 
    renderClassBox();
    
    const total = d.total !== undefined ? d.total : rankRows.length;
    const updatedStr = d.updated ? new Date(d.updated).toLocaleTimeString('vi-VN') : '';
    const isFin = !!d.finalized;

    $('rank-badge').textContent = (isFin ? '✔ Kết quả chính thức' : '⏳ Kết quả tạm thời') + ` - ${total} bài đã nộp, hiển thị top ${rankRows.length}. Cập nhật ${updatedStr}`;
    
    if (rankRows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4">Chưa có dữ liệu xếp hạng.</td></tr>`;
      return;
    }

    tbody.innerHTML = rankRows.map((r, i) => {
      const hang = r && r.hang ? r.hang : (i + 1);
      const ma = r && r.ma ? r.ma : '';
      const hoTen = r && r.hoTen ? r.hoTen : '';
      const lop = r && r.lop ? r.lop : '';
      const dung = (r && r.dung !== undefined) ? r.dung : 0;
      const tg = (r && r.tg !== undefined) ? r.tg : 0;
      const du = (r && r.du !== undefined) ? r.du : 0;
      const giai = r && r.giai ? r.giai : 'Chưa tính';
      const topClass = hang <= 3 ? 'top' + hang : '';
      const chipClass = hang <= 3 ? 'r' + hang : '';

      return `<tr class="${topClass}">
        <td><span class="rank-chip ${chipClass}">${hang}</span></td>
        <td><b>${esc(ma)}</b></td><td>${esc(hoTen)}</td><td>${esc(lop)}</td>
        <td><b class="text-success">${dung}/30</b></td><td>${tg}s</td><td>${du}</td>
        <td><span class="badge bg-warning text-dark fw-bold">${esc(giai)}</span></td>
        <td><button class="btn btn-sm btn-outline-primary" data-i="${i}"><i class="fa-solid fa-file-pdf me-1"></i>Tải PDF</button></td></tr>`;
    }).join('');

  } catch (e) { 
    tbody.innerHTML = `<tr><td colspan="9" class="text-danger text-center">Lỗi tải dữ liệu: ${esc(e.message)}</td></tr>`; 
  }
}

$('ranking-table-body').addEventListener('click', e => {
  const b = e.target.closest('button[data-i]'); 
  if (b && rankRows && rankRows[b.dataset.i]) {
    printCertificate(rankRows[b.dataset.i], b);
  }
});

async function triggerAppScriptRankings() {
  const key = prompt('Nhập khóa quản trị để tổng kết và trao giải:');
  if (!key) return;
  try { 
    const r = await api('admin_finalize', { key }); 
    alert(`Đã tổng kết, trao giải cho ${r.winners ? r.winners.length : 0} thí sinh.`); 
    loadRankings(); 
  } catch (e) { 
    alert(e.message); 
  }
}

function printCertificate(r, btn) {
  if (!r || !r.giai) { alert('Thí sinh này chưa có kết quả xếp giải!'); return; }
  const oldText = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>Đang tạo...'; }

  const award = r.giai.split(' - ')[0];
  $('cert-name').textContent = r.hoTen || ''; 
  $('cert-class').textContent = r.lop || ''; 
  $('cert-award').textContent = award;
  $('cert-date').textContent = CERT_DATE;
  const qr = $('cert-qr'); qr.innerHTML = '';
  new QRCode(qr, { text: `XAC NHAN: ${r.hoTen || ''} - Lop ${r.lop || ''} - Dat ${award} Cuoc thi Phap Luat 2026`, width: 90, height: 90 });
  
  const element = $('certificate-print-area');
  element.style.display = 'block';
  element.style.position = 'fixed';
  element.style.left = '-9999px';

  const opt = {
    margin:       0,
    filename:     `GiayChungNhan_${(r.hoTen || 'ThiSinh').replace(/\s+/g, '_')}_${r.lop || ''}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true },
    jsPDF:        { unit: 'px', format: [1000, 700], orientation: 'landscape' }
  };

  setTimeout(() => {
    html2pdf().set(opt).from(element).save().then(() => {
      element.style.display = 'none';
      if (btn) { btn.disabled = false; btn.innerHTML = oldText; }
    }).catch(err => {
      alert('Có lỗi khi tạo PDF: ' + err.message);
      element.style.display = 'none';
      if (btn) { btn.disabled = false; btn.innerHTML = oldText; }
    });
  }, 500);
}

function renderClassBox() {
  const box = $('class-box');
  if (!box) return;
  if (!Array.isArray(classRows) || classRows.length === 0) { 
    box.classList.add('d-none'); 
    return; 
  }
  box.classList.remove('d-none');
  const w = classRows[0] || {};
  const winnerLop = w.lop || '';
  const winnerSoHS = w.soHS || 0;
  const winnerSiSo = w.siSo || 0;
  const winnerTyLe = w.tyLe || 0;
  const winnerTbDung = w.tbDung || 0;
  const winnerTbTg = w.tbTg || 0;
  const winnerGiai = w.giai || '';

  const winnerEl = $('class-winner');
  if (winnerEl) {
    winnerEl.innerHTML = `<span><i class="fa-solid fa-people-group me-2"></i>Lớp dẫn đầu: <b>${esc(winnerLop)}</b> - ${winnerSoHS} thí sinh (${winnerTyLe}% sĩ số), TB ${winnerTbDung}/30 câu, ${winnerTbTg}s</span>` +
      (winnerGiai ? `<span class="badge bg-warning text-dark me-2">${esc(winnerGiai)}</span><button class="btn btn-sm btn-outline-primary" id="btn-cert-class"><i class="fa-solid fa-file-pdf me-1"></i>Tải PDF tập thể</button>` : '');
  }

  const bodyEl = $('class-body');
  if (bodyEl) {
    bodyEl.innerHTML = classRows.slice(0, 10).map(c => {
      if (!c) return '';
      return `<tr><td><b>${c.hang || ''}</b></td><td>${esc(c.lop || '')}</td><td>${c.soHS || 0}/${c.siSo || 0}</td><td>${c.tyLe || 0}%</td><td>${c.tbDung || 0}</td><td>${c.tbTg || 0}s</td></tr>`;
    }).join('');
  }
}

$('class-box').addEventListener('click', e => { 
  const btn = e.target.closest('#btn-cert-class');
  if (btn && classRows && classRows[0]) {
    printClassCertificate(classRows[0], btn);
  }
});

function printClassCertificate(c, btn) {
  if (!c || !c.giai) return;
  const oldText = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>Đang tạo...'; }

  const award = c.giai.split(' - ')[0];
  $('cert-name').textContent = 'Tập thể lớp ' + (c.lop || ''); 
  $('cert-class').textContent = c.lop || ''; 
  $('cert-award').textContent = award;
  $('cert-date').textContent = CERT_DATE;
  const qr = $('cert-qr'); qr.innerHTML = '';
  new QRCode(qr, { text: `XAC NHAN: Tap the lop ${c.lop || ''} - Dat ${award} Cuoc thi Phap Luat 2026`, width: 90, height: 90 });
  
  const element = $('certificate-print-area');
  element.style.display = 'block';
  element.style.position = 'fixed';
  element.style.left = '-9999px';

  const opt = {
    margin:       0,
    filename:     `GiayKhen_TapThe_Lop_${c.lop || ''}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true },
    jsPDF:        { unit: 'px', format: [1000, 700], orientation: 'landscape' }
  };

  setTimeout(() => {
    html2pdf().set(opt).from(element).save().then(() => {
      element.style.display = 'none';
      if (btn) { btn.disabled = false; btn.innerHTML = oldText; }
    }).catch(err => {
      alert('Có lỗi khi tạo PDF: ' + err.message);
      element.style.display = 'none';
      if (btn) { btn.disabled = false; btn.innerHTML = oldText; }
    });
  }, 500);
}
