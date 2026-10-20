/**
 * TÌM HIỂU PHÁP LUẬT TRỰC TUYẾN 2026 - Google Apps Script backend
 * Dán vào Extensions > Apps Script của chính file Google Sheets (container-bound).
 * Đáp án (DapAn) luôn nằm ở server, không bao giờ gửi xuống trình duyệt.
 */
const CFG = {
  SO_CAU: 30,            // số câu mỗi bài thi (lấy ngẫu nhiên từ DE_THI)
  PHUT: 30,              // thời gian làm bài (phút)
  TOP: 100,              // số dòng bảng xếp hạng công khai
  GRACE_SEC: 30,         // thời gian châm chước mạng khi nộp bài
  SESSION_TTL: 21600,    // 6 giờ (tối đa của CacheService)
  RANK_CACHE_SEC: 15,
  EXAM_CACHE_SEC: 600,
  TINH_CA_BAN_THAN: true, // "bao nhiêu thí sinh cùng số câu đúng" có tính cả bản thân không
  GIAI_TAP_THE: { ten: 'Giải Tập thể', tien: 0 }, // tien: 0 = không ghi số tiền (điền số tiền nếu có)
  TAP_THE_XEP_THEO: 'SO_LUONG',  // 'SO_LUONG' = lớp đông nhất | 'TY_LE' = tỷ lệ tham gia trên sĩ số
  DEFAULT_ADMIN_KEY: 'DOI-KHOA-NAY-NGAY', // nên đặt Script Property ADMIN_KEY thay thế
  GIAI: [
    { ten: 'Giải Nhất', tien: 500000, sl: 1 },
    { ten: 'Giải Nhì', tien: 400000, sl: 1 },
    { ten: 'Giải Ba', tien: 300000, sl: 1 },
    { ten: 'Giải Khuyến khích', tien: 200000, sl: 6 }
  ]
};
const S = { HS: 'HOC_SINH', DE: 'DE_THI', PHU: 'CAU_HOI_PHU', KQ: 'KET_QUA' };

const ROUTES = {
  status: status_, login: login_, start: start_, submit: submit_, ranking: ranking_,
  admin_stats: adminStats_, admin_open: adminOpen_, admin_finalize: adminFinalize_,
  admin_reset: adminReset_, admin_export: adminExport_, admin_refresh: adminRefresh_
};

function doGet() { return out_({ ok: true, data: 'API hoạt động' }); }
function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const fn = ROUTES[req.action];
    if (!fn) throw new Error('Hành động không hợp lệ');
    return out_({ ok: true, data: fn(req) });
  } catch (err) {
    return out_({ ok: false, error: String(err.message || err) });
  }
}
function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Tiện ích ---------- */
const cache_ = () => CacheService.getScriptCache();
const props_ = () => PropertiesService.getScriptProperties();
function sheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Thiếu sheet ' + name);
  return sh;
}
function findRow_(sh, val, col) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const f = sh.getRange(2, col, last - 1, 1).createTextFinder(String(val))
    .matchEntireCell(true).matchCase(true).findNext();
  return f ? f.getRow() : 0;
}
function isOpen_() { return props_().getProperty('OPEN') !== 'false'; }
function isFinal_() { return props_().getProperty('FINAL') === 'true'; }
function shuffle_(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function money_(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ'; }
function prizeFor_(hang) {
  let acc = 0;
  for (const g of CFG.GIAI) {
    acc += g.sl;
    if (hang <= acc) return g.ten + ' - ' + money_(g.tien);
  }
  return '';
}
function totalPrizes_() { return CFG.GIAI.reduce((s, g) => s + g.sl, 0); }

/* ---------- Đề thi ---------- */
function loadExam_() {
  const c = cache_().get('exam');
  if (c) return JSON.parse(c);
  const sh = sheet_(S.DE), last = sh.getLastRow(), list = [], errors = [], seen = {};
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, 7).getValues().forEach((r, i) => {
      if (!r[0] && !r[1] && !r[2]) return;
      const d = String(r[6]).trim().toUpperCase();
      const bad = !String(r[1]).trim() || [2, 3, 4, 5].some(k => String(r[k]).trim() === '') || !/^[ABCD]$/.test(d);
      if (bad) { errors.push('Dòng ' + (i + 2)); return; }
      let id = String(r[0] || '').trim() || ('R' + (i + 2));
      if (seen[id]) id = 'R' + (i + 2);
      seen[id] = 1;
      list.push({ id, q: String(r[1]), o: { A: String(r[2]), B: String(r[3]), C: String(r[4]), D: String(r[5]) }, d });
    });
  }
  const res = { list, errors };
  try { cache_().put('exam', JSON.stringify(res), CFG.EXAM_CACHE_SEC); } catch (e) {}
  return res;
}
function phu_() {
  const sh = sheet_(S.PHU);
  const a2 = sh.getLastRow() >= 2 ? String(sh.getRange(2, 1).getValue()).trim() : '';
  return a2 || String(sh.getRange(1, 1).getValue());
}

