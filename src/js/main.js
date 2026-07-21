"use strict";
function tickClock() {
    document.getElementById('clock').textContent = new Date().toLocaleTimeString();
}
setInterval(tickClock, 1000); tickClock();

const idEl = document.getElementById('spotterId');
const rememberEl = document.getElementById('rememberMe');
const endpointEl = document.getElementById('endpointUrl');

try {
    const saved = JSON.parse(localStorage.getItem('sn_creds') || 'null');
    if (saved) {
        idEl.value = saved.id || '';
        if (saved.endpoint) endpointEl.value = saved.endpoint;
        rememberEl.checked = true;
    }
} catch (e) { }

function persistCreds() {
    if (rememberEl.checked) {
        localStorage.setItem('sn_creds', JSON.stringify({ id: idEl.value, endpoint: endpointEl.value }));
    } else {
        localStorage.removeItem('sn_creds');
    }
}
idEl.addEventListener('change', persistCreds);
endpointEl.addEventListener('change', persistCreds);
rememberEl.addEventListener('change', persistCreds);

const map = L.map('map', { zoomControl: false, attributionControl: false }).setView([39.8, -98.5], 4);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
let marker = null, accuracyCircle = null;

function updateMap(lat, lon, acc) {
    if (!marker) {
        marker = L.circleMarker([lat, lon], { radius: 7, color: '#ffb020', fillColor: '#ffb020', fillOpacity: 0.9 }).addTo(map);
        accuracyCircle = L.circle([lat, lon], { radius: acc || 50, color: '#3fd0e0', fillOpacity: 0.08, weight: 1 }).addTo(map);
        map.setView([lat, lon], 13);
    } else {
        marker.setLatLng([lat, lon]);
        accuracyCircle.setLatLng([lat, lon]);
        accuracyCircle.setRadius(acc || 50);
    }
}

let watchId = null;
let lastFix = null;
const gpsDot = document.getElementById('gpsDot');
const btnTrack = document.getElementById('btnTrack');

function fmt(n, d) { return (typeof n === 'number' && !isNaN(n)) ? n.toFixed(d) : '—'; }

function onFix(pos) {
    const c = pos.coords;
    lastFix = {
        lat: c.latitude, lon: c.longitude, accuracy: c.accuracy,
        altitude: c.altitude, heading: c.heading, speed: c.speed,
        t: new Date(pos.timestamp)
    };
    gpsDot.classList.add('live'); gpsDot.classList.remove('bad');
    document.getElementById('rStatus').textContent = 'locked';
    document.getElementById('rLat').textContent = fmt(c.latitude, 6);
    document.getElementById('rLon').textContent = fmt(c.longitude, 6);
    document.getElementById('rAcc').textContent = fmt(c.accuracy, 0) + ' m';
    document.getElementById('rAlt').textContent = (c.altitude != null ? fmt(c.altitude, 0) + ' m' : '—');
    document.getElementById('rHead').textContent = (c.heading != null ? fmt(c.heading, 0) + '°' : '—');
    document.getElementById('rSpeed').textContent = (c.speed != null ? fmt(c.speed * 2.237, 1) + ' mph' : '—');
    document.getElementById('rTime').textContent = lastFix.t.toLocaleTimeString();
    updateMap(c.latitude, c.longitude, c.accuracy);
}

function onFixError(err) {
    gpsDot.classList.remove('live'); gpsDot.classList.add('bad');
    document.getElementById('rStatus').textContent = 'error: ' + err.message;
    addLog('GPS error', err.message, 'fail');
}

btnTrack.addEventListener('click', function () {
    if (!navigator.geolocation) {
        addLog("GPS","This browser doesn't support geolocation. Genuinely, how.", "fail");
        return;
    }
    if (watchId === null) {
        document.getElementById('rStatus').textContent = 'acquiring…';
        watchId = navigator.geolocation.watchPosition(onFix, onFixError, {
            enableHighAccuracy: true, maximumAge: 2000, timeout: 15000
        });
        btnTrack.textContent = 'Stop GPS Tracking';
    } else {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        gpsDot.classList.remove('live');
        document.getElementById('rStatus').textContent = 'stopped';
        btnTrack.textContent = 'Start GPS Tracking';
        if (autoPingEl.checked) stopAutoPing();
    }
});

