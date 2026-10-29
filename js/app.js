const $ = id => document.getElementById(id);
const el = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
const SECTIONS = ['section-login', 'section-exam', 'section-result', 'section-rankings', 'section-mycert'];
const show = id => SECTIONS.forEach(s => { const n = $(s); if (n) n.classList.toggle('d-none', s !== id); });   // bỏ qua section thiếu, tránh làm dừng cả luồng thi

/* Mã thiết bị ngẫu nhiên (lưu trong trình duyệt) để ban tổ chức rà soát trường hợp một máy thi cho nhiều tài khoản */
function deviceId() {
  try {
    let d = localStorage.getItem('dev_id');
    if (!d) { d = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (String(Math.random()).slice(2) + Date.now()); localStorage.setItem('dev_id', d); }
    return d.slice(0, 40);
  } catch (e) { return window.__dev || (window.__dev = 'tmp-' + Math.random().toString(36).slice(2)); }
}
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
    session = await api('login', { ma: $('login-code').value, mk: $('login-pass').value, dev: deviceId() });
    if (session.done) { await showMyCert(); return; }   // đã thi xong: chỉ vào để tải giấy chứng nhận của mình
    begin(await api('start', { token: session.token, dev: deviceId() }, 3));
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
  document.body.classList.add('in-exam'); document.documentElement.style.overscrollBehaviorY = 'contain';
  show('section-exam'); active = true;
  try { renderNavGrid(); renderQuestion(0); }
  catch (err) { console.error(err); $('question-box').innerHTML = '<div class="alert alert-danger">Không hiển thị được câu hỏi (' + esc(err.message) + '). Vui lòng tải lại trang (F5) rồi đăng nhập lại - thời gian làm bài vẫn được giữ.</div>'; }
  tick(); timerId = setInterval(tick, 500);
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


/* ---------- Giao diện điện thoại ---------- */
const isMobile = () => window.matchMedia ? window.matchMedia('(max-width: 991.98px)').matches : window.innerWidth < 992;
function toggleSheet(open) { document.body.classList.toggle('sheet-open', !!open); }
function mobileNext() { if (idx >= layout.length) confirmSubmit(); else nextQuestion(); }   // ở câu phụ, nút "Tiếp" thành "Nộp bài"
function updateBar() {
  const last = idx >= layout.length, done = Object.keys(ans).length;
  $('m-pos').textContent = last ? 'Câu hỏi phụ' : `Câu ${idx + 1}/${layout.length}`;
  $('m-done').textContent = `(đã làm ${done})`;
  $('m-next-label').textContent = last ? 'Nộp bài' : 'Tiếp';
  $('m-next-ico').className = 'ms-2 fa-solid ' + (last ? 'fa-paper-plane' : 'fa-arrow-right');
  $('m-bar').querySelector('.m-prev').disabled = idx <= 0;
  $('m-bar').querySelector('.m-next').classList.toggle('btn-gov', last);
  $('m-bar').querySelector('.m-next').classList.toggle('btn-primary', !last);
}
function scrollToQuestion() { if (isMobile()) $('question-box').scrollIntoView({ block: 'start' }); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') toggleSheet(false); });

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
  box.appendChild(card); renderNavGrid(); updateProgress(); toggleSheet(false); scrollToQuestion();
}
function renderSubQuestion() {
  idx = layout.length; const box = $('question-box'); box.innerHTML = '';
  const card = el('div', 'question-card'), tag = el('div', 'q-tag sub'), h = el('h5', 'q-title'), inp = el('input', 'form-control form-control-lg'), hint = el('div', 'small text-muted mt-2');
  tag.innerHTML = '<i class="fa-solid fa-lightbulb me-1"></i>Câu hỏi phụ dự đoán'; h.textContent = phuText;
  inp.type = 'number'; inp.inputMode = 'numeric'; inp.min = 0; inp.step = 1; inp.value = duDoan; inp.placeholder = 'Nhập một số nguyên, ví dụ: 125'; inp.style.maxWidth = '320px';
  inp.oninput = () => { duDoan = inp.value; save(); renderNavGrid(); updateProgress(); };
  hint.textContent = 'Chỉ nhập số nguyên không âm. Bỏ trống sẽ được tính là 0.';
  card.append(tag, h, inp, hint); box.appendChild(card); renderNavGrid(); updateProgress(); toggleSheet(false); scrollToQuestion();
}
const nextQuestion = () => idx < layout.length - 1 ? renderQuestion(idx + 1) : renderSubQuestion();
const prevQuestion = () => { if (idx > 0) renderQuestion(idx - 1); };
function updateProgress() {
  const done = Object.keys(ans).length + (subOk() ? 1 : 0), tot = layout.length + 1, pct = Math.round(done / tot * 100);
  $('exam-progress-bar').style.width = pct + '%'; $('answered-text').textContent = done + '/' + tot; $('pct-text').textContent = pct + '%'; updateBar();
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
      const r = await api('submit', { token: session.token, answers: ans, duDoan: du, dev: deviceId(), tab: tabCount, scr: screen.width + 'x' + screen.height, ua: navigator.userAgent.slice(0, 160) }, 4);
      active = false; toggleSheet(false); document.documentElement.style.overscrollBehaviorY = ''; document.body.classList.remove('in-exam'); try { localStorage.removeItem(draftKey()); } catch {}
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

/* ---------- Xuất giấy chứng nhận PDF ---------- */
// Không dùng html2pdf nữa (chụp DOM hay ra trang trắng). Giấy được VẼ trực tiếp lên canvas rồi đóng gói thành PDF 1 trang.
// QR chỉ chứa chuỗi ngắn, không dấu: qrcodejs báo "code length overflow" với chuỗi dài / tiếng Việt có dấu.
const toAscii = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\x20-\x7E]/g, '');
const CERT_FONT = '"Be Vietnam Pro","Segoe UI",Roboto,Arial,sans-serif';

