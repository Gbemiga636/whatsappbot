/**
 * Shared browser page after Paystack / OPay checkout.
 * Animated success ring + checkmark; processing state when not yet confirmed.
 */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {{ ok: boolean, statusLine: string, reference?: string, waHref?: string, provider?: string }} opts
 */
function renderPaymentResultPage({
  ok,
  statusLine,
  reference = '',
  waHref = '',
  provider = 'Paystack',
}) {
  const title = ok ? 'Payment confirmed' : 'Payment received';
  const subtitle = escapeHtml(statusLine);
  const ref = escapeHtml(reference || '—');
  const providerLabel = escapeHtml(provider);
  const stateClass = ok ? 'is-success' : 'is-pending';
  const hasWa = Boolean(waHref && waHref !== '#');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0B1220" />
  <title>Bygate · ${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg0: #07101f;
      --bg1: #0f1b33;
      --ink: #f4f7fb;
      --muted: rgba(244,247,251,.72);
      --soft: rgba(244,247,251,.45);
      --line: rgba(255,255,255,.12);
      --success: #22c55e;
      --success-deep: #16a34a;
      --pending: #38bdf8;
      --wa: #25d366;
      --card: rgba(255,255,255,.06);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { min-height: 100%; }
    body {
      font-family: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(900px 500px at 50% -10%, rgba(34,197,94,.22), transparent 55%),
        radial-gradient(700px 420px at 85% 90%, rgba(56,189,248,.14), transparent 50%),
        radial-gradient(600px 380px at 10% 80%, rgba(109,40,217,.16), transparent 45%),
        linear-gradient(165deg, var(--bg0), var(--bg1) 55%, #0a1428);
      display: grid;
      place-items: center;
      padding: max(24px, env(safe-area-inset-top)) 20px max(28px, env(safe-area-inset-bottom));
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }
    .shell {
      width: min(420px, 100%);
      position: relative;
      animation: rise .7s cubic-bezier(.22,1,.36,1) both;
    }
    .glow {
      position: absolute;
      inset: -20% -10% auto;
      height: 220px;
      background: radial-gradient(circle, rgba(34,197,94,.28), transparent 70%);
      filter: blur(18px);
      pointer-events: none;
      opacity: 0;
      animation: glowIn .8s .15s ease both;
    }
    .is-pending .glow {
      background: radial-gradient(circle, rgba(56,189,248,.28), transparent 70%);
    }
    .card {
      position: relative;
      text-align: center;
      padding: 40px 28px 32px;
      border-radius: 28px;
      background: linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.04));
      border: 1px solid var(--line);
      box-shadow:
        0 30px 80px rgba(0,0,0,.35),
        inset 0 1px 0 rgba(255,255,255,.12);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      overflow: hidden;
    }
    .card::before {
      content: "";
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 20% 0%, rgba(255,255,255,.08), transparent 40%),
        radial-gradient(circle at 80% 100%, rgba(255,255,255,.04), transparent 35%);
      pointer-events: none;
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
      color: var(--soft);
      margin-bottom: 28px;
      opacity: 0;
      animation: fadeUp .5s .2s ease both;
    }
    .brand-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 0 4px rgba(34,197,94,.2);
    }
    .is-pending .brand-dot {
      background: var(--pending);
      box-shadow: 0 0 0 4px rgba(56,189,248,.2);
    }

    /* —— Success / pending mark —— */
    .mark-wrap {
      position: relative;
      width: 112px;
      height: 112px;
      margin: 0 auto 26px;
    }
    .pulse {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      border: 2px solid rgba(34,197,94,.35);
      opacity: 0;
      transform: scale(.7);
      animation: pulseRing 1.6s .55s ease-out both;
    }
    .pulse:nth-child(2) { animation-delay: .85s; }
    .is-pending .pulse { border-color: rgba(56,189,248,.35); }

    .mark {
      position: relative;
      width: 112px;
      height: 112px;
      border-radius: 50%;
      background: rgba(255,255,255,.04);
      display: grid;
      place-items: center;
      box-shadow: 0 12px 40px rgba(0,0,0,.25);
    }
    .ring {
      position: absolute;
      inset: 0;
      transform: rotate(-90deg);
    }
    .ring circle {
      fill: none;
      stroke-width: 4;
      stroke-linecap: round;
    }
    .ring .track {
      stroke: rgba(255,255,255,.12);
    }
    .ring .progress {
      stroke: var(--success);
      stroke-dasharray: 314;
      stroke-dashoffset: 314;
      filter: drop-shadow(0 0 8px rgba(34,197,94,.55));
      animation: drawRing .75s cubic-bezier(.65,0,.35,1) forwards;
    }
    .is-pending .ring .progress {
      stroke: var(--pending);
      filter: drop-shadow(0 0 8px rgba(56,189,248,.45));
      animation: drawRing .9s ease forwards, spinPending 1.2s 1s linear infinite;
      transform-origin: 56px 56px;
    }

    .check {
      width: 52px;
      height: 52px;
      opacity: 0;
      transform: scale(.6);
      animation: popCheck .45s .55s cubic-bezier(.34,1.56,.64,1) forwards;
    }
    .check path {
      fill: none;
      stroke: var(--success);
      stroke-width: 5;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-dasharray: 60;
      stroke-dashoffset: 60;
      animation: drawCheck .4s .7s ease forwards;
    }
    .dots {
      display: none;
      gap: 8px;
      align-items: center;
    }
    .is-pending .check { display: none; }
    .is-pending .dots { display: flex; }
    .dots span {
      width: 10px; height: 10px; border-radius: 50%;
      background: var(--pending);
      opacity: .35;
      animation: bounceDot 1s ease-in-out infinite;
    }
    .dots span:nth-child(2) { animation-delay: .15s; }
    .dots span:nth-child(3) { animation-delay: .3s; }

    h1 {
      font-size: clamp(1.45rem, 4vw, 1.75rem);
      font-weight: 800;
      letter-spacing: -.03em;
      line-height: 1.15;
      margin-bottom: 10px;
      opacity: 0;
      animation: fadeUp .55s .45s ease both;
    }
    .lede {
      color: var(--muted);
      font-size: .98rem;
      line-height: 1.55;
      max-width: 32ch;
      margin: 0 auto 22px;
      opacity: 0;
      animation: fadeUp .55s .55s ease both;
    }
    .meta {
      display: inline-flex;
      flex-direction: column;
      gap: 6px;
      padding: 12px 16px;
      border-radius: 14px;
      background: rgba(0,0,0,.22);
      border: 1px solid var(--line);
      margin-bottom: 24px;
      opacity: 0;
      animation: fadeUp .55s .65s ease both;
      max-width: 100%;
    }
    .meta-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--soft);
    }
    .meta-value {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      color: rgba(244,247,251,.88);
      word-break: break-all;
    }
    .actions {
      display: grid;
      gap: 10px;
      opacity: 0;
      animation: fadeUp .55s .75s ease both;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      min-height: 52px;
      padding: 0 20px;
      border-radius: 14px;
      font-weight: 700;
      font-size: .98rem;
      text-decoration: none;
      color: #062814;
      background: linear-gradient(180deg, #3ddc76, #1fbe5a);
      box-shadow:
        0 12px 28px rgba(37,211,102,.28),
        inset 0 1px 0 rgba(255,255,255,.35);
      transition: transform .15s ease, filter .15s ease;
    }
    .btn:hover { transform: translateY(-1px); filter: brightness(1.04); }
    .btn:active { transform: translateY(1px); }
    .btn svg { flex-shrink: 0; }
    .hint {
      font-size: 12.5px;
      color: var(--soft);
      line-height: 1.45;
    }
    .provider {
      margin-top: 22px;
      font-size: 12px;
      color: var(--soft);
      opacity: 0;
      animation: fadeUp .5s .85s ease both;
    }

    @keyframes rise {
      from { opacity: 0; transform: translateY(18px) scale(.98); }
      to { opacity: 1; transform: none; }
    }
    @keyframes glowIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: none; }
    }
    @keyframes drawRing {
      to { stroke-dashoffset: 0; }
    }
    @keyframes drawCheck {
      to { stroke-dashoffset: 0; }
    }
    @keyframes popCheck {
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes pulseRing {
      0% { opacity: .7; transform: scale(.85); }
      100% { opacity: 0; transform: scale(1.45); }
    }
    @keyframes bounceDot {
      0%, 80%, 100% { transform: translateY(0); opacity: .35; }
      40% { transform: translateY(-7px); opacity: 1; }
    }
    @keyframes spinPending {
      to { transform: rotate(360deg); }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: .01ms !important;
        animation-iteration-count: 1 !important;
        transition: none !important;
      }
      .ring .progress { stroke-dashoffset: 0; }
      .check, .check path { opacity: 1; transform: none; stroke-dashoffset: 0; }
    }
  </style>