const MIN_PING_INTERVAL = 120;
const autoPingEl = document.getElementById('autoPing');
const autoIntervalEl = document.getElementById('autoInterval');
let autoPingCountdownTimer = null;
let secondsRemaining = 0;

function clampInterval() {
    let v = parseInt(autoIntervalEl.value, 10);
    if (isNaN(v) || v < MIN_PING_INTERVAL) v = MIN_PING_INTERVAL;
    autoIntervalEl.value = v;
    return v;
}
autoIntervalEl.addEventListener('change', clampInterval);
autoIntervalEl.addEventListener('blur', clampInterval);
autoIntervalEl.addEventListener('input', function () {
    if (this.value !== '' && parseInt(this.value, 10) < MIN_PING_INTERVAL) {
        this.style.borderColor = 'var(--tornado-red)';
    } else {
        this.style.borderColor = '';
    }
});

function updateCountdownDisplay() {
    document.getElementById('apCountdown').textContent = secondsRemaining + 's';
}

function startAutoPing() {
    if (!lastFix) {
        addLog("Auto-Ping","Need a GPS fix before auto-ping can start. Hit \"Start GPS Tracking\" first.", "fail");
        autoPingEl.checked = false;
        return;
    }
    const interval = clampInterval();
    autoIntervalEl.disabled = true;
    document.getElementById('autoPingStatus').style.display = 'grid';
    document.getElementById('apState').textContent = 'on — every ' + interval + 's';
    secondsRemaining = interval;
    updateCountdownDisplay();
    autoPingCountdownTimer = setInterval(function () {
        secondsRemaining--;
        if (secondsRemaining <= 0) {
            if (lastFix) {
                sendPing();
                document.getElementById('apLast').textContent = new Date().toLocaleTimeString();
            } else {
                addLog('Auto-Ping', 'Skipped. No GPS fix at send time.', 'fail');
            }
            secondsRemaining = clampInterval();
        }
        updateCountdownDisplay();
    }, 1000);
    addLog('Auto-Ping', 'Started. Sending GPS fix every ' + interval + 's.', 'ok');
}

function stopAutoPing() {
    if (autoPingCountdownTimer) { clearInterval(autoPingCountdownTimer); autoPingCountdownTimer = null; }
    autoIntervalEl.disabled = false;
    document.getElementById('apState').textContent = 'off';
    document.getElementById('apCountdown').textContent = '—';
    autoPingEl.checked = false;
}

autoPingEl.addEventListener('change', function (e) {
    if (e.target.checked) startAutoPing(); else stopAutoPing();
});


let hazard = null;
document.getElementById('hazardGrid').addEventListener('click', function (e) {
    const t = e.target.closest('.hz');
    if (!t) return;
    document.querySelectorAll('.hz').forEach(h => h.classList.remove('active'));
    t.classList.add('active');
    hazard = t.dataset.v;
    document.getElementById('narrHint').style.display = t.dataset.narr ? 'block' : 'none';
});

const logEl = document.getElementById('log');
function addLog(title, detail, statusClass) {
    if (logEl.querySelector('.empty')) logEl.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'entry';
    const statusText = statusClass === 'ok' ? 'SENT' : statusClass === 'fail' ? 'FAILED' : 'COPIED';
    div.innerHTML = '<span class="status ' + statusClass + '">' + statusText + '</span><b>' + title + '</b><br>' + detail + '<br><span style="opacity:.6">' + new Date().toLocaleTimeString() + '</span>';
    logEl.prepend(div);
}

function buildReportText(kind) {
    if (!lastFix) {
        return null;
    }
    const id = idEl.value.trim() || '(no spotter id set)';
    const lines = [
        '=== SpotterNetwork Report (' + kind + ') ===',
        'Spotter ID: ' + id,
        'Time: ' + new Date().toISOString(),
        'Lat: ' + lastFix.lat.toFixed(6),
        'Lon: ' + lastFix.lon.toFixed(6),
        'Accuracy: ' + Math.round(lastFix.accuracy) + ' m',
    ];
    if (kind === 'report') {
        lines.push('Hazard: ' + (hazard || '(none selected)'));
        lines.push('Magnitude: ' + (document.getElementById('magnitude').value || '—'));
        lines.push('Observed: ' + (document.getElementById('obsTime').value || 'now'));
        lines.push('Notes: ' + (document.getElementById('notes').value || '—'));
    }
    return lines.join('\n');
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); document.body.removeChild(ta); return true; }
        catch (e2) { document.body.removeChild(ta); return false; }
    }
}

