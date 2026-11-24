/* App quét bài thi trên điện thoại: camera → tự thấy phiếu → giữ yên thì tự chụp → nắn thẳng → lưu JPG → gửi .zip */
const $ = s => document.querySelector(s);
const video = $('#video'), ve = $('#ve'), vctx = ve.getContext('2d');
let stream = null, track = null, imgCap = null;
let tuDong = true, dangChup = false;
let truoc = null, onDinh = 0, matPhieu = 0, choPhep = true, docCuoi = null, khoaTruoc = '', baoCuoi = ['', ''];
const SO_KHUNG_ON_DINH = 4;      // số lần dò liên tiếp phiếu đứng yên thì chụp (~0,6 giây)
const NGUONG_KHAC = 4;           // số ô tô khác nhau tối đa để coi là CÙNG một phiếu (cùng SBD, mã đề)
const docDu = d => d && !/[_*]/.test(d.sbd + d.made);   // đọc được đủ SBD + mã đề
// cùng phiếu: SBD, mã đề trùng hẳn và phần tô gần như y hệt (bạn chép bài nhau vẫn khác SBD → không bị coi là trùng)
const cungPhieu = (a, b) => docDu(a) && docDu(b) && a.sbd === b.sbd && a.made === b.made && QUET.khacNhau(a.chuoi, b.chuoi) <= NGUONG_KHAC;

/* ---------- lưu ảnh (IndexedDB) ---------- */
const DB = (() => {
  let db;
  const mo = () => db ? Promise.resolve(db) : new Promise((ok, loi) => {
    const r = indexedDB.open('quet-bai-thi', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('anh', { keyPath: 'id' });
    r.onsuccess = () => ok(db = r.result); r.onerror = () => loi(r.error);
  });
  const tx = async (m, f) => { const d = await mo(); return new Promise((ok, loi) => { const t = d.transaction('anh', m), s = t.objectStore('anh'); const r = f(s); t.oncomplete = () => ok(r && r.result); t.onerror = () => loi(t.error); }); };
  return { them: a => tx('readwrite', s => s.put(a)), xoa: id => tx('readwrite', s => s.delete(id)), tatCa: () => tx('readonly', s => s.getAll()) };
})();
let ANH = [];
async function napAnh() { ANH = (await DB.tatCa()).sort((a, b) => a.ten.localeCompare(b.ten, 'vi', { numeric: true })); capNhatDem(); }
const tienTo = () => ($('#tienTo').value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '') || 'BAI');
function tenTiepTheo() {
  const p = tienTo(), so = ANH.filter(a => a.lo === p).map(a => +a.ten.slice(p.length, -4) || 0);
  return p + String((so.length ? Math.max(...so) : 0) + 1).padStart(3, '0') + '.jpg';
}
function capNhatDem() { const p = tienTo(), n = ANH.filter(a => a.lo === p).length; $('#dem').textContent = `${p}: ${n} ảnh` + (ANH.length > n ? ` · tổng ${ANH.length}` : ''); }
$('#tienTo').value = localStorage.getItem('tienTo') || 'BAI';
$('#tienTo').oninput = () => { localStorage.setItem('tienTo', tienTo()); capNhatDem(); };

