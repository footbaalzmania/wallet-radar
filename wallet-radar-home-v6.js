const http = require("http");

/*
  CryptoWalletRadar stable homepage layer v6.
  Buffers HTML responses so the homepage can be rebuilt exactly once even
  when server.js streams the response in multiple write() calls.
  Removes older design-layer artifacts and renders one clean Deal Score card.
*/
const previousWrite = http.ServerResponse.prototype.write;
const previousEnd = http.ServerResponse.prototype.end;

function isHtmlResponse(res, chunk) {
  const type = String(res.getHeader("content-type") || "").toLowerCase();
  return type.includes("text/html") ||
    (typeof chunk === "string" && chunk.includes("<!DOCTYPE html>"));
}

function transformHomepage(html) {
  // Remove artifacts from previous injected design layers so the page cannot stack badges/cards.
  html = html
    .replace(/<style[^>]+id=["'](?:crypto-wallet-radar-v2|cwr-hero-v4|cwr-home-v5)["'][^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]+id=["']cwr-hero-v4-script["'][^>]*>[\s\S]*?<\/script>/gi, "");

  const css = `
<style id="cwr-home-v6">
:root{--cwr-ink:#0b1220;--cwr-muted:#667085;--cwr-line:#e5ebe7;--cwr-green:#16a34a;--cwr-green-2:#22c55e}
body{background:#fff;color:var(--cwr-ink)}
.hero{position:relative;overflow:hidden;isolation:isolate;padding:70px 0 58px!important;background:linear-gradient(135deg,#fff 0%,#fbfdfc 58%,#f1faf4 100%);border-bottom:1px solid #edf2ef}
.hero:before{content:"";position:absolute;inset:0;z-index:-2;background-image:linear-gradient(rgba(15,23,42,.032) 1px,transparent 1px),linear-gradient(90deg,rgba(15,23,42,.032) 1px,transparent 1px);background-size:48px 48px;mask-image:linear-gradient(90deg,transparent,#000 13%,#000 87%,transparent)}
.hero:after{content:"₿  Ξ  ◇  ◎";position:absolute;right:-5px;top:55px;z-index:-1;color:rgba(15,23,42,.04);font-size:52px;font-weight:900;letter-spacing:16px;transform:rotate(-7deg);white-space:nowrap}
.hero-grid{display:grid!important;grid-template-columns:minmax(0,1.03fr) minmax(440px,.97fr)!important;gap:56px!important;align-items:center!important}
.hero-copy{position:relative;z-index:2}
.hero-copy .eyebrow{display:inline-flex!important;align-items:center!important;padding:7px 11px!important;margin:0!important;border:1px solid #cae8d2!important;border-radius:999px!important;background:#effaf2!important;color:#16723a!important;font-size:10px!important;font-weight:900!important;letter-spacing:.12em!important;line-height:1!important}
.hero h1{max-width:790px!important;margin:18px 0 15px!important;font-size:clamp(45px,5.15vw,70px)!important;line-height:.98!important;letter-spacing:-.06em!important}
.hero h1 span{color:var(--cwr-green)!important}
.hero p{max-width:720px!important;margin:0!important;color:var(--cwr-muted)!important;font-size:17px!important;line-height:1.62!important}
.hero-actions{margin-top:27px!important;display:flex!important;gap:10px!important}
.hero-actions a{min-height:49px!important;padding:0 19px!important;border-radius:12px!important;font-weight:850!important}
.hero-actions .btn-primary{background:#0b1220!important;box-shadow:0 12px 28px rgba(15,23,42,.14)!important}
.hero-actions .btn-secondary{background:#fff!important;border:1px solid #dde5e0!important}
.hero-card.cwr-score-card{position:relative!important;min-height:470px!important;padding:0!important;border:1px solid #dce7e0!important;border-radius:28px!important;background:#fff!important;box-shadow:0 28px 80px rgba(15,23,42,.12)!important;overflow:hidden!important;color:var(--cwr-ink)!important}
.cwr-score-bg{position:absolute;inset:0;background:radial-gradient(circle at 84% 14%,rgba(34,197,94,.12),transparent 28%),radial-gradient(circle at 16% 92%,rgba(15,23,42,.045),transparent 25%),linear-gradient(145deg,#fff 0%,#f7fbf8 100%)}
.cwr-score-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(15,23,42,.026) 1px,transparent 1px),linear-gradient(90deg,rgba(15,23,42,.026) 1px,transparent 1px);background-size:31px 31px;mask-image:linear-gradient(#000,transparent 86%)}
.cwr-score-content{position:relative;z-index:2;padding:25px}
.cwr-score-top{display:flex;align-items:center;justify-content:space-between;gap:14px}
.cwr-score-kicker{font-size:10px;font-weight:900;letter-spacing:.14em;color:#667085}
.cwr-live{display:inline-flex;align-items:center;gap:7px;padding:6px 9px;border:1px solid #d6efdd;border-radius:999px;background:#effbf2;color:#15803d;font-size:9px;font-weight:900;letter-spacing:.05em}
.cwr-live i{display:block;width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.12)}
.cwr-score-title{margin-top:13px;font-size:31px;font-weight:950;letter-spacing:-.045em}
.cwr-score-sub{margin-top:3px;color:#748092;font-size:12px}
.cwr-score-main{display:grid;grid-template-columns:190px minmax(0,1fr);gap:24px;align-items:center;margin-top:19px}
.cwr-ring{position:relative;width:184px;height:184px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--cwr-green) 0deg 295deg,#e7ede9 295deg 360deg);box-shadow:0 17px 38px rgba(22,163,74,.13)}
.cwr-ring:before{content:"";position:absolute;inset:13px;border-radius:50%;background:#fff;box-shadow:inset 0 0 0 1px #eef2ef}
.cwr-ring-inner{position:relative;text-align:center}
.cwr-number{font-size:59px;font-weight:950;line-height:.93;letter-spacing:-.065em;color:#11813b}
.cwr-number-label{margin-top:7px;font-size:10px;font-weight:900;letter-spacing:.1em;color:#667085;text-transform:uppercase}
.cwr-verdict{padding:15px 16px;border:1px solid #dce8df;border-radius:16px;background:rgba(255,255,255,.9);box-shadow:0 14px 30px rgba(15,23,42,.05)}
.cwr-verdict-label{font-size:10px;font-weight:900;letter-spacing:.1em;color:#667085;text-transform:uppercase}
.cwr-verdict strong{display:block;margin-top:5px;font-size:22px;letter-spacing:-.035em;color:#15803d}
.cwr-verdict p{margin:7px 0 0;font-size:11px;line-height:1.48;color:#748092}
.cwr-chart{height:108px;margin-top:16px;border:1px solid #e2e9e4;border-radius:14px;background:#fff;overflow:hidden;position:relative}
.cwr-chart-label{position:absolute;left:11px;top:8px;z-index:2;font-size:8px;letter-spacing:.1em;font-weight:900;color:#667085}
.cwr-chart svg{position:absolute;inset:0;width:100%;height:100%}
.cwr-metrics{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.cwr-metric{padding:9px 10px;border:1px solid #e4eae6;border-radius:11px;background:#fff}
.cwr-metric small{display:block;color:#8893a1;font-size:8px;font-weight:900;letter-spacing:.07em;text-transform:uppercase}
.cwr-metric strong{display:block;margin-top:3px;font-size:11px}
.cwr-metric strong.green{color:#15803d}
.cwr-signal{margin-top:9px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:11px;background:#ecfdf3;color:#166534;font-size:11px;font-weight:900}
.cwr-signal .left{display:flex;align-items:center;gap:7px}
.cwr-check{display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#22c55e;color:#fff;font-size:11px;font-weight:950}
.cwr-signal b{font-size:8px;letter-spacing:.08em}
#wallets.section{padding-top:54px!important}
#wallets .section-header{margin-bottom:20px!important}
#wallets .section-header h2{font-size:36px!important;letter-spacing:-.045em!important}
#wallets .section-header p{max-width:740px!important;color:var(--cwr-muted)!important}
.cwr-brand-note{display:inline-flex;align-items:center;margin-top:10px;padding:6px 9px;border-radius:999px;background:#f1f5f9;color:#64748b;font-size:10px;font-weight:850}
.wallet-card{border:1px solid var(--cwr-line)!important;border-radius:19px!important;box-shadow:0 7px 25px rgba(15,23,42,.045)!important}
.deal-radar-panel{border-radius:16px!important}
.deal-radar-score{font-size:23px!important;font-weight:950!important}
@media(max-width:960px){.hero-grid{grid-template-columns:1fr!important}.hero-card.cwr-score-card{max-width:660px}.hero{padding-top:52px!important}}
@media(max-width:620px){.hero{padding:38px 0 34px!important}.hero h1{font-size:43px!important}.hero-actions{flex-direction:column}.hero-actions a{width:100%}.cwr-score-main{grid-template-columns:1fr;justify-items:center}.cwr-verdict{width:100%;box-sizing:border-box}.cwr-score-card{min-height:unset!important}.cwr-score-content{padding:20px}}
</style>`;

  const heroMarkup = `
<section class="hero">
  <div class="container hero-grid">
    <div class="hero-copy">
      <div class="eyebrow">CRYPTO HARDWARE WALLET RADAR</div>
      <h1>Find the best deals on <span>crypto</span> hardware wallets.</h1>
      <p>We track official prices, compare market offers and turn price history into simple buying signals — so you know when a hardware wallet is actually worth buying.</p>
      <div class="hero-actions">
        <a href="#wallets" class="btn btn-primary">Explore the best deals →</a>
        <a href="/compare" class="btn btn-secondary">Compare wallets</a>
      </div>
    </div>
    <div class="hero-card cwr-score-card">
      <div class="cwr-score-bg"></div>
      <div class="cwr-score-grid"></div>
      <div class="cwr-score-content">
        <div class="cwr-score-top">
          <div class="cwr-score-kicker">DEAL RADAR · PRICE INTELLIGENCE</div>
          <div class="cwr-live"><i></i> LIVE TRACKING</div>
        </div>
        <div class="cwr-score-title">Deal Score</div>
        <div class="cwr-score-sub">One clear signal from current offers and price history.</div>
        <div class="cwr-score-main">
          <div class="cwr-ring">
            <div class="cwr-ring-inner"><div class="cwr-number">82</div><div class="cwr-number-label">Deal Score</div></div>
          </div>
          <div class="cwr-verdict">
            <div class="cwr-verdict-label">Current buying signal</div>
            <strong>Excellent deal</strong>
            <p>The current price sits in a strong historical buying zone.</p>
          </div>
        </div>
        <div class="cwr-chart">
          <div class="cwr-chart-label">PRICE HISTORY</div>
          <svg viewBox="0 0 620 108" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="cwrAreaV6" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22c55e" stop-opacity=".23"/><stop offset="1" stop-color="#22c55e" stop-opacity="0"/></linearGradient></defs>
            <g stroke="#e8eeea" stroke-width="1"><line x1="0" y1="28" x2="620" y2="28"/><line x1="0" y1="54" x2="620" y2="54"/><line x1="0" y1="80" x2="620" y2="80"/></g>
            <path d="M0 84 L45 79 L90 86 L135 70 L180 75 L225 58 L270 63 L315 47 L360 53 L405 38 L450 45 L495 30 L540 36 L583 18 L620 23 L620 108 L0 108Z" fill="url(#cwrAreaV6)"/>
            <path d="M0 84 L45 79 L90 86 L135 70 L180 75 L225 58 L270 63 L315 47 L360 53 L405 38 L450 45 L495 30 L540 36 L583 18 L620 23" fill="none" stroke="#16a34a" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="583" cy="18" r="5" fill="#fff" stroke="#16a34a" stroke-width="3"/>
          </svg>
        </div>
        <div class="cwr-metrics">
          <div class="cwr-metric"><small>Official vs market</small><strong class="green">Below typical offer</strong></div>
          <div class="cwr-metric"><small>Historical position</small><strong>Better than 82%</strong></div>
        </div>
        <div class="cwr-signal"><span class="left"><span class="cwr-check">✓</span> Worth considering now</span><b>DATA-DRIVEN</b></div>
      </div>
    </div>
  </div>
</section>`;

  html = html.replace(/<section class="hero">[\s\S]*?<\/section>/, heroMarkup);
  html = html.replace(/<h2>Trezor hardware wallets<\/h2>/, "<h2>Hardware wallets</h2>");
  html = html.replace(
    /<div class="section-header">[\s\S]*?<\/div>\s*<\/div>\s*<div class="wallet-grid">/,
    '<div class="section-header"><div><h2>Hardware wallets</h2><p>Compare official prices, market offers and price history to find out when a wallet is actually worth buying.</p><span class="cwr-brand-note">Trezor · More brands coming</span></div></div><div class="wallet-grid">'
  );
  html = html.replace("</head>", css + "</head>");
  return html;
}

http.ServerResponse.prototype.write = function (chunk, encoding, callback) {
  if (chunk && isHtmlResponse(this, chunk)) {
    this.__cwrHtml = true;
    this.__cwrChunks = this.__cwrChunks || [];
    this.__cwrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding || "utf8"));
    if (typeof encoding === "function") callback = encoding;
    if (callback) process.nextTick(callback);
    return true;
  }
  if (this.__cwrHtml) {
    this.__cwrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding || "utf8"));
    if (typeof encoding === "function") callback = encoding;
    if (callback) process.nextTick(callback);
    return true;
  }
  return previousWrite.call(this, chunk, encoding, callback);
};

http.ServerResponse.prototype.end = function (chunk, encoding, callback) {
  const buffered = this.__cwrHtml || (chunk && isHtmlResponse(this, chunk));
  if (buffered) {
    this.__cwrHtml = true;
    this.__cwrChunks = this.__cwrChunks || [];
    if (typeof chunk === "function") {
      callback = chunk;
      chunk = null;
      encoding = null;
    } else if (chunk) {
      this.__cwrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding || "utf8"));
    }
    const source = Buffer.concat(this.__cwrChunks).toString("utf8");
    const transformed = transformHomepage(source);
    return previousEnd.call(this, transformed, "utf8", callback);
  }
  return previousEnd.call(this, chunk, encoding, callback);
};