async function sendPing() {
    const url = endpointEl.value.trim();
    const id = idEl.value.trim();
    const text = buildReportText('ping');
    if (!id) {
        addLog('Position Ping', 'No private spotter ID set. Please set one to do this action.', 'failed');
        return;
    }
    try {
        const payload = new URLSearchParams({ id, lat: lastFix.lat, lon: lastFix.lon, gps: 1 });
        const resp = await fetch(url, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: payload.toString()
        });
        if (resp.ok) {
            addLog('Position Ping', 'Position ping successfully sent to spotternetwork.org. Please check and see if your location was actually updated.', 'ok');
        } else {
            throw new Error('HTTP ' + resp.status);
        }
    } catch (err) {
        addLog('Position Ping', 'Unable to send. Error: (' + err.message + ')', 'fail');
    }
}

async function lookupCwa() {
    if (!lastFix) { addLog("CWA Lookup", "Hey, where is your location? Have you tried pressing that \"Start GPS Tracking\" button yet? I can't look up a CWA for a location that I don't have...", "fail"); return; }
    const base = new URL(endpointEl.value.trim()).origin;
    const url = base + '/report/cwa/' + lastFix.lat + '/' + lastFix.lon;
    try {
        const resp = await fetch(url, { mode: 'cors' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const txt = await resp.text();
        const xml = new DOMParser().parseFromString(txt, 'text/xml');
        const m = xml.querySelector('marker');
        if (!m) throw new Error('No marker in response');
        document.getElementById('cwaReadout').style.display = 'grid';
        document.getElementById('cwaCounty').textContent = m.getAttribute('z_county') || '—';
        document.getElementById('cwaState').textContent = m.getAttribute('state') || '—';
        document.getElementById('cwaZone').textContent = m.getAttribute('z_fullzone') || '—';
        document.getElementById('cwaOffice').textContent = m.getAttribute('cwa') || '—';
        document.getElementById('cwaPhone').textContent = m.getAttribute('phone') || '—';
        addLog('CWA Lookup', 'Pulled CWA information.', 'ok');
    } catch (err) {
        addLog('CWA Lookup', 'Unable to send. Error: (' + err.message + ')', 'fail');
    }
}

document.getElementById('btnPing').addEventListener('click', function () {
    if (!lastFix) { addLog("Position Ping", "Hey, where is your location? Have you tried pressing that \"Start GPS Tracking\" button yet? I can't send out a location I don't have...", "fail"); return; }
    sendPing();
});

document.getElementById('btnCwa').addEventListener('click', lookupCwa);

document.getElementById('btnSubmit').addEventListener('click', async function () {
    if (!lastFix) { addLog("SpotterNetwork Report", "Hey, where is your location? Have you tried pressing that \"Start GPS Tracking\" button yet? I can't send a report without that...", "fail"); return; }
    if (!hazard) { addLog("SpotterNetwork Report", "Are you trying to submit nothing? Please select a hazard type before submitting.", "fail"); return; }
    const requiresNarrative = document.querySelector('.hz.active')?.dataset.narr;
    if (requiresNarrative && !document.getElementById('notes').value.trim()) {
      addLog("SpotterNetwork Report", "This type of report requires a narrative.", "fail");
      return;
    }
    const text = buildReportText('report');
    await copyText(text);
    addLog('Severe Report', 'The reporting feature isn\'t fully completed yet. SpotterNetwork\'s website will open and your report will be copied to your clipboard. Continue there.', 'copied');
    window.open(document.getElementById('reportUrl').value.trim() || 'https://www.spotternetwork.org/report/severe', '_blank', 'noopener');
});

document.getElementById('btnCopy').addEventListener('click', async function () {
    if (!lastFix) { addLog("Manual Copy", "No GPS fix yet - nothing to copy.", "fail"); return; }
    const text = buildReportText(hazard ? 'report' : 'ping');
    const ok = await copyText(text);
    addLog('Manual Copy', ok ? 'Report text copied to clipboard.' : 'Copy failed. Your browser blocked it. Select and copy manually.', ok ? 'copied' : 'fail');
});