/* ---------- Học sinh ---------- */
function status_() {
  return { open: isOpen_(), finalized: isFinal_(), phut: CFG.PHUT, soCau: CFG.SO_CAU };
}
function login_(r) {
  const ma = String(r.ma || '').trim(), mk = String(r.mk || '').trim();
  if (!ma || !mk) throw new Error('Vui lòng nhập mã học sinh và mật khẩu');
  const sh = sheet_(S.HS), row = findRow_(sh, ma, 1);
  const bad = new Error('Sai mã học sinh hoặc mật khẩu');
  if (!row) throw bad;
  const v = sh.getRange(row, 1, 1, 6).getValues()[0];
  if (String(v[4]).trim() !== mk) throw bad;
  if (String(v[5]) === 'DA_THI') throw new Error('Tài khoản đã hoàn thành bài thi, không thể thi lại');
  if (!isOpen_()) throw new Error('Cuộc thi hiện đang khóa');
  const token = Utilities.getUuid();
  cache_().put('t_' + token, ma, CFG.SESSION_TTL);
  return { token, hs: { ma: String(v[0]), hoTen: v[1], lop: v[2], khoi: v[3] } };
}
function session_(token) {
  const ma = cache_().get('t_' + token);
  if (!ma) throw new Error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
  return ma;
}
function start_(r) {
  const ma = session_(r.token);
  if (!isOpen_()) throw new Error('Cuộc thi hiện đang khóa');
  const sh = sheet_(S.HS), row = findRow_(sh, ma, 1);
  if (String(sh.getRange(row, 6).getValue()) === 'DA_THI') throw new Error('Bạn đã hoàn thành bài thi');
  const ex = loadExam_();
  if (!ex.list.length) throw new Error('Đề thi chưa sẵn sàng, vui lòng báo ban tổ chức');
  let st = JSON.parse(cache_().get('s_' + ma) || 'null');
  if (!st) {
    st = { start: Date.now(), ids: shuffle_(ex.list.map(x => x.id)).slice(0, CFG.SO_CAU) };
    cache_().put('s_' + ma, JSON.stringify(st), CFG.SESSION_TTL);
    sh.getRange(row, 6).setValue('DANG_THI');
  }
  const elapsed = (Date.now() - st.start) / 1000;
  if (elapsed > CFG.PHUT * 60 + CFG.GRACE_SEC) {
    submitCore_(ma, {}, 0);
    throw new Error('Đã hết thời gian làm bài. Bài thi của bạn đã được ghi nhận.');
  }
  const map = {}; ex.list.forEach(x => map[x.id] = x);
  const questions = st.ids.filter(id => map[id]).map(id => ({ id, q: map[id].q, o: map[id].o }));
  return { questions, remaining: Math.max(0, CFG.PHUT * 60 - elapsed), total: CFG.PHUT * 60, phu: phu_() };
}
function submit_(r) {
  const ma = session_(r.token);
  return submitCore_(ma, r.answers || {}, r.duDoan);
}
function submitCore_(ma, answers, duDoan) {
  const lock = LockService.getScriptLock();
  lock.waitLock(28000);
  try {
    const hs = sheet_(S.HS), kq = sheet_(S.KQ), row = findRow_(hs, ma, 1);
    const hv = hs.getRange(row, 1, 1, 6).getValues()[0];
    if (String(hv[5]) === 'DA_THI') {
      const kr = findRow_(kq, ma, 1);
      if (kr) { const x = kq.getRange(kr, 1, 1, 6).getValues()[0]; return { soCauDung: x[4], thoiGian: x[5], tong: CFG.SO_CAU, daNop: true }; }
      throw new Error('Bạn đã hoàn thành bài thi');
    }
    const st = JSON.parse(cache_().get('s_' + ma) || 'null');
    if (!st) throw new Error('Không tìm thấy phiên làm bài');
    const limit = CFG.PHUT * 60, elapsed = (Date.now() - st.start) / 1000;
    if (elapsed > limit + CFG.GRACE_SEC) answers = {}; // nộp quá hạn: không tính đáp án
    const map = {}; loadExam_().list.forEach(x => map[x.id] = x);
    let dung = 0;
    st.ids.forEach(id => { if (map[id] && answers[id] === map[id].d) dung++; });
    const tg = Math.min(Math.round(elapsed), limit);
    const du = Math.max(0, Math.floor(Number(duDoan)) || 0);
    kq.appendRow([hv[0], hv[1], hv[2], hv[3], dung, tg, du, new Date(), '', '', '']);
    hs.getRange(row, 6).setValue('DA_THI');
    cache_().remove('s_' + ma);
    cache_().remove('rank');
    return { soCauDung: dung, thoiGian: tg, tong: st.ids.length };
  } finally { lock.releaseLock(); }
}

