const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.round(s % 60)).padStart(2, '0');

// Gửi text/plain để không bị CORS preflight; đọc được kết quả thật (không dùng no-cors)
async function api(action, payload = {}, retries = 2) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, ...payload }) });
      const j = await res.json();
      if (!j.ok) { const e = new Error(j.error || 'Lỗi không xác định'); e.app = true; throw e; }
      return j.data;
    } catch (e) {
      if (e.app) throw e;
      if (i >= retries) throw new Error('Không kết nối được máy chủ. Vui lòng kiểm tra mạng.');
      await sleep(800 * 2 ** i + Math.random() * 600);
    }
  }
}