/* ---------- camera ---------- */
async function moCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } } });
  } catch (e) {
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); }
    catch (e2) {
      $('#tt').textContent = 'Không mở được camera';
      $('#loiCam').textContent = 'Không mở được camera: ' + e2.message + '. Hãy cho phép trình duyệt dùng camera; trang phải mở bằng địa chỉ https://.';
      hien('manHd'); return;
    }
  }
  video.srcObject = stream; await video.play().catch(() => {});
  track = stream.getVideoTracks()[0];
  try { const c = track.getCapabilities?.() || {}; if (c.focusMode?.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch {}
  if ('ImageCapture' in window) { try { imgCap = new ImageCapture(track); } catch { imgCap = null; } }
  $('#btnDen').hidden = !(track.getCapabilities?.().torch);
  vongLap();
}
let den = false;
$('#btnDen').onclick = async () => { den = !den; try { await track.applyConstraints({ advanced: [{ torch: den }] }); $('#btnDen').classList.toggle('on', den); } catch { toast('Máy không hỗ trợ đèn'); } };

/* ---------- vòng dò phiếu ---------- */
function tt(s, kieu = '') { const e = $('#tt'); e.textContent = s; e.className = 'tt ' + kieu; }
function vongLap() {
  setTimeout(vongLap, 90);
  if (dangChup || !video.videoWidth || document.hidden) return;
  const vw = video.videoWidth, vh = video.videoHeight;
  const nho = QUET.thuNho(video, vw, vh, 640);
  const r = QUET.timPhieu(nho.id);
  veKhung(r, nho);
  if (!r) {
    onDinh = 0; truoc = null;
    if (++matPhieu >= 5 && !choPhep) choPhep = true;      // bỏ phiếu ra ~0,5 giây → cho chụp phiếu kế
    tt(choPhep ? 'Đưa cả phiếu vào khung (thấy đủ 10 ô vuông đen)' : 'Đã chụp – thay phiếu khác', choPhep ? '' : 'ok');
    return;
  }
  matPhieu = 0;
  // camera vẫn thấy khung: đọc nhanh SBD + mã đề (ảnh nhỏ nên chỉ tin khi 2 lần đọc liên tiếp giống nhau)
  const d = QUET.docNhanh(QUET.nan(nho.id, r.goc, 551, 779)), khoa = docDu(d) ? d.sbd + d.made : '';
  const chac = khoa && khoa === khoaTruoc; khoaTruoc = khoa;
  if (!choPhep && chac && (!docDu(docCuoi) || khoa !== docCuoi.sbd + docCuoi.made)) choPhep = true;   // đã thay sang phiếu khác
  if (!choPhep) { tt(...baoCuoi); return; }
  if (chac) { const cu = ANH.find(a => docDu(a.doc) && a.doc.sbd + a.doc.made === khoa); if (cu) { tt('Phiếu SBD ' + d.sbd + ' đã chụp (' + cu.ten + ') – thay phiếu khác', 'loi'); onDinh = 0; return; } }
  const lech = truoc ? Math.max(...r.goc.map((g, i) => Math.hypot(g[0] - truoc[i][0], g[1] - truoc[i][1]))) : 1e9;
  truoc = r.goc;
  onDinh = lech < nho.id.width * 0.012 ? onDinh + 1 : 0;
  if (!tuDong) { tt('Thấy phiếu – bấm nút tròn để chụp', 'cho'); return; }
  if (onDinh >= SO_KHUNG_ON_DINH) chup();
  else tt('Giữ yên…', 'cho');
}
function veKhung(r, nho) {
  const W = ve.clientWidth, H = ve.clientHeight; if (ve.width !== W) ve.width = W; if (ve.height !== H) ve.height = H;
  vctx.clearRect(0, 0, W, H);
  if (!r) return;
  // video "contain" trong khung: tính lề
  const vw = nho.id.width, vh = nho.id.height, k = Math.min(W / vw, H / vh), ox = (W - vw * k) / 2, oy = (H - vh * k) / 2;
  vctx.lineWidth = 4; vctx.strokeStyle = choPhep ? (onDinh ? '#ffb300' : '#22c55e') : '#22c55e';
  vctx.fillStyle = 'rgba(34,197,94,.12)';
  vctx.beginPath(); r.goc.forEach(([x, y], i) => vctx[i ? 'lineTo' : 'moveTo'](ox + x * k, oy + y * k)); vctx.closePath(); vctx.fill(); vctx.stroke();
}

/* ---------- chụp ---------- */
async function chup(tay = false) {
  if (dangChup) return; dangChup = true;
  tt('Đang chụp…', 'cho');
  try {
    let src, sw, sh, kq = null;
    if (imgCap) { try { const b = await Promise.race([imgCap.takePhoto(), new Promise((_, loi) => setTimeout(() => loi(new Error('chậm')), 2500))]); src = await createImageBitmap(b); sw = src.width; sh = src.height; kq = QUET.xuLyAnh(src, sw, sh); } catch { kq = null; } }
    if (!kq) { src = video; sw = video.videoWidth; sh = video.videoHeight; kq = QUET.xuLyAnh(src, sw, sh); }
    if (!kq) {
      if (tay) { toast('Không thấy đủ 10 ô vuông đen của phiếu – đưa cả phiếu vào khung'); }
      onDinh = 0; return;
    }
    const doc = QUET.docNhanh(kq.cv), cu = docDu(doc) && ANH.find(a => cungPhieu(doc, a.doc));
    if (cu && !tay) { docCuoi = doc; choPhep = false; onDinh = 0; truoc = null; baoCuoi = ['Phiếu SBD ' + doc.sbd + ' đã chụp (' + cu.ten + ') – thay phiếu khác', 'loi']; tt(...baoCuoi); return; }
    const blob = await new Promise(ok => kq.cv.toBlob(ok, 'image/jpeg', 0.9));
    let ten;
    if (cu) { // bấm nút chụp tay với phiếu đã có → chụp lại, thay ảnh cũ, giữ nguyên tên
      cu.blob = blob; cu.t = Date.now(); cu.doc = doc; await DB.them(cu); ten = cu.ten; toast('Đã chụp lại, thay ảnh cũ ' + ten);
    } else {
      ten = tenTiepTheo(); const a = { id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), ten, lo: tienTo(), blob, t: Date.now(), doc };
      await DB.them(a); ANH.push(a); capNhatDem();
    }
    docCuoi = doc; choPhep = false; onDinh = 0; truoc = null;
    hieuUng(); const u = URL.createObjectURL(blob); $('#anhCuoi').src = u; $('#anhCuoi').hidden = false;
    baoCuoi = ['✓ Đã chụp ' + ten + (docDu(doc) ? ' – SBD ' + doc.sbd + ', mã ' + doc.made : '') + ' – thay phiếu khác', 'ok']; tt(...baoCuoi);
  } catch (e) { toast('Lỗi chụp: ' + e.message); }
  finally { dangChup = false; }
}
let actx;
function hieuUng() {
  const f = $('#chop'); f.style.opacity = .8; setTimeout(() => f.style.opacity = 0, 120);
  navigator.vibrate?.(80);
  try { actx = actx || new AudioContext(); const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 1400; g.gain.setValueAtTime(.25, actx.currentTime); g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + .12); o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + .13); } catch {}
}
$('#btnChup').onclick = () => { choPhep = true; chup(true); };
$('#btnTuDong').onclick = () => { tuDong = !tuDong; $('#btnTuDong').classList.toggle('on', tuDong); toast(tuDong ? 'Tự chụp khi phiếu đứng yên' : 'Tắt tự chụp – bấm nút tròn để chụp'); };

