const $ = id => document.getElementById(id);
let KEY = sessionStorage.getItem('adminKey') || '';

function msg(text, type = 'success') { 
  const m = $('msg'); 
  m.className = 'alert alert-' + type; 
  m.textContent = text; 
  window.scrollTo(0, 0); 
}

async function call(action, extra = {}) {
  try { 
    return await api(action, { key: KEY, ...extra }, 1); 
  } catch (e) { 
    msg(e.message, 'danger'); 
    throw e; 
  }
}

async function enter() {
  KEY = $('key').value || KEY;
  try { 
    await api('admin_stats', { key: KEY }, 1); 
  } catch (e) { 
    alert(e.message); 
    return; 
  }
  sessionStorage.setItem('adminKey', KEY);
  $('keyBox').classList.add('d-none'); 
  $('panel').classList.remove('d-none'); 
  $('btnOut').classList.remove('d-none');
  refresh();
}

async function refresh() {
  const s = await call('admin_stats');
  
  // Trạng thái cuộc thi
  $('stateBadge').className = 'pill ' + (s.open ? 'ok' : 'off');
  $('stateBadge').textContent = s.open ? 'Đang mở' : (s.finalized ? 'Đã khóa - đã chốt giải' : 'Đã khóa');
  
  // Trạng thái công khai/ẩn bảng xếp hạng với thí sinh
  $('rankPubBadge').className = 'pill ' + (s.rankPublic ? 'ok' : 'off');
  $('rankPubBadge').textContent = s.rankPublic ? 'Đang công khai' : 'Đang ẩn';

  // Thống kê tổng quan học sinh
  const card = (t, n, c) => `<div class="col-6 col-md-3"><div class="card-fluent stat"><div class="text-muted small">${t}</div><div class="n" style="color:${c}">${n}</div></div></div>`;
  $('stats').innerHTML = card('Tổng học sinh', s.hocSinh, 'var(--ink)') + 
    card('Chưa thi', s.trangThai.CHUA_THI || 0, 'var(--muted)') +
    card('Đang thi', s.trangThai.DANG_THI || 0, 'var(--warning)') + 
    card('Đã thi', s.trangThai.DA_THI || 0, 'var(--success)');
    
  $('examInfo').innerHTML = `Ngân hàng đề: <b>${s.soCauDeThi}</b> câu hợp lệ (mỗi bài lấy ${s.soCauMoiBai} câu).` +
    (s.soCauDeThi < s.soCauMoiBai ? ' <span class="text-danger">⚠ Chưa đủ câu cho một bài thi.</span>' : '') +
    (s.loiDeThi.length ? `<br><span class="text-danger">Dòng lỗi (thiếu nội dung hoặc DapAn không phải A/B/C/D): ${esc(s.loiDeThi.join(', '))}</span>` : '');
}

const sure = t => confirm(t);

// --- BỔ SUNG ĐẦY ĐỦ SỰ KIỆN GẮN KẾT CHO NÚT TRUY CẬP ---
$('btnKey').onclick = enter;
$('key').addEventListener('keydown', e => { if (e.key === 'Enter') enter(); });
$('btnOut').onclick = e => { e.preventDefault(); sessionStorage.removeItem('adminKey'); location.reload(); };

$('btnLock').onclick = async () => { 
  if (!sure('Khóa cuộc thi và chốt giải thưởng?')) return; 
  const r = await call('admin_open', { open: false }); 
  msg('Đã khóa và trao giải cho ' + r.winners.length + ' thí sinh.'); 
  refresh(); 
};

$('btnUnlock').onclick = async () => { 
  if (!sure('Mở lại cuộc thi? Kết quả xếp hạng/giải thưởng đã chốt sẽ bị xóa.')) return; 
  await call('admin_open', { open: true }); 
  msg('Đã mở cuộc thi.'); 
  refresh(); 
};

$('btnFinal').onclick = async () => { 
  const r = await call('admin_finalize'); 
  msg('Đã chốt giải thưởng cho ' + r.winners.length + ' thí sinh.'); 
  refresh(); 
};

