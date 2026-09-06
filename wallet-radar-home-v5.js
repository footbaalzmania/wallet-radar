const http = require("http");
const previousEnd = http.ServerResponse.prototype.end;

/*
  Stable homepage layer.
  One HTML transformation only: no DOM script, no pseudo-element badges,
  no competing design layers. Pricing, affiliate and server logic stay intact.
*/
http.ServerResponse.prototype.end = function (chunk, encoding, callback) {
  if (chunk) {
    const contentType = String(this.getHeader("content-type") || "");
    const isHtml =
      contentType.includes("text/html") ||
      (typeof chunk === "string" && chunk.includes("<!DOCTYPE html>"));

    if (isHtml) {
      let html = Buffer.isBuffer(chunk)
        ? chunk.toString(encoding || "utf8")
        : String(chunk);

      const css = `
<style id="cwr-home-v5">
:root{--cwr-ink:#0b1220;--cwr-muted:#667085;--cwr-line:#e7ece9;--cwr-green:#16a34a;--cwr-green-dark:#15803d}
body{background:#fff;color:var(--cwr-ink)}
.hero{position:relative;overflow:hidden;isolation:isolate;padding:72px 0 58px!important;background:linear-gradient(135deg,#ffffff 0%,#fbfdfb 58%,#f2faf5 100%);border-bottom:1px solid #eef2ef}
.hero:before{content:"";position:absolute;inset:0;z-index:-2;background-image:linear-gradient(rgba(15,23,42,.034) 1px,transparent 1px),linear-gradient(90deg,rgba(15,23,42,.034) 1px,transparent 1px);background-size:48px 48px;mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)}
.hero:after{content:"";position:absolute;right:-160px;top:-180px;width:580px;height:580px;border-radius:50%;background:radial-gradient(circle,rgba(34,197,94,.13),rgba(34,197,94,0) 68%);z-index:-1;pointer-events:none}
.hero-grid{display:grid!important;grid-template-columns:minmax(0,1.02fr) minmax(430px,.98fr)!important;gap:58px!important;align-items:center!important}
.hero-copy{position:relative;z-index:2}
.hero-copy .eyebrow{display:inline-flex!important;align-items:center!important;padding:7px 11px!important;border:1px solid #cfead7!important;border-radius:999px!important;background:#effbf2!important;color:#16723a!important;font-size:10px!important;font-weight:900!important;letter-spacing:.12em!important;line-height:1!important}
.hero h1{max-width:800px!important;margin:18px 0 16px!important;font-size:clamp(46px,5.1vw,72px)!important;line-height:.98!important;letter-spacing:-.06em!important}
.hero h1 span{color:var(--cwr-green)!important}
.hero p{max-width:720px!important;margin:0!important;color:var(--cwr-muted)!important;font-size:17px!important;line-height:1.65!important}
.hero-actions{margin-top:27px!important;display:flex!important;gap:10px!important}
.hero-actions a{min-height:49px!important;padding:0 18px!important;border-radius:12px!important;font-weight:850!important}
.hero-actions .btn-primary{background:#0b1220!important;box-shadow:0 12px 28px rgba(15,23,42,.14)!important}
.hero-actions .btn-secondary{background:#fff!important;border:1px solid #dde4df!important}
.hero-card.cwr-score-card{position:relative!important;min-height:455px!important;padding:0!important;border:1px solid #dfe8e2!important;border-radius:28px!important;background:#fff!important;box-shadow:0 28px 80px rgba(15,23,42,.12)!important;overflow:hidden!important;color:var(--cwr-ink)!important}
.cwr-score-bg{position:absolute;inset:0;background:radial-gradient(circle at 82% 16%,rgba(34,197,94,.12),transparent 28%),radial-gradient(circle at 18% 86%,rgba(15,23,42,.045),transparent 25%),linear-gradient(145deg,#fff 0%,#f8fbf9 100%)}
.cwr-score-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(15,23,42,.027) 1px,transparent 1px),linear-gradient(90deg,rgba(15,23,42,.027) 1px,transparent 1px);background-size:31px 31px;mask-image:linear-gradient(#000,transparent 84%)}
.cwr-score-content{position:relative;z-index:2;padding:25px}
.cwr-score-top{display:flex;align-items:center;justify-content:space-between;gap:14px}
.cwr-score-kicker{font-size:10px;font-weight:900;letter-spacing:.14em;color:#667085}
.cwr-live{display:inline-flex;align-items:center;gap:7px;padding:6px 9px;border:1px solid #d9f0df;border-radius:999px;background:#effbf2;color:#15803d;font-size:9px;font-weight:900;letter-spacing:.05em}
.cwr-live i{display:block;width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.12)}
.cwr-score-title{margin-top:14px;font-size:30px;font-weight:950;letter-spacing:-.045em}
.cwr-score-sub{margin-top:3px;color:#748092;font-size:12px}
.cwr-score-main{display:grid;grid-template-columns:200px minmax(0,1fr);gap:25px;align-items:center;margin-top:20px}
.cwr-ring{position:relative;width:190px;height:190px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--cwr-green) 0deg 295deg,#e8eee9 295deg 360deg);box-shadow:0 18px 40px rgba(22,163,74,.12)}
.cwr-ring:before{content:"";position:absolute;inset:14px;border-radius:50%;background:#fff;box-shadow:inset 0 0 0 1px #eef2ef}
.cwr-ring-inner{position:relative;text-align:center}
.cwr-number{font-size:58px;font-weight:950;line-height:.95;letter-spacing:-.065em;color:#12843d}
.cwr-number-label{margin-top:7px;font-size:10px;font-weight:900;letter-spacing:.1em;color:#667085;text-transform:uppercase}
.cwr-verdict{padding:15px 16px;border:1px solid #dce9df;border-radius:16px;background:rgba(255,255,255,.88);box-shadow:0 14px 30px rgba(15,23,42,.05)}
.cwr-verdict-label{font-size:10px;font-weight:900;letter-spacing:.1em;color:#667085;text-transform:uppercase}
.cwr-verdict strong{display:block;margin-top:5px;font-size:22px;letter-spacing:-.035em;color:#15803d}
.cwr-verdict p{margin:7px 0 0;font-size:11px;line-height:1.5;color:#748092}
.cwr-chart{height:112px;margin-top:17px;border:1px solid #e4eae6;border-radius:14px;background:rgba(255,255,255,.86);overflow:hidden;position:relative}
.cwr-chart-label{position:absolute;left:12px;top:9px;z-index:2;font-size:8px;letter-spacing:.1em;font-weight:900;color:#667085}
.cwr-chart svg{position:absolute;inset:0;width:100%;height:100%}
.cwr-metrics{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:11px}
.cwr-metric{padding:10px 11px;border:1px solid #e5ebe7;border-radius:12px;background:#fff}
.cwr-metric small{display:block;color:#8893a1;font-size:8px;font-weight:900;letter-spacing:.07em;text-transform:uppercase}
.cwr-metric strong{display:block;margin-top:3px;font-size:12px}
.cwr-metric strong.green{color:#15803d}
.cwr-signal{margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:12px;background:#ecfdf3;color:#166534;font-size:11px;font-weight:900}
.cwr-signal span{display:flex;align-items:center;gap:7px}.cwr-check{display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#22c55e;color:#fff;font-size:11px;font-weight:950}
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
@media(max-width:620px){.hero{padding:38px 0 35px!important}.hero h1{font-size:43px!important}.hero-actions{flex-direction:column}.hero-actions a{width:100%}.cwr-score-main{grid-template-columns:1fr;justify-items:center}.cwr-verdict{width:100%;box-sizing:border-box}.cwr-score-card{min-height:unset!important}.cwr-score-content{padding:20px}}
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
        <div class="cwr-score-sub">One simple signal from price history and current offers.</div>
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
          <svg viewBox="0 0 620 112" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="cwrAreaV5" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22c55e" stop-opacity=".23"/><stop offset="1" stop-color="#22c55e" stop-opacity="0"/></linearGradient></defs>
            <g stroke="#e8eeea" stroke-width="1"><line x1="0" y1="30" x2="620" y2="30"/><line x1="0" y1="56" x2="620" y2="56"/><line x1="0" y1="82" x2="620" y2="82"/></g>
            <path d="M0 87 L45 82 L90 88 L135 71 L180 76 L225 58 L270 64 L315 47 L360 54 L405 38 L450 46 L495 30 L540 37 L583 18 L620 23 L620 112 L0 112Z" fill="url(#cwrAreaV5)"/>
            <path d="M0 87 L45 82 L90 88 L135 71 L180 76 L225 58 L270 64 L315 47 L360 54 L405 38 L450 46 L495 30 L540 37 L583 18 L620 23" fill="none" stroke="#16a34a" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="583" cy="18" r="5" fill="#fff" stroke="#16a34a" stroke-width="3"/>
          </svg>
        </div>
        <div class="cwr-metrics">
          <div class="cwr-metric"><small>Official vs market</small><strong class="green">Below typical offer</strong></div>
          <div class="cwr-metric"><small>Historical position</small><strong>Better than 82%</strong></div>
        </div>
        <div class="cwr-signal"><span><span class="cwr-check">✓</span> Worth considering now</span><b>DATA-DRIVEN</b></div>
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
      chunk = Buffer.isBuffer(chunk) ? Buffer.from(html) : html;
    }
  }

  return previousEnd.call(this, chunk, encoding, callback);
};