</head>
<body class="${stateClass}">
  <div class="shell">
    <div class="glow" aria-hidden="true"></div>
    <main class="card" role="status" aria-live="polite">
      <div class="brand"><span class="brand-dot"></span> Bygate</div>

      <div class="mark-wrap" aria-hidden="true">
        <span class="pulse"></span>
        <span class="pulse"></span>
        <div class="mark">
          <svg class="ring" width="112" height="112" viewBox="0 0 112 112">
            <circle class="track" cx="56" cy="56" r="50" />
            <circle class="progress" cx="56" cy="56" r="50" />
          </svg>
          <svg class="check" viewBox="0 0 52 52">
            <path d="M14 27.5 L22.5 36 L38 16" />
          </svg>
          <div class="dots">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>

      <h1>${escapeHtml(title)}</h1>
      <p class="lede">${subtitle}</p>

      <div class="meta">
        <span class="meta-label">Reference</span>
        <span class="meta-value">${ref}</span>
      </div>

      <div class="actions">
        ${
          hasWa
            ? `<a class="btn" href="${escapeHtml(waHref)}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Back to WhatsApp
              </a>
              <p class="hint">You can close this page anytime — we finish your order in the background and message you on WhatsApp.</p>`
            : `<p class="hint">Return to WhatsApp to see your order update. Fulfillment continues even if you leave this page.</p>`
        }
      </div>

      <p class="provider">Secured via ${providerLabel}</p>
    </main>
  </div>
</body>
</html>`;
}

module.exports = { renderPaymentResultPage, escapeHtml };