/* ---------- danh sách ảnh ---------- */
function hien(id) { ['manQuet', 'manDs', 'manHd'].forEach(m => $('#' + m).hidden = m !== id); }
$('#btnDs').onclick = () => { veDs(); hien('manDs'); };
$('#btnVe').onclick = () => hien('manQuet');
$('#btnHd').onclick = () => hien('manHd');
$('#btnHdVe').onclick = () => hien('manQuet');
$('#locLo').onchange = () => veDs();
const urls = [];
function veDs() {
  const los = [...new Set(ANH.map(a => a.lo))].sort(), chon = $('#locLo').value || tienTo();
  $('#locLo').innerHTML = los.map(l => `<option ${l === chon ? 'selected' : ''}>${l}</option>`).join('') || '<option>(chưa có ảnh)</option>';
  const lo = $('#locLo').value, ds = ANH.filter(a => a.lo === lo);
  urls.splice(0).forEach(u => URL.revokeObjectURL(u));
  $('#dsDem').textContent = `${lo}: ${ds.length} ảnh`;
  $('#ds').innerHTML = ds.map(a => { const u = URL.createObjectURL(a.blob); urls.push(u); return `<div class="o" data-id="${a.id}"><img src="${u}" loading="lazy" alt=""><small>${a.ten}</small><button data-xoa="${a.id}">✕</button></div>`; }).join('') || '<p>Chưa có ảnh nào.</p>';
}
let dangXem = null;
$('#ds').onclick = async e => {
  const x = e.target.closest('[data-xoa]');
  if (x) { e.stopPropagation(); if (confirm('Xoá ảnh này?')) { await DB.xoa(x.dataset.xoa); ANH = ANH.filter(a => a.id !== x.dataset.xoa); veDs(); capNhatDem(); } return; }
  const o = e.target.closest('.o'); if (!o) return;
  dangXem = ANH.find(a => a.id === o.dataset.id); $('#xemImg').src = URL.createObjectURL(dangXem.blob); $('#xem').hidden = false;
};
$('#xemDong').onclick = () => { $('#xem').hidden = true; };
$('#xemXoa').onclick = async () => { if (!dangXem || !confirm('Xoá ảnh ' + dangXem.ten + '?')) return; await DB.xoa(dangXem.id); ANH = ANH.filter(a => a !== dangXem); $('#xem').hidden = true; veDs(); capNhatDem(); };
$('#btnXoaLo').onclick = async () => {
  const lo = $('#locLo').value, ds = ANH.filter(a => a.lo === lo); if (!ds.length) return;
  if (!confirm(`Xoá ${ds.length} ảnh của mã ${lo}? (Nên gửi .zip trước)`)) return;
  for (const a of ds) await DB.xoa(a.id); ANH = ANH.filter(a => a.lo !== lo); veDs(); capNhatDem();
};

/* ---------- tạo .zip (không nén, ảnh JPG vốn đã nén) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
async function taoZip(ds) {
  const parts = [], central = []; let off = 0;
  const enc = new TextEncoder();
  for (const a of ds) {
    const data = new Uint8Array(await a.blob.arrayBuffer()), name = enc.encode(a.ten), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
    parts.push(h.buffer, name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(c.buffer, name);
    off += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((s, b) => s + (b.byteLength ?? b.length), 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, ds.length, true); e.setUint16(10, ds.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, e.buffer], { type: 'application/zip' });
}
$('#btnGui').onclick = async () => {
  const lo = $('#locLo').value, ds = ANH.filter(a => a.lo === lo);
  if (!ds.length) return toast('Chưa có ảnh');
  toast('Đang tạo tệp…');
  const d = new Date(), ten = `${lo}_${ds.length}anh_${d.getDate()}-${d.getMonth() + 1}_${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}.zip`;
  const f = new File([await taoZip(ds)], ten, { type: 'application/zip' });
  if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f], title: ten }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = ten; a.click(); toast('Đã lưu ' + ten + ' vào Tải xuống');
};

function toast(s) { const t = $('#toast'); t.textContent = s; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2600); }
document.addEventListener('visibilitychange', () => { if (document.hidden && den) { den = false; $('#btnDen').classList.remove('on'); } });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
napAnh().then(moCamera);
