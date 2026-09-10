// ============================================================
//  GPS Center Lite — script.js
//  Tanpa Leaflet, tanpa Chart.js
//  Canvas sendiri untuk Skyplot + Signal bars
// ============================================================

'use strict';

// ===== LEAFLET MAP (file lokal, offline-ready) =====
const leafletMap = L.map('map', { zoomControl: true }).setView([-6.2, 106.816], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a>'
}).addTo(leafletMap);
let mapMarker = null;

// ===== WARNA KONSTELASI =====
const COLORS = {
    GP: '#ff9800',
    GL: '#42a5f5',
    GA: '#fdd835',
    GB: '#66bb6a',
    GN: '#90a4ae',
};
function constColor(type) { return COLORS[type] || '#9e9e9e'; }

// ===== FIX MODE =====
const FIX_LABELS = {
    '0': 'No Fix', '1': 'GPS Fix', '2': 'DGPS Fix',
    '3': '3D Fix',  '4': 'Fix',    '5': 'Float RTK', '6': 'RTK Fixed'
};
function fixClass(q) {
    if (q === '6') return 'fix-rtk';
    if (q === '5') return 'fix-float';
    if (q !== '0' && q !== '') return 'fix-ok';
    return '';
}
function applyFix(el, quality) {
    el.className = el.className.replace(/fix-\S+/g, '').trim();
    const cls = fixClass(String(quality));
    if (cls) el.classList.add(cls);
    el.textContent = FIX_LABELS[String(quality)] || `Fix (${quality})`;
}

// ===== GOOGLE MAPS LINK =====
let _lat = null, _lon = null;
function openMaps() {
    if (_lat !== null && _lon !== null)
        window.open(`https://www.google.com/maps?q=${_lat},${_lon}`, '_blank');
}
const mapsBtn = document.getElementById('maps-btn');
if (mapsBtn) mapsBtn.disabled = true;

// ===== FLASH HELPER =====
function flash(el) {
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
}

// ============================================================
//  ① SKYPLOT CANVAS
// ============================================================
const skyCanvas = document.getElementById('skyCanvas');
const skyCtx    = skyCanvas.getContext('2d');
let lastSats    = [];

function resizeSky() {
    const wrap = skyCanvas.parentElement;
    const size = Math.min(wrap.clientWidth, wrap.clientHeight) - 14;
    if (size > 0) {
        skyCanvas.width  = size;
        skyCanvas.height = size;
        drawSky(lastSats);
    }
}