// Xử lý sự kiện Ẩn / Công khai bảng xếp hạng
$('btnHideRank').onclick = async () => {
  await call('admin_rankpublic', { pub: false });
  msg('Đã ẩn bảng xếp hạng đối với thí sinh.');
  refresh();
};

$('btnShowRank').onclick = async () => {
  await call('admin_rankpublic', { pub: true });
  msg('Đã công khai bảng xếp hạng đối với thí sinh.');
  refresh();
};

$('btnRefresh').onclick = async () => { 
  const r = await call('admin_refresh'); 
  msg('Đã cập nhật: ' + r.soCauDeThi + ' câu hợp lệ.' + (r.loi.length ? ' Dòng lỗi: ' + r.loi.join(', ') : '')); 
  refresh(); 
};

$('btnOne').onclick = async () => { 
  const ma = $('maHS').value.trim(); 
  if (!ma || !sure('Reset học sinh ' + ma + '?')) return; 
  await call('admin_reset', { scope: 'ONE', ma }); 
  msg('Đã reset ' + ma); 
  refresh(); 
};

$('btnDang').onclick = async () => { 
  if (!sure('Reset tất cả bài đang làm dở?')) return; 
  const r = await call('admin_reset', { scope: 'DANG_THI' }); 
  msg('Đã reset ' + r.reset + ' học sinh.'); 
  refresh(); 
};

$('btnAll').onclick = async () => { 
  if (prompt('Gõ RESET để xóa toàn bộ kết quả và cho tất cả thi lại:') !== 'RESET') return; 
  const r = await call('admin_reset', { scope: 'ALL' }); 
  msg('Đã reset ' + r.reset + ' học sinh.'); 
  refresh(); 
};

$('btnExport').onclick = async () => {
  const d = await call('admin_export'); 
  const rows = d.hs;
  const data = [['Hạng', 'Mã HS', 'Họ tên', 'Lớp', 'Khối', 'Số câu đúng', 'Thời gian (giây)', 'Dự đoán', 'Sai lệch', 'Giải thưởng']]
    .concat(rows.map(x => [x.hang, x.ma, x.hoTen, x.lop, x.khoi, x.dung, x.tg, x.du, x.sl, x.giai]));
  const wb = XLSX.utils.book_new(); 
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'XepHang');
  const lop = [['Hạng', 'Lớp', 'Số TS tham gia', 'Sĩ số', 'Tỷ lệ (%)', 'TB số câu đúng', 'TB thời gian (giây)', 'Giải thưởng']]
    .concat(d.lop.map(c => [c.hang, c.lop, c.soHS, c.siSo, c.tyLe, c.tbDung, c.tbTg, c.giai]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lop), 'XepHangLop');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(advRows(d.vong)), 'VongTiep');
  XLSX.writeFile(wb, 'KetQua_PhapLuat_2026.xlsx');
};

if (KEY) enter();

$('btnSetKey').onclick = async () => {
  const a = $('newKey').value.trim(), b = $('newKey2').value.trim();
  if (a.length < 8) return msg('Khóa mới phải có ít nhất 8 ký tự.', 'danger');
  if (a !== b) return msg('Hai lần nhập khóa mới không khớp.', 'danger');
  await call('admin_setkey', { newKey: a });
  KEY = a; 
  sessionStorage.setItem('adminKey', a); 
  $('newKey').value = $('newKey2').value = '';
  msg('Đã đổi khóa quản trị. Hãy ghi nhớ khóa mới.');
};

/* ---- Danh sách vào vòng tiếp theo ---- */
let advData = null;
const advRows = list => [['Lớp', 'Hạng trong lớp', 'Mã HS', 'Họ tên', 'Số câu đúng', 'Thời gian (giây)', 'Dự đoán', 'Sai lệch', 'Hạng trường', 'Giải thưởng']]
  .concat(list.map(x => [x.lop, x.hangLop, x.ma, x.hoTen, x.dung, x.tg, x.du, x.sl, x.hangTruong, x.giai || '']));

