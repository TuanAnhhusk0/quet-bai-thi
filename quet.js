/* ============================================================
   NHẬN PHIẾU TRONG ẢNH CHỤP – dùng chung cho app điện thoại và bản thử
   Tìm 10 ô vuông đen của phiếu BGD 2025 (5 ô mỗi mép), lấy 4 ô góc,
   nắn phối cảnh về ảnh chuẩn 1653 x 2338 (như ảnh máy quét 200 dpi).
   ============================================================ */
const QUET = (() => {
  // tâm 4 ô góc trên ảnh chuẩn (lấy từ omr.js của phần mềm chấm thi)
  const GOC_CHUAN = [[63.5, 52], [1602.6, 52], [1597, 2267], [56.8, 2264]]; // TL, TR, BR, BL
  const OUT_W = 1653, OUT_H = 2338;

  // ảnh xám từ ImageData
  function xam(id) {
    const d = id.data, g = new Uint8Array(id.width * id.height);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
    return g;
  }
  // điểm tối so với nền xung quanh (ngưỡng thích ứng theo trung bình ô lân cận, dùng ảnh tích phân)
  function nhiPhan(g, W, H) {
    const S = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) { let r = 0; for (let x = 0; x < W; x++) { r += g[y * W + x]; S[(y + 1) * (W + 1) + x + 1] = S[y * (W + 1) + x + 1] + r; } }
    const R = Math.max(8, Math.round(Math.min(W, H) / 20)), b = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
      for (let x = 0; x < W; x++) {
        const x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1);
        const tb = (S[y1 * (W + 1) + x1] - S[y0 * (W + 1) + x1] - S[y1 * (W + 1) + x0] + S[y0 * (W + 1) + x0]) / ((y1 - y0) * (x1 - x0));
        const v = g[y * W + x];
        if (v < tb * 0.62 && v < 150) b[y * W + x] = 1;
      }
    }
    return b;
  }
  // các vùng tối liền nhau có dạng ô vuông đặc
  function oVuong(b, W, H) {
    const seen = new Uint8Array(W * H), out = [], st = [];
    const minS = Math.max(3, W / 320), maxS = W / 14;   // phiếu chiếm ~1/2 khung thì ô vuông chỉ ~W/150
    for (let i = 0; i < b.length; i++) {
      if (!b[i] || seen[i]) continue;
      let n = 0, sx = 0, sy = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
      seen[i] = 1; st.push(i);
      while (st.length) {
        const p = st.pop(), x = p % W, y = (p - x) / W;
        n++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (n > 6000) continue;
        if (x > 0 && b[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; st.push(p - 1); }
        if (x < W - 1 && b[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; st.push(p + 1); }
        if (y > 0 && b[p - W] && !seen[p - W]) { seen[p - W] = 1; st.push(p - W); }
        if (y < H - 1 && b[p + W] && !seen[p + W]) { seen[p + W] = 1; st.push(p + W); }
      }
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      if (w < minS || h < minS || w > maxS || h > maxS || w / h > 1.6 || h / w > 1.6) continue;
      // ô vuông đặc gần đầy khung (ô tô tròn chỉ ~0,78; xoay nghiêng thì khung rộng hơn nên hạ ngưỡng theo độ lệch)
      const fill = n / (w * h);
      if (fill < 0.72) continue;
      out.push({ x: sx / n, y: sy / n, s: Math.sqrt(n), fill });
    }
    return out;
  }
  const kc2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  // số ô vuông nằm gần đoạn AB (kiểm tra mép trái / phải có đủ 5 mốc)
  function demTrenCanh(sq, A, B, tol) {
    const L = Math.sqrt(kc2(A, B)) || 1;
    return sq.filter(o => {
      const t = ((o.x - A[0]) * (B[0] - A[0]) + (o.y - A[1]) * (B[1] - A[1])) / (L * L);
      const d = Math.abs((o.x - A[0]) * (B[1] - A[1]) - (o.y - A[1]) * (B[0] - A[0])) / L;
      return t > -0.03 && t < 1.03 && d < tol;
    }).length;
  }
  /* tìm phiếu trong ImageData (nên thu nhỏ ~640–1200 px trước). Trả về {goc:[TL,TR,BR,BL], dien} hoặc null */
  function timPhieu(id) {
    const W = id.width, H = id.height, g = xam(id), b = nhiPhan(g, W, H);
    let sq = oVuong(b, W, H);
    if (sq.length < 8) return null;
    // giữ các ô có cỡ gần với cỡ phổ biến (mốc phiếu cùng cỡ)
    const sz = sq.map(o => o.s).sort((a, c) => a - c);
    const trungVi = sz[sz.length >> 1];
    let tot = null;
    for (const k of [trungVi, ...sz.filter((_, i) => i % Math.max(1, sz.length >> 3) === 0)]) {
      const nhom = sq.filter(o => o.s > k * 0.65 && o.s < k * 1.5);
      if (nhom.length < 8) continue;
      const tl = nhom.reduce((a, o) => o.x + o.y < a.x + a.y ? o : a), br = nhom.reduce((a, o) => o.x + o.y > a.x + a.y ? o : a);
      const tr = nhom.reduce((a, o) => o.x - o.y > a.x - a.y ? o : a), bl = nhom.reduce((a, o) => o.x - o.y < a.x - a.y ? o : a);
      let goc = [tl, tr, br, bl].map(o => [o.x, o.y]);
      if (new Set([tl, tr, br, bl]).size < 4) continue;
      // phiếu nằm ngang trong khung: cạnh trên dài hơn cạnh trái → xoay thứ tự góc
      if (kc2(goc[0], goc[1]) > kc2(goc[0], goc[3])) goc = [goc[3], goc[0], goc[1], goc[2]];
      const rong = Math.sqrt(kc2(goc[0], goc[1])), cao = Math.sqrt(kc2(goc[0], goc[3]));
      const tiLe = rong / cao;                                   // chuẩn 1539/2213 ≈ 0,70
      if (tiLe < 0.5 || tiLe > 0.95) continue;
      const tol = Math.max(3, k * 0.9);
      const trai = demTrenCanh(nhom, goc[0], goc[3], tol), phai = demTrenCanh(nhom, goc[1], goc[2], tol);
      if (trai < 4 || phai < 4) continue;                       // mỗi mép phải thấy ≥ 4 trong 5 mốc
      const dien = rong * cao / (W * H);
      if (dien < 0.12) continue;                                // phiếu quá nhỏ trong khung
      const diem = trai + phai + dien;
      if (!tot || diem > tot.diem) tot = { goc, dien, diem, trai, phai, co: k };
    }
    return tot;
  }
  // ma trận đồng nhất (homography) biến 4 điểm src → dst
  function homo(src, dst) {
    const A = [], bb = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); bb.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); bb.push(v);
    }
    for (let c = 0; c < 8; c++) { // khử Gauss
      let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [bb[c], bb[p]] = [bb[p], bb[c]];
      for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; bb[r] -= f * bb[c]; }
    }
    return [...bb.map((v, i) => v / A[i][i]), 1];
  }
  /* nắn ảnh nguồn (canvas / ImageData) theo 4 góc (toạ độ trên ảnh nguồn) → canvas 1653 x 2338 */
  function nan(srcData, goc, outW = OUT_W, outH = OUT_H) {
    const dst = GOC_CHUAN.map(([x, y]) => [x * outW / OUT_W, y * outH / OUT_H]);
    const h = homo(dst, goc);   // ánh xạ ngược: điểm ảnh đích → nguồn
    const sw = srcData.width, sh = srcData.height, s = srcData.data;
    const cv = mkCv(outW, outH), ctx = cv.getContext('2d'), out = ctx.createImageData(outW, outH), o = out.data;
    const s32 = new Uint32Array(s.buffer, s.byteOffset, s.length >> 2), o32 = new Uint32Array(o.buffer), TRANG = 0xffffffff;
    for (let y = 0; y < outH; y++) {
      let nx = h[1] * y + h[2], ny = h[4] * y + h[5], nw = h[7] * y + 1, j = y * outW;   // tử/mẫu tuyến tính theo x
      for (let x = 0; x < outW; x++, j++, nx += h[0], ny += h[3], nw += h[6]) {
        const fx = nx / nw, fy = ny / nw;
        if (fx < 0 || fy < 0 || fx >= sw - 1 || fy >= sh - 1) { o32[j] = TRANG; continue; }
        const x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0, p = y0 * sw + x0, q = p + sw;
        const a = s32[p], b = s32[p + 1], c = s32[q], d = s32[q + 1];
        const w00 = (1 - ax) * (1 - ay), w01 = ax * (1 - ay), w10 = (1 - ax) * ay, w11 = ax * ay;
        const r = (a & 255) * w00 + (b & 255) * w01 + (c & 255) * w10 + (d & 255) * w11;
        const g = (a >> 8 & 255) * w00 + (b >> 8 & 255) * w01 + (c >> 8 & 255) * w10 + (d >> 8 & 255) * w11;
        const bl = (a >> 16 & 255) * w00 + (b >> 16 & 255) * w01 + (c >> 16 & 255) * w10 + (d >> 16 & 255) * w11;
        o32[j] = 0xff000000 | (bl << 16) | (g << 8) | r;
      }
    }
    lamTrang(o, outW, outH);
    ctx.putImageData(out, 0, 0);
    return cv;
  }
  /* làm trắng nền giấy như máy quét: ước lượng độ sáng giấy từng vùng (phân vị 90 trong ô lưới),
     chia để nền về ~250, nét mực giữ đậm; sau đó làm nét nhẹ (unsharp) cho viền ô tô rõ */
  function lamTrang(o, W, H) {
    const C = Math.max(16, Math.round(W / 48)), nx = Math.ceil(W / C), ny = Math.ceil(H / C), bg = new Float32Array(nx * ny), hist = new Uint32Array(256);
    for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) {
      hist.fill(0); let n = 0;
      for (let y = cy * C; y < Math.min(H, (cy + 1) * C); y += 2) for (let x = cx * C; x < Math.min(W, (cx + 1) * C); x += 2) {
        const i = (y * W + x) * 4; hist[(o[i] * 77 + o[i + 1] * 150 + o[i + 2] * 29) >> 8]++; n++;
      }
      let k = 255, dem = 0; const can = n * 0.1;
      while (k > 0 && dem + hist[k] < can) dem += hist[k--];
      bg[cy * nx + cx] = Math.max(k, 40);
    }
    // làm mượt lưới nền (3x3, 2 lượt) để không lộ ô
    for (let lan = 0; lan < 2; lan++) {
      const t = bg.slice();
      for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) {
        let s = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = cy + dy, xx = cx + dx; if (yy >= 0 && yy < ny && xx >= 0 && xx < nx) { s += t[yy * nx + xx]; n++; } }
        bg[cy * nx + cx] = Math.max(t[cy * nx + cx], s / n);  // không kéo nền xuống vì vùng nhiều mực
      }
    }
    const X0 = new Int32Array(W), AX = new Float32Array(W), hang = new Float32Array(nx);
    for (let x = 0; x < W; x++) { const gx = Math.min(nx - 1.001, Math.max(0, x / C - 0.5)); X0[x] = gx | 0; AX[x] = gx - X0[x]; }
    for (let y = 0; y < H; y++) {
      const gy = Math.min(ny - 1.001, Math.max(0, y / C - 0.5)), y0 = gy | 0, ay = gy - y0;
      for (let cx = 0; cx < nx; cx++) hang[cx] = bg[y0 * nx + cx] * (1 - ay) + bg[Math.min(ny - 1, y0 + 1) * nx + cx] * ay;
      for (let x = 0, i = y * W * 4; x < W; x++, i += 4) {
        const x0 = X0[x], b = hang[x0] + (hang[Math.min(nx - 1, x0 + 1)] - hang[x0]) * AX[x];
        const g = b < 62.5 ? 4 : 250 / b;
        o[i] = o[i] * g; o[i + 1] = o[i + 1] * g; o[i + 2] = o[i + 2] * g;
      }
    }
    // unsharp nhẹ: x + 0,6·(x − trung bình 3x3)
    const R = W * 4; let tren = o.slice(0, R), giua = o.slice(R, 2 * R);
    for (let y = 1; y < H - 1; y++) {
      const duoi = o.slice((y + 1) * R, (y + 2) * R), base = y * R;
      for (let x = 4; x < R - 4; x++) {
        if ((x & 3) === 3) continue;
        const v = giua[x], m = (giua[x - 4] + giua[x + 4] + tren[x] + duoi[x] + v * 4) / 8;
        o[base + x] = v + 0.6 * (v - m);
      }
      tren = giua; giua = duoi;
    }
  }
  const mkCv = (w, h) => { if (typeof document === 'undefined') return new OffscreenCanvas(w, h); const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  /* đọc nhanh SBD, mã đề, Phần I, Phần II trên ảnh đã nắn (toạ độ ô tô lấy từ omr.js của phần mềm chấm thi)
     → chuỗi "vân tay" để nhận ra phiếu đã chụp, và hiện SBD cho thầy xem */
  const DY = [260.5, 306.1, 351.7, 397.2, 443.1, 489.6, 536.3, 582.5, 629.0, 675.6];
  const SBD_X = [1156.4, 1187.6, 1220.3, 1251.9, 1283.2, 1315.2, 1347.2, 1378.9], MADE_X = [1441.8, 1473.5, 1504.9, 1537.4];
  const P1_X = [[186.3, 251.5, 316.9, 382.3], [555.1, 620.9, 687.0, 751.8], [925.3, 990.2, 1056.4, 1121.4], [1294.5, 1360.7, 1426.3, 1490.9]];
  const P1_Y = [845.5, 885.4, 925.1, 964.9, 1004.9, 1044.9, 1085.4, 1125.9, 1165.8, 1206.1];
  const P2_X = [[184.5, 249.5], [315.2, 381.2], [551.5, 618.8], [684.2, 749.5], [923.0, 988.2], [1054.8, 1119.8], [1291.8, 1357.8], [1423.0, 1489.2]];
  const P2_Y = [1401.0, 1440.9, 1480.5, 1520.5];
  function docNhanh(cvNan, lat = false) {
    const W = cvNan.width, Hc = cvNan.height, k = W / OUT_W, d = cvNan.getContext('2d').getImageData(0, 0, W, Hc).data, r = Math.max(1, Math.round(7 * k));
    const G = GOC_CHUAN, hl = lat ? homo(G, [G[2], G[3], G[0], G[1]]) : null;   // phiếu lộn ngược: điểm chuẩn → vị trí trên ảnh xoay 180°
    const dam = (x, y) => { // độ đậm kênh đỏ quanh tâm ô (nét in hồng gần như biến mất)
      if (hl) { const w = hl[6] * x + hl[7] * y + 1, X = (hl[0] * x + hl[1] * y + hl[2]) / w; y = (hl[3] * x + hl[4] * y + hl[5]) / w; x = X; }
      x = Math.round(x * k); y = Math.round(y * k); if (x < r || y < r || x >= W - r || y >= Hc - r) return 0; let s = 0, n = 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { s += d[((y + dy) * W + x + dx) * 4]; n++; }
      return 1 - s / n / 245;
    };
    const chon = vals => { const m = Math.max(...vals), i = vals.indexOf(m); return m > 0.35 ? (vals.filter(v => v > 0.35 && v > m * 0.6).length > 1 ? '*' : i) : '_'; };
    const so = xs => xs.map(x => chon(DY.map(y => dam(x, y)))).join('');
    const sbd = so(SBD_X), made = so(MADE_X);
    let p1 = '';
    for (let q = 0; q < 40; q++) { const c = chon(P1_X[q / 10 | 0].map(x => dam(x, P1_Y[q % 10]))); p1 += typeof c === 'number' ? 'ABCD'[c] : c; }
    let p2 = '';
    for (let q = 0; q < 8; q++) for (let s = 0; s < 4; s++) { const c = chon(P2_X[q].map(x => dam(x, P2_Y[s]))); p2 += typeof c === 'number' ? 'ĐS'[c] : c; }
    if (!lat && /[_*]/.test(sbd + made)) { const l = docNhanh(cvNan, true); if (!/[_*]/.test(l.sbd + l.made)) return l; }   // phiếu lộn ngược
    return { sbd, made, chuoi: sbd + made + p1 + p2 };
  }
  function docGoc(id, goc, lat = false) {
    const h = homo(GOC_CHUAN, goc), W = id.width, H = id.height, d = id.data;
    const tl = Math.hypot(goc[1][0] - goc[0][0], goc[1][1] - goc[0][1]) / (GOC_CHUAN[1][0] - GOC_CHUAN[0][0]), r = Math.max(1, Math.round(6 * tl));
    const sang = (X, Y) => {
      const w = h[6] * X + h[7] * Y + 1, x = Math.round((h[0] * X + h[1] * Y + h[2]) / w), y = Math.round((h[3] * X + h[4] * Y + h[5]) / w);
      if (x < r || y < r || x >= W - r || y >= H - r) return 0;
      let s = 0, n = 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { s += d[((y + dy) * W + x + dx) * 4]; n++; }
      return s / n;
    };
    const chon = vals => { const ref = Math.max(...vals); if (ref < 60) return '_'; const dk = vals.map(v => 1 - v / ref), m = Math.max(...dk), i = dk.indexOf(m); return m > 0.35 ? (dk.filter(v => v > 0.35 && v > m * 0.6).length > 1 ? '*' : i) : '_'; };
    const so = xs => xs.map(x => chon(DY.map(y => sang(x, y)))).join('');
    const sbd = so(SBD_X), made = so(MADE_X);
    if (!lat && /[_*]/.test(sbd + made)) { const l = docGoc(id, [goc[2], goc[3], goc[0], goc[1]], true); if (!/[_*]/.test(l.sbd + l.made)) return l; }   // phiếu lộn ngược
    return { sbd, made };
  }
  // số kí tự khác nhau giữa hai chuỗi vân tay (cùng phiếu chụp lại: 0–3; phiếu khác: SBD / bài làm khác nhiều)
  const khacNhau = (a, b) => { if (!a || !b) return 999; let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
  const vanTay = cvNan => docNhanh(cvNan).chuoi;
  // thu nhỏ ảnh / video về chiều rộng w để dò nhanh
  function thuNho(src, sw, sh, w) {
    const k = w / sw, c = mkCv(Math.round(sw * k), Math.round(sh * k));
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(src, 0, 0, c.width, c.height);
    return { id: ctx.getImageData(0, 0, c.width, c.height), k };
  }
  /* chụp đầy đủ: ảnh nguồn lớn (canvas / ImageBitmap) → dò lại góc chính xác ở ~1400 px → nắn */
  function xuLyAnh(src, sw, sh) {
    const nho = thuNho(src, sw, sh, Math.min(1000, sw));
    const r = timPhieu(nho.id);
    if (!r) return null;
    const full = mkCv(sw, sh), ctx = full.getContext('2d', { willReadFrequently: true }); ctx.drawImage(src, 0, 0);
    const goc = r.goc.map(([x, y]) => [x / nho.k, y / nho.k]);
    return { cv: nan(ctx.getImageData(0, 0, sw, sh), goc), goc, r };
  }
  return { timPhieu, nan, xuLyAnh, thuNho, vanTay, docNhanh, docGoc, khacNhau, OUT_W, OUT_H, _soi: { xam, nhiPhan, oVuong, lamTrang, homo } };
})();
if (typeof module !== 'undefined') module.exports = QUET;
// chạy trong luồng nền (Web Worker): nhận ảnh khung hình → nắn, làm trắng, nén JPEG, đọc nhanh
if (typeof document === 'undefined' && typeof self !== 'undefined' && typeof importScripts === 'function') {
  self.onmessage = async e => {
    const { so, bm } = e.data;
    try {
      const kq = QUET.xuLyAnh(bm, bm.width, bm.height); bm.close();
      if (!kq) return self.postMessage({ so, loi: 'khong-thay' });
      const blob = await kq.cv.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
      self.postMessage({ so, blob, doc: QUET.docNhanh(kq.cv) });
    } catch (err) { self.postMessage({ so, loi: String(err && err.message || err) }); }
  };
}
