const http = require("http");

/*
  CryptoWalletRadar homepage v7.
  Design-only renderer: keeps server pricing/affiliate/product logic intact,
  but gives the homepage the restrained, compact visual direction of the
  original CryptoWalletRadar concept.
*/
const previousWrite = http.ServerResponse.prototype.write;
const previousEnd = http.ServerResponse.prototype.end;

function looksLikeHtml(res, chunk) {
  const type = String(res.getHeader("content-type") || "").toLowerCase();
  return type.includes("text/html") ||
    (typeof chunk === "string" && chunk.includes("<!DOCTYPE html>"));
}

function transformHomepage(html) {
  if (!html.includes('<section class="hero">')) return html;

  const css = `
<style id="cwr-home-v7">
:root{
  --cwr-ink:#0b1220;
  --cwr-muted:#667085;
  --cwr-line:#e5e9ee;
  --cwr-green:#16a34a;
  --cwr-green-dark:#15803d;
  --cwr-green-soft:#ecfdf3;
  --cwr-amber:#d97706;
  --cwr-red:#dc2626;
}
body{
  color:var(--cwr-ink);
  background:#fff;
}
.hero{
  position:relative;
  overflow:hidden;
  isolation:isolate;
  padding:54px 0 42px!important;
  background:linear-gradient(135deg,#fff 0%,#fff 58%,#f5fbf7 100%);
  border-bottom:1px solid #edf0f2;
}
.hero:before{
  content:"";
  position:absolute;
  inset:0;
  z-index:-2;
  background-image:
    linear-gradient(rgba(15,23,42,.028) 1px,transparent 1px),
    linear-gradient(90deg,rgba(15,23,42,.028) 1px,transparent 1px);
  background-size:48px 48px;
  mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);
}
.hero:after{
  content:"";
  position:absolute;
  width:360px;
  height:360px;
  right:-170px;
  top:-190px;
  z-index:-1;
  border:1px solid rgba(22,163,74,.09);
  border-radius:50%;
  box-shadow:0 0 0 55px rgba(22,163,74,.025),0 0 0 110px rgba(22,163,74,.018);
}
.hero-grid{
  grid-template-columns:minmax(0,1.14fr) minmax(350px,.86fr)!important;
  gap:44px!important;
  align-items:center!important;
}
.hero-copy{position:relative;z-index:2}
.hero-copy .eyebrow{
  display:inline-flex!important;
  align-items:center!important;
  padding:6px 10px!important;
  margin:0!important;
  border:1px solid #d4ead9!important;
  border-radius:999px!important;
  background:#f1fbf4!important;
  color:#18733c!important;
  font-size:10px!important;
  font-weight:900!important;
  letter-spacing:.12em!important;
  line-height:1!important;
}
.hero h1{
  max-width:720px!important;
  margin:15px 0 14px!important;
  font-size:clamp(42px,4.9vw,64px)!important;
  line-height:1.01!important;
  letter-spacing:-.055em!important;
}
.hero h1 span{color:var(--cwr-green)!important}
.hero p{
  max-width:650px!important;
  margin:0!important;
  color:var(--cwr-muted)!important;
  font-size:16px!important;
  line-height:1.62!important;
}
.hero-actions{
  margin-top:23px!important;
  display:flex!important;
  gap:9px!important;
}
.hero-actions a{
  min-height:44px!important;
  padding:0 16px!important;
  border-radius:10px!important;
  font-size:13px!important;
  font-weight:850!important;
}
.hero-actions .btn-primary{
  background:var(--cwr-green)!important;
  color:#fff!important;
  box-shadow:0 8px 20px rgba(22,163,74,.16)!important;
}
.hero-actions .btn-primary:hover{background:var(--cwr-green-dark)!important}
.hero-actions .btn-secondary{
  background:#fff!important;
  color:var(--cwr-ink)!important;
  border:1px solid var(--cwr-line)!important;
}

/* Compact Deal Radar visual — deliberately closer to the first concept. */
.hero-card.cwr-radar-card{
  position:relative!important;
  min-height:355px!important;
  padding:0!important;
  overflow:hidden!important;
  border:1px solid #dfe7e2!important;
  border-radius:22px!important;
  background:rgba(255,255,255,.92)!important;
  box-shadow:0 20px 48px rgba(15,23,42,.085)!important;
  color:var(--cwr-ink)!important;
}
.cwr-radar-bg{
  position:absolute;inset:0;
  background:
    radial-gradient(circle at 88% 8%,rgba(34,197,94,.12),transparent 27%),
    linear-gradient(145deg,#fff 0%,#f8fbf9 100%);
}
.cwr-radar-grid{
  position:absolute;inset:0;
  background-image:linear-gradient(rgba(15,23,42,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(15,23,42,.025) 1px,transparent 1px);
  background-size:27px 27px;
  mask-image:linear-gradient(#000,transparent 90%);
}
.cwr-radar-content{position:relative;z-index:2;padding:20px}
.cwr-radar-top{display:flex;justify-content:space-between;align-items:center;gap:10px}
.cwr-radar-kicker{font-size:9px;font-weight:900;letter-spacing:.13em;color:#667085}
.cwr-radar-live{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid #dcefe1;border-radius:999px;background:#f2fbf4;color:#18733c;font-size:8px;font-weight:900;letter-spacing:.06em}
.cwr-radar-live i{width:6px;height:6px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.12)}
.cwr-radar-title{margin-top:12px;font-size:23px;font-weight:900;letter-spacing:-.04em}
.cwr-radar-sub{margin-top:3px;color:#7a8492;font-size:11px}
.cwr-radar-main{display:grid;grid-template-columns:142px 1fr;gap:18px;align-items:center;margin-top:17px}
.cwr-radar-ring{
  position:relative;width:140px;height:140px;border-radius:50%;display:grid;place-items:center;
  background:conic-gradient(#16a34a 0deg 295deg,#e7eee9 295deg 360deg);
  box-shadow:0 13px 30px rgba(22,163,74,.12);
}
.cwr-radar-ring:before{content:"";position:absolute;inset:11px;border-radius:50%;background:#fff;box-shadow:inset 0 0 0 1px #edf1ee}
.cwr-radar-ring-inner{position:relative;text-align:center}
.cwr-radar-number{font-size:45px;font-weight:950;line-height:.9;letter-spacing:-.06em;color:#13813b}
.cwr-radar-label{margin-top:6px;font-size:8px;font-weight:900;letter-spacing:.1em;color:#7b8490;text-transform:uppercase}
.cwr-radar-verdict{padding:13px 14px;border:1px solid #e0e9e2;border-radius:13px;background:#fff;box-shadow:0 8px 20px rgba(15,23,42,.045)}
.cwr-radar-verdict small{display:block;color:#7b8490;font-size:8px;font-weight:900;letter-spacing:.09em;text-transform:uppercase}
.cwr-radar-verdict strong{display:block;margin-top:4px;color:#15803d;font-size:18px;letter-spacing:-.03em}
.cwr-radar-verdict p{margin:5px 0 0;color:#788392;font-size:10px;line-height:1.45}
.cwr-radar-chart{position:relative;height:78px;margin-top:13px;border:1px solid #e4ebe6;border-radius:11px;background:#fff;overflow:hidden}
.cwr-radar-chart-label{position:absolute;z-index:2;left:9px;top:7px;color:#7b8490;font-size:7px;font-weight:900;letter-spacing:.09em}
.cwr-radar-chart svg{position:absolute;inset:0;width:100%;height:100%}
.cwr-radar-bottom{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}
.cwr-radar-metric{padding:7px 9px;border:1px solid #e7ece9;border-radius:9px;background:#fff}
.cwr-radar-metric small{display:block;color:#89929e;font-size:7px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
.cwr-radar-metric strong{display:block;margin-top:2px;font-size:10px}
.cwr-radar-signal{margin-top:8px;display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:9px;background:#ecfdf3;color:#166534;font-size:9px;font-weight:900}
.cwr-radar-signal span{display:flex;align-items:center;gap:6px}
.cwr-radar-check{display:grid;place-items:center;width:15px;height:15px;border-radius:50%;background:#22c55e;color:#fff;font-size:9px}

#wallets.section{padding-top:42px!important;padding-bottom:34px!important}
#wallets .section-header{margin-bottom:18px!important}
#wallets .section-header h2{font-size:32px!important;letter-spacing:-.04em!important}
#wallets .section-header p{max-width:680px!important;color:var(--cwr-muted)!important}
.cwr-brand-note{display:inline-flex;align-items:center;margin-top:8px;padding:5px 8px;border-radius:999px;background:#f1f5f9;color:#64748b;font-size:9px;font-weight:850}
.wallet-grid{gap:16px!important}
.wallet-card{
  border:1px solid var(--cwr-line)!important;
  border-radius:17px!important;
  box-shadow:0 5px 20px rgba(15,23,42,.035)!important;
  transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease!important;
}
.wallet-card:hover{transform:translateY(-3px);border-color:#d6dee5!important;box-shadow:0 15px 32px rgba(15,23,42,.075)!important}
.wallet-card .wallet-image{height:220px!important;background:#fafbfc!important}
.wallet-card .wallet-content{padding:19px!important}
.wallet-name{font-size:22px!important}
.official-price{font-size:24px!important}
.deal-radar-panel{border-radius:14px!important;padding:14px!important}
.deal-radar-score{min-width:66px!important;font-size:21px!important}
.cwr-score-legend{margin-top:12px!important}

@media(max-width:900px){
  .hero-grid{grid-template-columns:1fr!important;gap:28px!important}
  .hero-card.cwr-radar-card{max-width:560px}
}
@media(max-width:620px){
  .hero{padding:36px 0 30px!important}
  .hero h1{font-size:41px!important}
  .hero-actions{flex-direction:column}
  .hero-actions a{width:100%;box-sizing:border-box}
  .cwr-radar-main{grid-template-columns:1fr;justify-items:center}
  .cwr-radar-verdict{width:100%;box-sizing:border-box}
}
</style>`;

  const hero = `
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
    <div class="hero-card cwr-radar-card">
      <div class="cwr-radar-bg"></div>
      <div class="cwr-radar-grid"></div>
      <div class="cwr-radar-content">
        <div class="cwr-radar-top">
          <div class="cwr-radar-kicker">DEAL RADAR · PRICE INTELLIGENCE</div>
          <div class="cwr-radar-live"><i></i> LIVE</div>
        </div>
        <div class="cwr-radar-title">Deal Score</div>
        <div class="cwr-radar-sub">A simple signal from today's price and history.</div>
        <div class="cwr-radar-main">
          <div class="cwr-radar-ring"><div class="cwr-radar-ring-inner"><div class="cwr-radar-number">82</div><div class="cwr-radar-label">Excellent deal</div></div></div>
          <div class="cwr-radar-verdict"><small>Current buying signal</small><strong>Worth considering now</strong><p>Today's price sits in a strong historical buying zone.</p></div>
        </div>
        <div class="cwr-radar-chart">
          <div class="cwr-radar-chart-label">PRICE HISTORY</div>
          <svg viewBox="0 0 520 78" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="cwrAreaV7" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22c55e" stop-opacity=".20"/><stop offset="1" stop-color="#22c55e" stop-opacity="0"/></linearGradient></defs>
            <g stroke="#e9efeb" stroke-width="1"><line x1="0" y1="22" x2="520" y2="22"/><line x1="0" y1="42" x2="520" y2="42"/><line x1="0" y1="62" x2="520" y2="62"/></g>
            <path d="M0 60 L42 55 L84 62 L126 47 L168 52 L210 39 L252 45 L294 31 L336 37 L378 27 L420 33 L462 18 L492 23 L520 15 L520 78 L0 78Z" fill="url(#cwrAreaV7)"/>
            <path d="M0 60 L42 55 L84 62 L126 47 L168 52 L210 39 L252 45 L294 31 L336 37 L378 27 L420 33 L462 18 L492 23 L520 15" fill="none" stroke="#16a34a" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="520" cy="15" r="4" fill="#fff" stroke="#16a34a" stroke-width="2.5"/>
          </svg>
        </div>
        <div class="cwr-radar-bottom">
          <div class="cwr-radar-metric"><small>Official vs market</small><strong>Below typical offer</strong></div>
          <div class="cwr-radar-metric"><small>Historical position</small><strong>Better than 82%</strong></div>
        </div>
        <div class="cwr-radar-signal"><span><b class="cwr-radar-check">✓</b> Data-driven buying signal</span><em>NOW</em></div>
      </div>
    </div>
  </div>
</section>`;

  html = html.replace(/<section class="hero">[\s\S]*?<\/section>/, hero);

  html = html.replace(
    /<div class="section-header">[\s\S]*?<div class="wallet-grid">/,
    '<div class="section-header"><div><h2>Hardware wallets</h2><p>Compare official prices, market offers and price history to find out when a wallet is actually worth buying.</p><span class="cwr-brand-note">Trezor · More brands coming</span></div></div><div class="wallet-grid">'
  );

  if (html.includes("</head>")) html = html.replace("</head>", css + "</head>");
  return html;
}

http.ServerResponse.prototype.write = function (chunk, encoding, callback) {
  if (chunk && looksLikeHtml(this, chunk)) {
    this.__cwrBuffering = true;
    this.__cwrChunks = this.__cwrChunks || [];
    this.__cwrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding || "utf8"));
    if (typeof encoding === "function") callback = encoding;
    if (callback) process.nextTick(callback);
    return true;
  }
  if (this.__cwrBuffering) {
    this.__cwrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding || "utf8"));
    if (typeof encoding === "function") callback = encoding;
    if (callback) process.nextTick(callback);
    return true;
  }
  return previousWrite.call(this, chunk, encoding, callback);
};

http.ServerResponse.prototype.end = function (chunk, encoding, callback) {
  if (this.__cwrBuffering) {
    if (typeof encoding === "function") { callback = encoding; encoding = undefined; }
    if (chunk) this.__cwrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding || "utf8"));
    const source = Buffer.concat(this.__cwrChunks || []).toString("utf8");
    const transformed = transformHomepage(source);
    this.__cwrBuffering = false;
    this.__cwrChunks = null;
    this.__cwrDone = true;
    return previousEnd.call(this, transformed, "utf8", callback);
  }
  return previousEnd.call(this, chunk, encoding, callback);
};
