const $ = id => document.getElementById(id);
let KEY = sessionStorage.getItem('adminKey') || '';

function msg(text, type = 'success') { const m = $('msg'); m.className = 'alert alert-' + type; m.textContent = text; window.scrollTo(0, 0); }
async function call(action, extra = {}) {
  try { return await api(action, { key: KEY, ...extra }, 1); }
  catch (e) { msg(e.message, 'danger'); throw e; }
}
async function enter() {
  KEY = $('key').value || KEY;
  try { await api('admin_stats', { key: KEY }, 1); } catch (e) { alert(e.message); return; }
  sessionStorage.setItem('adminKey', KEY);
  $('keyBox').classList.add('d-none'); $('panel').classList.remove('d-none'); $('btnOut').classList.remove('d-none');
  refresh();
}
async function refresh() {
  const s = await call('admin_stats');
  $('stateBadge').className = 'pill ' + (s.open ? 'ok' : 'off');
  $('stateBadge').textContent = s.open ? 'Đang mở' : (s.finalized ? 'Đã khóa - đã chốt giải' : 'Đã khóa');
  const card = (t, n, c) => `<div class="col-6 col-md-3"><div class="card-fluent stat"><div class="text-muted small">${t}</div><div class="n" style="color:${c}">${n}</div></div></div>`;
  $('stats').innerHTML = card('Tổng học sinh', s.hocSinh, 'var(--ink)') + card('Chưa thi', s.trangThai.CHUA_THI || 0, 'var(--muted)') +
    card('Đang thi', s.trangThai.DANG_THI || 0, 'var(--warning)') + card('Đã thi', s.trangThai.DA_THI || 0, 'var(--success)');
  $('examInfo').innerHTML = `Ngân hàng đề: <b>${s.soCauDeThi}</b> câu hợp lệ (mỗi bài lấy ${s.soCauMoiBai} câu).` +
    (s.soCauDeThi < s.soCauMoiBai ? ' <span class="text-danger">⚠ Chưa đủ câu cho một bài thi.</span>' : '') +
    (s.loiDeThi.length ? `<br><span class="text-danger">Dòng lỗi (thiếu nội dung hoặc DapAn không phải A/B/C/D): ${esc(s.loiDeThi.join(', '))}</span>` : '');
}
const sure = t => confirm(t);

$('btnKey').onclick = enter;
$('key').addEventListener('keydown', e => { if (e.key === 'Enter') enter(); });
$('btnOut').onclick = e => { e.preventDefault(); sessionStorage.removeItem('adminKey'); location.reload(); };
$('btnLock').onclick = async () => { if (!sure('Khóa cuộc thi và chốt giải thưởng?')) return; const r = await call('admin_open', { open: false }); msg('Đã khóa và trao giải cho ' + r.winners.length + ' thí sinh.'); refresh(); };
$('btnUnlock').onclick = async () => { if (!sure('Mở lại cuộc thi? Kết quả xếp hạng/giải thưởng đã chốt sẽ bị xóa.')) return; await call('admin_open', { open: true }); msg('Đã mở cuộc thi.'); refresh(); };
$('btnFinal').onclick = async () => { const r = await call('admin_finalize'); msg('Đã chốt giải thưởng cho ' + r.winners.length + ' thí sinh.'); refresh(); };
$('btnRefresh').onclick = async () => { const r = await call('admin_refresh'); msg('Đã cập nhật: ' + r.soCauDeThi + ' câu hợp lệ.' + (r.loi.length ? ' Dòng lỗi: ' + r.loi.join(', ') : '')); refresh(); };
$('btnOne').onclick = async () => { const ma = $('maHS').value.trim(); if (!ma || !sure('Reset học sinh ' + ma + '?')) return; await call('admin_reset', { scope: 'ONE', ma }); msg('Đã reset ' + ma); refresh(); };
$('btnDang').onclick = async () => { if (!sure('Reset tất cả bài đang làm dở?')) return; const r = await call('admin_reset', { scope: 'DANG_THI' }); msg('Đã reset ' + r.reset + ' học sinh.'); refresh(); };
$('btnAll').onclick = async () => { if (prompt('Gõ RESET để xóa toàn bộ kết quả và cho tất cả thi lại:') !== 'RESET') return; const r = await call('admin_reset', { scope: 'ALL' }); msg('Đã reset ' + r.reset + ' học sinh.'); refresh(); };
$('btnExport').onclick = async () => {
  const d = await call('admin_export'); const rows = d.hs;
  const data = [['Hạng', 'Mã HS', 'Họ tên', 'Lớp', 'Khối', 'Số câu đúng', 'Thời gian (giây)', 'Dự đoán', 'Sai lệch', 'Giải thưởng']]
    .concat(rows.map(x => [x.hang, x.ma, x.hoTen, x.lop, x.khoi, x.dung, x.tg, x.du, x.sl, x.giai]));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'XepHang');
  const lop = [['Hạng', 'Lớp', 'Số TS tham gia', 'Sĩ số', 'Tỷ lệ (%)', 'TB số câu đúng', 'TB thời gian (giây)', 'Giải thưởng']]
    .concat(d.lop.map(c => [c.hang, c.lop, c.soHS, c.siSo, c.tyLe, c.tbDung, c.tbTg, c.giai]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lop), 'XepHangLop');
  XLSX.writeFile(wb, 'KetQua_PhapLuat_2026.xlsx');
};
if (KEY) enter();