/* ---------- Xếp hạng ---------- */
function rankAll_() {
  const sh = sheet_(S.KQ), last = sh.getLastRow();
  if (last < 2) return [];
  const v = sh.getRange(2, 1, last - 1, 11).getValues(), cnt = {};
  v.forEach(r => { cnt[r[4]] = (cnt[r[4]] || 0) + 1; });
  const rows = v.map(r => {
    const thuc = CFG.TINH_CA_BAN_THAN ? cnt[r[4]] : cnt[r[4]] - 1;
    return {
      ma: String(r[0]), hoTen: r[1], lop: r[2], khoi: r[3], dung: Number(r[4]), tg: Number(r[5]),
      du: Number(r[6]), nop: r[7] instanceof Date ? r[7].getTime() : 0, sl: Math.abs(Number(r[6]) - thuc)
    };
  });
  rows.sort((a, b) => b.dung - a.dung || a.tg - b.tg || a.sl - b.sl || a.nop - b.nop);
  rows.forEach((x, i) => x.hang = i + 1);
  return rows;
}
function ranking_() {
  const c = cache_().get('rank');
  if (c) return JSON.parse(c);
  const rows = rankAll_(), fin = isFinal_();
  const out = {
    finalized: fin, total: rows.length, updated: Date.now(),
    lop: classRankAll_(rows).map(c => Object.assign({}, c, { giai: fin ? classPrize_(c.hang) : '' })),
    rows: rows.slice(0, CFG.TOP).map(x => ({ hang: x.hang, ma: x.ma, du: x.du, hoTen: x.hoTen, lop: x.lop, dung: x.dung, tg: x.tg, giai: fin ? prizeFor_(x.hang) : '' }))
  };
  try { cache_().put('rank', JSON.stringify(out), CFG.RANK_CACHE_SEC); } catch (e) {}
  return out;
}
function finalize_() {
  const kq = sheet_(S.KQ), last = kq.getLastRow();
  if (last < 2) { writeClassSheet_([]); props_().setProperty('FINAL', 'true'); return []; }
  const rows = rankAll_(), m = {};
  rows.forEach(x => m[x.ma] = x);
  const ids = kq.getRange(2, 1, last - 1, 1).getValues();
  kq.getRange(2, 9, last - 1, 3).setValues(ids.map(a => {
    const x = m[String(a[0])];
    return [x.sl, x.hang, prizeFor_(x.hang)];
  }));
  writeClassSheet_(classRankAll_(rows));
  props_().setProperty('FINAL', 'true');
  cache_().remove('rank');
  return rows.slice(0, totalPrizes_()).map(x => ({ hang: x.hang, hoTen: x.hoTen, lop: x.lop, giai: prizeFor_(x.hang) }));
}

