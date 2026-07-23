/**
 * Shared Bygate-branded secure browser UI (PIN, auth, success states).
 * Matches payment success page look: dark glass, violet accents, Plus Jakarta.
 */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SHARED_CSS = `
:root{
  --bg0:#07101f;--bg1:#0f1b33;--ink:#f4f7fb;--muted:rgba(244,247,251,.72);
  --soft:rgba(244,247,251,.45);--line:rgba(255,255,255,.12);
  --violet:#7c3aed;--violet2:#6d28d9;--success:#22c55e;--wa:#25d366;--danger:#f87171;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{min-height:100%}
body{
  font-family:"Plus Jakarta Sans",ui-sans-serif,system-ui,sans-serif;
  color:var(--ink);
  background:
    radial-gradient(900px 500px at 50% -10%, rgba(109,40,217,.28), transparent 55%),
    radial-gradient(700px 420px at 90% 90%, rgba(56,189,248,.12), transparent 50%),
    linear-gradient(165deg, var(--bg0), var(--bg1) 55%, #0a1428);
  display:grid;place-items:center;
  padding:max(24px,env(safe-area-inset-top)) 20px max(28px,env(safe-area-inset-bottom));
  -webkit-font-smoothing:antialiased;
}
.shell{width:min(440px,100%);position:relative;animation:rise .65s cubic-bezier(.22,1,.36,1) both}
.glow{position:absolute;inset:-18% -8% auto;height:200px;background:radial-gradient(circle,rgba(124,58,237,.35),transparent 70%);filter:blur(16px);pointer-events:none}
.card{
  position:relative;padding:36px 28px 30px;border-radius:28px;
  background:linear-gradient(180deg,rgba(255,255,255,.1),rgba(255,255,255,.04));
  border:1px solid var(--line);
  box-shadow:0 30px 80px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.12);
  backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);overflow:hidden;
}
.brand{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--soft);margin-bottom:22px}
.brand-dot{width:8px;height:8px;border-radius:50%;background:var(--violet);box-shadow:0 0 0 4px rgba(124,58,237,.22)}
.badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:#c4b5fd;background:rgba(124,58,237,.18);border:1px solid rgba(167,139,250,.25);padding:6px 10px;border-radius:999px;margin-bottom:14px}
h1{font-size:clamp(1.35rem,4vw,1.65rem);font-weight:800;letter-spacing:-.03em;line-height:1.15;margin-bottom:8px}
.lead{color:var(--muted);font-size:.95rem;line-height:1.55;margin-bottom:22px}
label{display:block;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--soft);margin:14px 0 8px}
input,select{
  width:100%;padding:14px 16px;border-radius:14px;border:1px solid var(--line);
  background:rgba(0,0,0,.28);color:var(--ink);font-size:1rem;outline:none;
  transition:border-color .15s,box-shadow .15s;
}
input.pin-input{font-size:1.45rem;letter-spacing:.45em;text-align:center;font-weight:700}
input:focus,select:focus{border-color:rgba(167,139,250,.7);box-shadow:0 0 0 4px rgba(124,58,237,.2)}
.hint{font-size:12px;color:var(--soft);margin-top:6px;line-height:1.4}
.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;
  min-height:52px;margin-top:22px;border:none;border-radius:14px;cursor:pointer;
  font-weight:700;font-size:.98rem;color:#fff;
  background:linear-gradient(180deg,#8b5cf6,#6d28d9);
  box-shadow:0 12px 28px rgba(109,40,217,.35), inset 0 1px 0 rgba(255,255,255,.25);
}
.btn:hover{filter:brightness(1.05)}
.btn-wa{background:linear-gradient(180deg,#3ddc76,#1fbe5a);color:#062814;box-shadow:0 12px 28px rgba(37,211,102,.28);text-decoration:none;margin-top:14px}
.err{background:rgba(127,29,29,.45);border:1px solid rgba(248,113,113,.35);color:#fecaca;padding:12px 14px;border-radius:14px;margin-bottom:14px;font-size:.88rem;line-height:1.4}
.summary{background:rgba(0,0,0,.22);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:8px;font-size:.92rem;color:rgba(244,247,251,.88);line-height:1.45}
.mark-wrap{position:relative;width:104px;height:104px;margin:0 auto 22px}
.pulse{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(34,197,94,.35);opacity:0;transform:scale(.7);animation:pulseRing 1.6s .55s ease-out both}
.pulse:nth-child(2){animation-delay:.85s}
.mark{position:relative;width:104px;height:104px;border-radius:50%;background:rgba(255,255,255,.04);display:grid;place-items:center}
.ring{position:absolute;inset:0;transform:rotate(-90deg)}
.ring circle{fill:none;stroke-width:4;stroke-linecap:round}
.ring .track{stroke:rgba(255,255,255,.12)}
.ring .progress{stroke:var(--success);stroke-dasharray:290;stroke-dashoffset:290;filter:drop-shadow(0 0 8px rgba(34,197,94,.55));animation:drawRing .75s cubic-bezier(.65,0,.35,1) forwards}
.check{width:48px;height:48px;opacity:0;transform:scale(.6);animation:popCheck .45s .55s cubic-bezier(.34,1.56,.64,1) forwards}
.check path{fill:none;stroke:var(--success);stroke-width:5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:60;stroke-dashoffset:60;animation:drawCheck .4s .7s ease forwards}
.center{text-align:center}
.muted{color:var(--muted);font-size:.95rem;line-height:1.55}
.foot{margin-top:18px;font-size:12px;color:var(--soft);text-align:center}
a.inline{color:#c4b5fd}
@keyframes rise{from{opacity:0;transform:translateY(16px) scale(.98)}to{opacity:1;transform:none}}
@keyframes drawRing{to{stroke-dashoffset:0}}
@keyframes drawCheck{to{stroke-dashoffset:0}}
@keyframes popCheck{to{opacity:1;transform:scale(1)}}
@keyframes pulseRing{0%{opacity:.7;transform:scale(.85)}100%{opacity:0;transform:scale(1.45)}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important}}
`;