async function loadAdv() {
  advData = await call('admin_advancers');
  const b = $('advBadge'); 
  b.classList.remove('d-none');
  b.className = 'pill ms-2 ' + (advData.finalized ? 'ok' : 'wait'); 
  b.textContent = advData.finalized ? 'Đã chốt' : 'Tạm thời';
  $('advWarn').textContent = advData.thieu.length
    ? 'Lớp chưa đủ ' + advData.n + ' thí sinh: ' + advData.thieu.map(t => `${t.lop} (${t.co}/${advData.n}, sĩ số ${t.siSo})`).join('; ')
    : '';
  $('advBody').innerHTML = advData.list.map(x => `<tr><td><b>${esc(x.lop)}</b></td><td>${x.hangLop}</td><td>${esc(x.ma)}</td><td>${esc(x.hoTen)}</td>
    <td>${x.dung}</td><td>${x.tg}s</td><td>${x.sl}</td><td>${x.hangTruong}</td><td>${esc(x.giai)}</td></tr>`).join('')
    || '<tr><td colspan="9" class="text-center text-muted">Chưa có dữ liệu.</td></tr>';
}

$('btnAdv').onclick = loadAdv;
$('btnAdvXls').onclick = async () => {
  if (!advData) await loadAdv();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(advRows(advData.list)), 'VongTiep');
  XLSX.writeFile(wb, 'DanhSach_VongTiepTheo_2026.xlsx');
};

/* ---- Thống kê tham gia theo lớp ---- */
let attData = null;
async function loadAtt() {
  attData = await call('admin_attendance');
  const t = attData.classes.reduce((a, c) => ({ s: a.s + c.siSo, d: a.d + c.daThi }), { s: 0, d: 0 });
  $('attSum').textContent = `Toàn trường: ${t.d}/${t.s} học sinh đã thi (${t.s ? Math.round(t.d / t.s * 1000) / 10 : 0}%), ${attData.absent.length} chưa hoàn thành, ${attData.classes.length} lớp.`;
  $('attBody').innerHTML = attData.classes.map(c => `<tr><td><b>${esc(c.lop)}</b></td><td>${c.siSo}</td><td class="text-success fw-bold">${c.daThi}</td>
    <td class="text-warning fw-bold">${c.dangThi}</td><td class="${c.chuaThi ? 'text-danger fw-bold' : ''}">${c.chuaThi}</td><td>${c.tyLe}%</td></tr>`).join('');
  const sel = $('attFilter'), cur = sel.value;
  sel.innerHTML = '<option value="">Tất cả các lớp</option>' + attData.classes.filter(c => c.chuaThi + c.dangThi).map(c => `<option>${esc(c.lop)}</option>`).join('');
  sel.value = cur; 
  renderAbs();
}

function renderAbs() {
  const f = $('attFilter').value, list = attData.absent.filter(x => !f || x.lop === f);
  $('absBody').innerHTML = list.map(x => `<tr><td>${esc(x.lop)}</td><td>${esc(x.ma)}</td><td>${esc(x.hoTen)}</td><td>${x.tt === 'DANG_THI' ? 'Đang thi / bỏ dở' : 'Chưa thi'}</td></tr>`).join('')
    || '<tr><td colspan="4" class="text-center text-muted">Không có.</td></tr>';
}

$('btnAtt').onclick = loadAtt;
$('attFilter').onchange = () => attData && renderAbs();
$('btnAttXls').onclick = async () => {
  await loadAtt();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Lớp', 'Sĩ số', 'Đã thi', 'Đang thi', 'Chưa thi', 'Tỷ lệ (%)']]
    .concat(attData.classes.map(c => [c.lop, c.siSo, c.daThi, c.dangThi, c.chuaThi, c.tyLe]))), 'ThongKeLop');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Lớp', 'Mã HS', 'Họ tên', 'Khối', 'Trạng thái']]
    .concat(attData.absent.map(x => [x.lop, x.ma, x.hoTen, x.khoi, x.tt]))), 'ChuaThi');
  XLSX.writeFile(wb, 'ThongKe_ThamGia_2026.xlsx');
};