/* ---------- Quản trị ---------- */
function admin_(r) {
  const key = props_().getProperty('ADMIN_KEY') || CFG.DEFAULT_ADMIN_KEY;
  if (String(r.key || '') !== key) { Utilities.sleep(1000); throw new Error('Sai khóa quản trị'); }
}
function adminStats_(r) {
  admin_(r);
  const hs = sheet_(S.HS), last = hs.getLastRow(), c = { CHUA_THI: 0, DANG_THI: 0, DA_THI: 0 };
  if (last >= 2) hs.getRange(2, 6, last - 1, 1).getValues().forEach(a => { const k = String(a[0]); c[k] = (c[k] || 0) + 1; });
  const ex = loadExam_();
  return { open: isOpen_(), finalized: isFinal_(), hocSinh: Math.max(0, last - 1), trangThai: c,
    soCauDeThi: ex.list.length, loiDeThi: ex.errors, ketQua: Math.max(0, sheet_(S.KQ).getLastRow() - 1), soCauMoiBai: CFG.SO_CAU };
}
function adminOpen_(r) {
  admin_(r);
  const open = !!r.open;
  props_().setProperty('OPEN', open ? 'true' : 'false');
  if (!open) return { open, winners: finalize_() };   // khóa cuộc thi => tự động chốt & trao giải
  props_().setProperty('FINAL', 'false');
  const kq = sheet_(S.KQ), last = kq.getLastRow();
  if (last >= 2) kq.getRange(2, 9, last - 1, 3).clearContent();
  const ls = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('KET_QUA_LOP');
  if (ls) ls.clearContents();
  cache_().remove('rank');
  return { open };
}
function adminFinalize_(r) { admin_(r); return { winners: finalize_() }; }
function adminRefresh_(r) {
  admin_(r);
  cache_().remove('exam');
  const ex = loadExam_();
  return { soCauDeThi: ex.list.length, loi: ex.errors, phu: phu_() };
}
function adminReset_(r) {
  admin_(r);
  const lock = LockService.getScriptLock();
  lock.waitLock(28000);
  try {
    const hs = sheet_(S.HS), kq = sheet_(S.KQ), last = hs.getLastRow();
    let n = 0;
    if (r.scope === 'ONE') {
      const ma = String(r.ma || '').trim(), row = findRow_(hs, ma, 1);
      if (!row) throw new Error('Không tìm thấy mã học sinh ' + ma);
      hs.getRange(row, 6).setValue('CHUA_THI');
      let kr; while ((kr = findRow_(kq, ma, 1))) kq.deleteRow(kr);
      cache_().remove('s_' + ma);
      n = 1;
    } else if (last >= 2) {
      const ids = hs.getRange(2, 1, last - 1, 1).getValues().map(a => String(a[0]));
      const st = hs.getRange(2, 6, last - 1, 1).getValues();
      if (r.scope === 'ALL') {
        hs.getRange(2, 6, last - 1, 1).setValues(st.map(() => ['CHUA_THI']));
        if (kq.getLastRow() >= 2) kq.getRange(2, 1, kq.getLastRow() - 1, 11).clearContent();
        n = ids.length;
      } else if (r.scope === 'DANG_THI') {
        hs.getRange(2, 6, last - 1, 1).setValues(st.map(a => [a[0] === 'DANG_THI' ? 'CHUA_THI' : a[0]]));
        n = st.filter(a => a[0] === 'DANG_THI').length;
      } else throw new Error('Phạm vi reset không hợp lệ');
      cache_().removeAll(ids.map(x => 's_' + x));
    }
    cache_().remove('rank');
    if (isFinal_()) finalize_();
    return { reset: n };
  } finally { lock.releaseLock(); }
}
function adminExport_(r) {
  admin_(r);
  const fin = isFinal_();
  const all = rankAll_();
  const hs = all.map(x => ({ hang: x.hang, ma: x.ma, hoTen: x.hoTen, lop: x.lop, khoi: x.khoi, dung: x.dung,
    tg: x.tg, du: x.du, sl: x.sl, giai: fin ? prizeFor_(x.hang) : '' }));
  return { hs, lop: classRankAll_(all).map(c => Object.assign({}, c, { giai: fin ? classPrize_(c.hang) : '' })) };
}

/* ---------- Giải tập thể (lớp) ---------- */
// Xếp hạng lớp: (1) số thí sinh tham gia [hoặc tỷ lệ] giảm dần, (2) TB số câu đúng giảm dần, (3) TB thời gian tăng dần
function classRankAll_(rows) {
  const hs = sheet_(S.HS), last = hs.getLastRow(), siSo = {}, g = {};
  if (last >= 2) hs.getRange(2, 3, last - 1, 1).getValues().forEach(a => { const k = String(a[0]).trim(); if (k) siSo[k] = (siSo[k] || 0) + 1; });
  rows.forEach(x => {
    const k = String(x.lop).trim(), c = g[k] || (g[k] = { lop: k, n: 0, sd: 0, st: 0 });
    c.n++; c.sd += x.dung; c.st += x.tg;
  });
  const list = Object.keys(g).map(k => {
    const c = g[k], s = siSo[k] || 0;
    return { lop: k, soHS: c.n, siSo: s, tyLe: s ? Math.round(c.n / s * 1000) / 10 : 0,
      tbDung: Math.round(c.sd / c.n * 100) / 100, tbTg: Math.round(c.st / c.n) };
  });
  const key = CFG.TAP_THE_XEP_THEO === 'TY_LE' ? 'tyLe' : 'soHS';
  list.sort((a, b) => b[key] - a[key] || b.soHS - a.soHS || b.tbDung - a.tbDung || a.tbTg - b.tbTg || a.lop.localeCompare(b.lop));
  list.forEach((x, i) => x.hang = i + 1);
  return list;
}
function classPrize_(hang) {
  if (hang !== 1) return '';
  return CFG.GIAI_TAP_THE.ten + (CFG.GIAI_TAP_THE.tien ? ' - ' + money_(CFG.GIAI_TAP_THE.tien) : '');
}
function writeClassSheet_(list) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('KET_QUA_LOP') || ss.insertSheet('KET_QUA_LOP');
  sh.clearContents();
  const head = ['Lop', 'SoHSThamGia', 'SiSo', 'TyLe(%)', 'TBSoCauDung', 'TBThoiGianGiay', 'XepHang', 'GiaiThuong'];
  const data = [head].concat(list.map(c => [c.lop, c.soHS, c.siSo, c.tyLe, c.tbDung, c.tbTg, c.hang, classPrize_(c.hang)]));
  sh.getRange(1, 1, data.length, head.length).setValues(data);
}