function shell({ title, bodyHtml, themeColor = '#0B1220' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
  <meta name="theme-color" content="${escapeHtml(themeColor)}"/>
  <meta name="robots" content="noindex,nofollow"/>
  <title>Bygate · ${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet"/>
  <style>${SHARED_CSS}</style>
</head>
<body>
  <div class="shell">
    <div class="glow" aria-hidden="true"></div>
    <main class="card">${bodyHtml}</main>
  </div>
</body>
</html>`;
}

function brandHeader(badge) {
  return `<div class="brand"><span class="brand-dot"></span> Bygate</div>
${badge ? `<div class="badge">${badge}</div>` : ''}`;
}

function successMark() {
  return `<div class="mark-wrap" aria-hidden="true">
  <span class="pulse"></span><span class="pulse"></span>
  <div class="mark">
    <svg class="ring" width="104" height="104" viewBox="0 0 104 104">
      <circle class="track" cx="52" cy="52" r="46"/>
      <circle class="progress" cx="52" cy="52" r="46"/>
    </svg>
    <svg class="check" viewBox="0 0 52 52"><path d="M14 27.5 L22.5 36 L38 16"/></svg>
  </div>
</div>`;
}

function renderFormPage({ title, badge, heading, lead, formHtml, error = '' }) {
  const err = error ? `<div class="err" role="alert">${escapeHtml(error)}</div>` : '';
  return shell({
    title,
    bodyHtml: `${brandHeader(badge)}
      <h1>${escapeHtml(heading)}</h1>
      <p class="lead">${lead}</p>
      ${err}
      ${formHtml}
      <p class="foot">Encrypted · never saved in WhatsApp chat</p>`,
  });
}

function renderSuccessPage({ title, heading, message, waHref = '' }) {
  const wa = waHref
    ? `<a class="btn btn-wa" href="${escapeHtml(waHref)}">Back to WhatsApp</a>`
    : `<p class="muted" style="margin-top:16px">Return to WhatsApp to continue.</p>`;
  return shell({
    title,
    bodyHtml: `<div class="center">
      ${brandHeader('Secure')}
      ${successMark()}
      <h1>${escapeHtml(heading)}</h1>
      <p class="muted" style="margin:10px auto 0;max-width:32ch">${message}</p>
      ${wa}
      <p class="foot">Bygate · Africa's WhatsApp Super App</p>
    </div>`,
  });
}

function renderInvalidPage(message) {
  return shell({
    title: 'Link expired',
    bodyHtml: `${brandHeader('Secure')}
      <h1>Link expired</h1>
      <p class="lead">${escapeHtml(message || 'Return to WhatsApp and request a new secure link.')}</p>
      <p class="foot">Open Wallet or retry your purchase in chat.</p>`,
  });
}

module.exports = {
  escapeHtml,
  shell,
  brandHeader,
  successMark,
  renderFormPage,
  renderSuccessPage,
  renderInvalidPage,
};
