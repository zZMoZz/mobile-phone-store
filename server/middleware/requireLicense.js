import { getMachineId } from '../lib/machine.js';
import { validateKey, readStoredKey } from '../lib/license.js';

const SKIP_PREFIXES = ['/api', '/assets', '/uploads'];

export function requireLicense(req, res, next) {
  if (req.method !== 'GET') return next();
  if (SKIP_PREFIXES.some((p) => req.path.startsWith(p))) return next();

  let machineId;
  try {
    machineId = getMachineId();
  } catch {
    return res.send(buildActivationHtml('(unavailable)'));
  }

  if (validateKey(machineId, readStoredKey())) return next();
  res.send(buildActivationHtml(machineId));
}

function buildActivationHtml(machineId) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>هذه النسخة غير مرخصة / Unlicensed</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#1a1a2e;color:#e0e0e0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#16213e;border:1px solid #0f3460;border-radius:12px;padding:2rem;max-width:480px;width:90%}
h1{font-size:1.15rem;margin-bottom:.5rem;color:#e94560;line-height:1.4}
p{font-size:.875rem;color:#aaa;margin-bottom:1.25rem;line-height:1.6}
label{display:block;font-size:.75rem;color:#aaa;margin-bottom:.25rem}
input{width:100%;padding:.5rem .75rem;background:#0f3460;border:1px solid #1a4a8a;border-radius:6px;color:#e0e0e0;font-family:monospace;font-size:.8rem;margin-bottom:1.25rem}
button{width:100%;padding:.65rem;background:#e94560;border:none;border-radius:6px;color:#fff;font-size:.95rem;cursor:pointer}
button:hover{background:#c73652}
.error{color:#e94560;font-size:.8rem;margin-top:.75rem;display:none}
</style>
</head>
<body>
<div class="card">
  <h1>هذه النسخة غير مرخصة / This copy is not licensed</h1>
  <p>أرسل معرّف الجهاز أدناه إلى المطوّر للحصول على مفتاح الترخيص.<br>Send the Machine ID below to your developer to receive a license key.</p>
  <label>معرّف الجهاز / Machine ID</label>
  <input id="mid" value="${machineId}" readonly onclick="this.select()">
  <label>مفتاح الترخيص / License Key</label>
  <input id="key" placeholder="الصق المفتاح هنا / Paste key here" autocomplete="off" spellcheck="false">
  <button onclick="activate()">تفعيل / Activate</button>
  <p class="error" id="err">مفتاح غير صحيح / Invalid license key</p>
</div>
<script>
async function activate() {
  const key = document.getElementById('key').value.trim();
  const err = document.getElementById('err');
  err.style.display = 'none';
  try {
    const r = await fetch('/api/license/activate', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ key })
    });
    const data = await r.json();
    if (data.ok) { window.location.reload(); }
    else { err.style.display = 'block'; }
  } catch { err.style.display = 'block'; }
}
</script>
</body>
</html>`;
}