function certFit(ctx, text, weight, size, maxW) {          // thu nhỏ chữ nếu quá dài
  let s = size;
  for (; s > 12; s--) { ctx.font = `${weight} ${s}px ${CERT_FONT}`; if (ctx.measureText(text).width <= maxW) break; }
  return s;
}
function certQr(text) {
  try {
    const d = document.createElement('div');
    new QRCode(d, { text: String(text).slice(0, 60), width: 90, height: 90, correctLevel: QRCode.CorrectLevel.M });
    return d.querySelector('canvas') || d.querySelector('img');
  } catch (e) { console.warn('Không tạo được mã QR, vẫn xuất giấy không có QR:', e); return null; }
}
async function drawCertificate(c) {
  const W = 1000, H = 700, K = 2;
  const cv = document.createElement('canvas'); cv.width = W * K; cv.height = H * K;
  const x = cv.getContext('2d'); x.scale(K, K);
  try { if (document.fonts && document.fonts.load) await Promise.all(['400', '600', '700', '800'].map(w => document.fonts.load(`${w} 20px "Be Vietnam Pro"`, 'Àáạảđ'))); } catch (e) {}
  x.fillStyle = '#fffdf7'; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#003366'; x.lineWidth = 15; x.strokeRect(7.5, 7.5, W - 15, H - 15);
  x.strokeStyle = '#ffcc00'; x.lineWidth = 3; x.strokeRect(46.5, 46.5, W - 93, H - 93);
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  const cx = W / 2, line = (t, y, w, size, color, maxW) => { x.fillStyle = color; certFit(x, t, w, size, maxW || 800); x.fillText(t, cx, y); };
  line('TRƯỜNG THPT CHUYÊN LÊ QUÝ ĐÔN', 112, 700, 21, '#111827');
  line('GIẤY CHỨNG NHẬN', 180, 800, 42, '#dc3545');
  line(c.label || 'Chứng nhận thí sinh:', 236, 400, 18, '#111827');
  line(c.name || '', c.cls ? 300 : 316, 800, c.cls ? 40 : 44, '#0d6efd', 780);
  if (c.cls) line('Lớp: ' + c.cls, 345, 700, 21, '#111827');   // giấy tập thể: tên đã có số lớp nên không in lặp
  line(c.line1 || 'Đã đạt thành tích xuất sắc trong cuộc thi Trực Tuyến', 396, 400, 19, '#111827');
  line('“Tìm Hiểu Pháp Luật Năm 2026”', 430, 700, 22, '#111827');
  const aw = certFit(x, c.award || '', 800, 26, 640); x.font = `800 ${aw}px ${CERT_FONT}`;
  const tw = x.measureText(c.award || '').width, bw = tw + 90, bh = 54, by = 450;
  x.fillStyle = '#212529'; x.beginPath();
  if (x.roundRect) x.roundRect(cx - bw / 2, by, bw, bh, 27); else x.rect(cx - bw / 2, by, bw, bh);
  x.fill();
  x.fillStyle = '#ffc107'; x.fillText(c.award || '', cx, by + bh / 2 + aw * 0.35);
  const qr = certQr(c.qrText);
  if (qr) { x.fillStyle = '#fff'; x.fillRect(100, 530, 110, 110); try { x.drawImage(qr, 110, 540, 90, 90); } catch (e) {} }
  const rx = 770;
  x.fillStyle = '#111827'; x.textAlign = 'center';
  x.font = `400 16px ${CERT_FONT}`; x.fillText(CERT_DATE, rx, 548);
  x.font = `800 18px ${CERT_FONT}`; x.fillText('TRƯỞNG BAN TỔ CHỨC', rx, 584);
  x.font = `700 16px ${CERT_FONT}`; x.fillText('(Đã ký)', rx, 626);
  return cv;
}
function jpegToPdfBlob(jpeg, pxW, pxH, W, H) {                // PDF 1 trang (W x H điểm) chứa 1 ảnh JPEG, không cần thư viện
  const enc = new TextEncoder(), chunks = [], off = [];
  let len = 0;
  const push = b => { const u = typeof b === 'string' ? enc.encode(b) : b; chunks.push(u); len += u.length; };
  push('%PDF-1.4\n');
  off[1] = len; push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  off[2] = len; push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  off[3] = len; push(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);
  off[4] = len; push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`); push(jpeg); push('\nendstream\nendobj\n');
  const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
  off[5] = len; push(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
  const xref = len; let t = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) t += String(off[i]).padStart(10, '0') + ' 00000 n \n';
  push(t + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}
function saveBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
async function exportCertificate(c, btn) {
  const oldText = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>Đang tạo...'; }
  try {
    if (typeof QRCode === 'undefined') console.warn('Chưa tải được thư viện QR, giấy sẽ không có mã QR.');
    const cv = await drawCertificate(c);
    const b64 = cv.toDataURL('image/jpeg', 0.95).split(',')[1];
    const bin = atob(b64), jpeg = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) jpeg[i] = bin.charCodeAt(i);
    saveBlob(jpegToPdfBlob(jpeg, cv.width, cv.height, 750, 525), c.fileName);   // 750x525 pt = 1000x700 px, khổ ngang
  } catch (err) {
    alert('Có lỗi khi tạo PDF: ' + (err && err.message ? err.message : err));
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = oldText; }
  }
}
function printCertificate(r, btn) {
  if (!r || !r.giai) { alert('Thí sinh này chưa có kết quả xếp giải! (Cần bấm "Khóa cuộc thi & trao giải" hoặc "Chốt lại giải thưởng" trong trang quản trị trước.)'); return; }
  const award = r.giai.split(' - ')[0];
  exportCertificate({
    name: r.hoTen, cls: r.lop, label: 'Chứng nhận thí sinh:', award,
    qrText: `PL2026|${toAscii(r.ma)}|${toAscii(r.hoTen).slice(0, 24)}|${toAscii(r.lop)}|H${r.hang || ''}`,
    fileName: `GiayChungNhan_${(r.hoTen || 'ThiSinh').replace(/\s+/g, '_')}_${r.lop || ''}.pdf`
  }, btn);
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
  const award = c.giai.split(' - ')[0];
  exportCertificate({
    name: 'Tập thể lớp ' + (c.lop || ''), cls: '', label: 'Chứng nhận tập thể:', award,
    qrText: `PL2026|TAP THE|${toAscii(c.lop)}|H${c.hang || 1}`,
    fileName: `GiayKhen_TapThe_Lop_${c.lop || ''}.pdf`
  }, btn);
}

/* ---------- Giấy chứng nhận của tôi (học sinh đã thi): xem trước, tải PDF, in ---------- */
function printDataUrl(url) {                                   // in bằng khung ẩn, không bị chặn popup
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const d = f.contentWindow.document; d.open();
  d.write('<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4 landscape;margin:0}html,body{margin:0;height:100%}img{width:100%;height:100%;object-fit:contain;display:block}</style></head><body><img id="i"></body></html>');
  d.close();
  const img = d.getElementById('i');
  img.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { alert('Không mở được hộp thoại in. Hãy dùng nút Tải PDF rồi in file PDF.'); } setTimeout(() => f.remove(), 120000); };
  img.src = url;
}
async function addCertCard(box, title, spec) {
  const col = document.createElement('div'); col.className = 'col-lg-6';
  col.innerHTML = '<div class="border rounded-3 p-3 bg-white h-100"><div class="fw-bold mb-2"></div><div class="text-muted small py-5 cert-wait">Đang tạo giấy chứng nhận...</div><img class="img-fluid border rounded mb-3 d-none" style="max-width:100%;height:auto" alt="Giấy chứng nhận"><div class="d-flex gap-2 justify-content-center"><button class="btn btn-primary btn-sm btn-pdf" disabled><i class="fa-solid fa-file-pdf me-1"></i>Tải PDF</button><button class="btn btn-outline-primary btn-sm btn-print" disabled><i class="fa-solid fa-print me-1"></i>In</button></div></div>';
  col.querySelector('.fw-bold').textContent = title;
  box.appendChild(col);
  const cv = await drawCertificate(spec), url = cv.toDataURL('image/jpeg', 0.92);
  const img = col.querySelector('img'); img.src = url; img.classList.remove('d-none'); col.querySelector('.cert-wait').remove();
  const pdf = col.querySelector('.btn-pdf'), prn = col.querySelector('.btn-print');
  pdf.disabled = prn.disabled = false;
  pdf.onclick = () => exportCertificate(spec, pdf);
  prn.onclick = () => printDataUrl(url);
}
async function showMyCert() {
  const c = await api('my_cert', { token: session.token });     // máy chủ chỉ trả dữ liệu của chính tài khoản này
  $('mc-name').textContent = c.hoTen;
  $('mc-class').textContent = `Lớp ${c.lop} · Mã HS ${c.ma}`;
  $('mc-result').innerHTML = `<span class="badge bg-success fs-6 me-1">Đã hoàn thành bài thi</span><span class="badge bg-primary fs-6">${esc(c.soCauDung)}/${esc(c.tong)} câu đúng</span>` +
    (c.giai ? `<div class="alert alert-warning mt-3 mb-0"><i class="fa-solid fa-trophy me-1"></i>Chúc mừng! Bạn đạt <b>${esc(c.giai)}</b> (hạng ${esc(c.hang)})</div>` : '');
  const box = $('mc-certs'); box.innerHTML = '';
  show('section-mycert'); window.scrollTo(0, 0);
  const safe = `${toAscii(c.hoTen).replace(/\s+/g, '_')}_${toAscii(c.lop)}`;
  const jobs = [];
  if (c.giai) {                                                   // người đạt giải: giấy giải thưởng + giấy tham gia
    const award = c.giai.split(' - ')[0];
    jobs.push(addCertCard(box, 'Giấy chứng nhận giải thưởng', {
      name: c.hoTen, cls: c.lop, label: 'Chứng nhận thí sinh:', award,
      qrText: `PL2026|${toAscii(c.ma)}|${toAscii(c.hoTen).slice(0, 24)}|${toAscii(c.lop)}|H${c.hang}`, fileName: `GiayChungNhan_Giai_${safe}.pdf` }));
  }
  jobs.push(addCertCard(box, 'Giấy chứng nhận tham gia', {
    name: c.hoTen, cls: c.lop, label: 'Chứng nhận thí sinh:', line1: 'Đã tham gia cuộc thi Trực Tuyến', award: 'Đã tham gia',
    qrText: `PL2026|${toAscii(c.ma)}|${toAscii(c.hoTen).slice(0, 24)}|${toAscii(c.lop)}|TG`, fileName: `GiayChungNhan_ThamGia_${safe}.pdf` }));
  await Promise.all(jobs);
}