function drawSky(sats) {
    lastSats = sats;
    const c = skyCanvas, ctx = skyCtx;
    const w = c.width, h = c.height;
    const cx = w / 2, cy = h / 2;
    const maxR = Math.min(cx, cy) - 22;

    ctx.clearRect(0, 0, w, h);

    // Background circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, maxR, 0, 2 * Math.PI);
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
    bg.addColorStop(0, '#f0f4f8');
    bg.addColorStop(1, '#e8edf2');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = '#b0bec5';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Elevation rings (0°, 30°, 60°)
    [0, 30, 60].forEach(elv => {
        const r = (90 - elv) / 90 * maxR;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.strokeStyle = elv === 0 ? '#b0bec5' : '#cfd8dc';
        ctx.lineWidth   = elv === 0 ? 1.5 : 1;
        ctx.stroke();
        if (elv > 0) {
            ctx.fillStyle = '#90a4ae';
            ctx.font = '9px system-ui, sans-serif';
            ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            ctx.fillText(elv + '°', cx + 3, cy - r + 2);
        }
    });

    // Crosshair
    ctx.strokeStyle = '#b0bec5'; ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy); ctx.stroke();
    ctx.setLineDash([]);

    // Compass
    ctx.fillStyle = '#455a64'; ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';  ctx.fillText('N', cx, cy - maxR - 4);
    ctx.textBaseline = 'top';                                ctx.fillText('S', cx, cy + maxR + 4);
    ctx.textAlign = 'left';  ctx.textBaseline = 'middle';   ctx.fillText('E', cx + maxR + 5, cy);
    ctx.textAlign = 'right';                                 ctx.fillText('W', cx - maxR - 5, cy);

    // Satellites
    const showUntracked = document.getElementById('showNotTracked').checked;

    sats.forEach(sat => {
        const elv = parseFloat(sat.elv) || 0;
        const az  = parseFloat(sat.az)  || 0;
        const cno = parseFloat(sat.cno) || 0;
        const untracked = (cno === 0);

        if (untracked && !showUntracked) return;

        const r     = (90 - elv) / 90 * maxR;
        const azRad = az * Math.PI / 180;
        const x     = cx + r * Math.sin(azRad);
        const y     = cy - r * Math.cos(azRad);
        const rad   = 11;

        ctx.beginPath();
        ctx.arc(x, y, rad, 0, 2 * Math.PI);

        if (untracked) {
            ctx.fillStyle   = 'rgba(239,83,80,0.10)';
            ctx.fill();
            ctx.strokeStyle = '#ef5350'; ctx.lineWidth = 2; ctx.stroke();
        } else {
            const col = constColor(sat.type);
            ctx.fillStyle   = col; ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1; ctx.stroke();
            // Glow untuk sinyal kuat
            if (cno >= 35) {
                ctx.beginPath(); ctx.arc(x, y, rad + 3, 0, 2 * Math.PI);
                ctx.strokeStyle = col + '55'; ctx.lineWidth = 2; ctx.stroke();
            }
        }

        // PRN label
        ctx.fillStyle = untracked ? '#ef5350' : (sat.type === 'GA' ? '#555' : '#fff');
        const prn = sat.prn.toString();
        ctx.font = `bold ${prn.length > 2 ? 7 : 9}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(prn, x, y);
    });
}

window.addEventListener('load', () => {
    resizeSky();
    drawSky([]);
    resizeSig();
    // Paksa Leaflet render ulang setelah layout flex selesai
    setTimeout(() => leafletMap.invalidateSize(), 200);
});
window.addEventListener('resize', () => { resizeSky(); resizeSig(); });
document.getElementById('showNotTracked').addEventListener('change', () => drawSky(lastSats));

// ============================================================
//  ③ SIGNAL BAR CHART — Canvas buatan sendiri (tanpa Chart.js)
// ============================================================
const sigCanvas = document.getElementById('sigCanvas');
const sigCtx    = sigCanvas.getContext('2d');
let lastSigData = { labels: [], values: [], colors: [] };

function resizeSig() {
    const wrap = sigCanvas.parentElement;
    sigCanvas.width  = wrap.clientWidth;
    sigCanvas.height = wrap.clientHeight;
    drawSig(lastSigData.labels, lastSigData.values, lastSigData.colors);
}

function drawSig(labels, values, colors) {
    lastSigData = { labels, values, colors };
    const c = sigCanvas, ctx = sigCtx;
    const W = c.width, H = c.height;

    ctx.clearRect(0, 0, W, H);

    if (labels.length === 0) {
        ctx.fillStyle = '#bbb';
        ctx.font = '12px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('Menunggu data satelit...', W / 2, H / 2);
        return;
    }

    const MAX_VAL  = 55;
    const PAD_L    = 38;   // ruang label Y
    const PAD_R    = 6;
    const PAD_T    = 8;
    const PAD_B    = 22;   // ruang label X

    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_T - PAD_B;

    // Grid Y
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillStyle = '#999';
    ctx.textAlign = 'right';
    [0, 10, 20, 30, 40, 50].forEach(v => {
        const y = PAD_T + chartH - (v / MAX_VAL * chartH);
        ctx.fillText(v, PAD_L - 4, y + 3);
        ctx.beginPath();
        ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y);
        ctx.strokeStyle = v === 0 ? '#bbb' : '#ececec';
        ctx.lineWidth = 1;
        ctx.stroke();
    });

    // Bars
    const n       = labels.length;
    const slotW   = chartW / n;
    const barW    = Math.max(3, Math.min(18, slotW * 0.65));

    labels.forEach((lbl, i) => {
        const val  = Math.max(0, Math.min(MAX_VAL, values[i] || 0));
        const barH = (val / MAX_VAL) * chartH;
        const x    = PAD_L + i * slotW + slotW / 2;
        const y    = PAD_T + chartH - barH;

        // Bar (arched top)
        const r = Math.min(3, barW / 2);
        ctx.beginPath();
        if (barH >= r * 2) {
            ctx.moveTo(x - barW / 2, PAD_T + chartH);
            ctx.lineTo(x - barW / 2, y + r);
            ctx.arcTo(x - barW / 2, y, x - barW / 2 + r, y, r);
            ctx.lineTo(x + barW / 2 - r, y);
            ctx.arcTo(x + barW / 2, y, x + barW / 2, y + r, r);
            ctx.lineTo(x + barW / 2, PAD_T + chartH);
        } else {
            ctx.rect(x - barW / 2, y, barW, barH);
        }
        ctx.closePath();
        ctx.fillStyle = colors[i] || '#ccc';
        ctx.fill();

        // Label X
        ctx.fillStyle = '#555';
        ctx.font = n > 25 ? '7px system-ui, sans-serif' : '8px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(lbl, x, H - 6);
    });
}

window.addEventListener('load', () => { resizeSig(); });

// ============================================================
//  DUMMY DATA GENERATOR (For GitHub Pages)
// ============================================================
console.log('[GPS Lite] Menggunakan data Dummy (Offline/GitHub Pages)');
const dot  = document.getElementById('conn-dot');
const stat = document.getElementById('conn-status');
if (dot)  { dot.classList.add('connected'); }
if (stat) { stat.textContent = 'Receiving dummy data'; stat.className = 'device-status ok'; }

// Generate dummy data every 1 second
setInterval(() => {
    // Random coordinate around Jakarta
    const lat = (-6.2 + (Math.random() * 0.01 - 0.005)).toFixed(5);
    const lon = (106.816 + (Math.random() * 0.01 - 0.005)).toFixed(5);
    const spd = (Math.random() * 10).toFixed(1);
    const alt = (Math.random() * 50).toFixed(1);
    const numSV = Math.floor(Math.random() * 10) + 5; // 5 to 14
    
    // Generate dummy satellites
    const sats = [];
    const types = ['GP', 'GL', 'GA', 'GB', 'GN'];
    for(let i=0; i<numSV + 3; i++) {
        sats.push({
            prn: Math.floor(Math.random() * 30) + 1,
            elv: Math.random() * 90,
            az: Math.random() * 360,
            cno: Math.random() > 0.2 ? Math.floor(Math.random() * 30) + 15 : 0,
            type: types[Math.floor(Math.random() * types.length)]
        });
    }

    const data = {
        lat: lat,
        lon: lon,
        alt: alt,
        quality: '3', // 3D Fix
        numSV: numSV.toString(),
        spd: spd,
        cog: (Math.random() * 360).toFixed(1),
        utc: new Date().toISOString().substring(11, 19),
        pdop: (Math.random() * 2 + 1).toFixed(1),
        hdop: (Math.random() * 2 + 0.5).toFixed(1),
        satellites: sats
    };
    
    updateGPS(data);
}, 1000);

function updateGPS(data) {

    // ---- Fix Mode ----
    const fixEl    = document.getElementById('d-fix');
    const posFix   = document.getElementById('pos-fix');
    const fixText  = FIX_LABELS[data.quality] || `Fix (${data.quality})`;
    if (fixEl.textContent !== fixText) {
        applyFix(fixEl, data.quality);
        applyFix(posFix, data.quality);
        flash(fixEl.parentElement);
    }

    // ---- Koordinat ----
    const newLat = data.lat !== 'Mencari...' ? data.lat : '--';
    const newLon = data.lon !== 'Mencari...' ? data.lon : '--';

    const latEl = document.getElementById('d-lat');
    const lonEl = document.getElementById('d-lon');
    if (latEl.textContent !== newLat) { latEl.textContent = newLat; flash(latEl.parentElement); }
    if (lonEl.textContent !== newLon) { lonEl.textContent = newLon; flash(lonEl.parentElement); }

    // Update Leaflet map
    if (newLat !== '--' && newLon !== '--') {
        _lat = parseFloat(newLat);
        _lon = parseFloat(newLon);
        if (!isNaN(_lat) && !isNaN(_lon)) {
            leafletMap.setView([_lat, _lon], leafletMap.getZoom());
            if (mapMarker) {
                mapMarker.setLatLng([_lat, _lon]);
            } else {
                mapMarker = L.marker([_lat, _lon]).addTo(leafletMap);
            }
            if (mapsBtn) mapsBtn.disabled = false;
        }
    }

    // ---- Data lain ----
    document.getElementById('d-alt').textContent  = data.alt !== 'Mencari...' ? data.alt + ' m' : '--';
    document.getElementById('d-spd').textContent  = data.spd !== '0' ? data.spd + ' knots' : '0.000';
    document.getElementById('d-utc').textContent  = data.utc  || '--';
    document.getElementById('d-pdop').textContent = data.pdop || '--';
    document.getElementById('d-hdop').textContent = data.hdop || '--';
    document.getElementById('d-numsv').textContent = data.numSV || '0';

    // ---- Satellites ----
    const sats      = data.satellites || [];
    const numSVused = parseInt(data.numSV) || 0;

    // Badge total
    const badge = document.getElementById('sat-badge');
    if (badge) badge.textContent = sats.length + ' sats';

    if (sats.length > 0) {
        drawSky(sats);

        const counts = {};
        ['GP', 'GL', 'GA', 'GB', 'GN'].forEach(t => counts[t] = { total: 0, tracked: 0 });

        const labels = [], barVals = [], colors = [];

        sats.forEach(sat => {
            const t = sat.type || 'GP';
            if (counts[t]) {
                counts[t].total++;
                if (sat.cno > 0) counts[t].tracked++;
            }
            const pfx = { GP: 'G', GL: 'R', GA: 'E', GB: 'B', GN: 'S' }[t] || 'U';
            labels.push(`${pfx}${sat.prn}`);
            barVals.push(sat.cno);
            colors.push(sat.cno > 0 ? constColor(t) : '#d0d0d0');
        });

        document.getElementById('count-gps').textContent     = `${counts.GP.tracked}/${counts.GP.total}`;
        document.getElementById('count-sbas').textContent    = `${counts.GN.tracked}/${counts.GN.total}`;
        document.getElementById('count-galileo').textContent = `${counts.GA.tracked}/${counts.GA.total}`;
        document.getElementById('count-beidou').textContent  = `${counts.GB.tracked}/${counts.GB.total}`;
        document.getElementById('count-glonass').textContent = `${counts.GL.tracked}/${counts.GL.total}`;

        const totalTracked = Object.values(counts).reduce((s, c) => s + c.tracked, 0);
        document.getElementById('d-notused').textContent = Math.max(0, totalTracked - numSVused);

        // Gambar signal bars
        drawSig(labels, barVals, colors);
    }
}
