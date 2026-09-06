const http = require("http");

/*
  CryptoWalletRadar v2 visual layer.
  Builds the actual hero artwork and generic wallet-radar presentation
  directly into the server-rendered HTML. Pricing, affiliate and data
  logic remain untouched.
*/
const previousEnd = http.ServerResponse.prototype.end;

http.ServerResponse.prototype.end = function (chunk, encoding, callback) {
  if (chunk) {
    const contentType = String(this.getHeader("content-type") || "");
    const looksLikeHtml =
      contentType.includes("text/html") ||
      (typeof chunk === "string" && chunk.includes("<!DOCTYPE html>"));

    if (looksLikeHtml) {
      let html = Buffer.isBuffer(chunk)
        ? chunk.toString(encoding || "utf8")
        : String(chunk);

      const css = `
<style id="crypto-wallet-radar-v2">
:root{--cwr-ink:#0b1220;--cwr-muted:#64748b;--cwr-border:#e5eaf0;--cwr-green:#16a34a;--cwr-green-dark:#15803d}
body{background:#fff;color:var(--cwr-ink)}
.hero{position:relative;overflow:hidden;padding:74px 0 54px!important;background:linear-gradient(180deg,#fbfefc 0%,#fff 82%);border-bottom:1px solid #edf1ee;isolation:isolate}
.hero:before{content:"";position:absolute;inset:0;z-index:-2;background-image:linear-gradient(rgba(15,23,42,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(15,23,42,.035) 1px,transparent 1px);background-size:48px 48px;mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);opacity:.8}
.hero:after{content:"";position:absolute;z-index:-1;width:620px;height:620px;right:-230px;top:-250px;border-radius:50%;background:radial-gradient(circle,rgba(34,197,94,.11),rgba(34,197,94,0) 68%);pointer-events:none}
.hero-grid{grid-template-columns:minmax(0,1.12fr) minmax(420px,.88fr)!important;gap:58px!important;align-items:center!important}
.hero-copy{position:relative;z-index:2}
.hero-copy .eyebrow{display:inline-flex!important;padding:7px 11px!important;border:1px solid #d7efdd!important;border-radius:999px!important;background:#effbf2!important;color:#15803d!important;font-size:10px!important;font-weight:900!important;letter-spacing:.13em!important}
.hero h1{max-width:800px!important;margin:17px 0 16px!important;font-size:clamp(45px,5.4vw,70px)!important;line-height:.98!important;letter-spacing:-.058em!important}
.hero h1 span{color:var(--cwr-green)!important}
.hero p{max-width:700px!important;color:var(--cwr-muted)!important;font-size:17px!important;line-height:1.65!important}
.hero-actions{margin-top:26px!important;gap:10px!important}
.hero-actions a{min-height:48px!important;border-radius:12px!important;font-weight:850!important;padding:0 19px!important}
.hero-actions .btn-primary{background:var(--cwr-green)!important;box-shadow:0 10px 25px rgba(22,163,74,.18)!important}
.hero-actions .btn-secondary{background:#fff!important;border:1px solid var(--cwr-border)!important}
.hero-card.cwr-art{position:relative!important;min-height:430px!important;padding:0!important;border:1px solid #e1e9e3!important;border-radius:28px!important;background:rgba(255,255,255,.9)!important;box-shadow:0 28px 75px rgba(15,23,42,.11)!important;overflow:hidden!important;color:var(--cwr-ink)!important;backdrop-filter:blur(12px)}
.cwr-art-bg{position:absolute;inset:0;background:radial-gradient(circle at 78% 20%,rgba(22,163,74,.13),transparent 32%),radial-gradient(circle at 18% 86%,rgba(15,23,42,.055),transparent 28%),linear-gradient(135deg,#fff 0%,#f8fcf9 100%)}
.cwr-art-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(15,23,42,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(15,23,42,.035) 1px,transparent 1px);background-size:32px 32px;mask-image:linear-gradient(#000,transparent)}
.cwr-art-content{position:relative;padding:25px;z-index:2}
.cwr-art-top{display:flex;align-items:center;justify-content:space-between;gap:15px}
.cwr-art-kicker{font-size:10px;font-weight:900;letter-spacing:.14em;color:#64748b}
.cwr-art-live{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:850;color:#15803d;background:#effbf2;border:1px solid #d9f1df;border-radius:999px;padding:6px 8px}
.cwr-art-live i{width:6px;height:6px;border-radius:50%;background:#22c55e;display:block}
.cwr-art-title{margin-top:13px;font-size:27px;font-weight:900;letter-spacing:-.04em}
.cwr-art-sub{margin-top:4px;color:#64748b;font-size:12px}
.cwr-chart{position:relative;height:178px;margin-top:20px;border:1px solid #e5ebe7;border-radius:17px;background:rgba(255,255,255,.82);overflow:hidden}
.cwr-chart svg{width:100%;height:100%;display:block}
.cwr-chart-label{position:absolute;left:13px;top:11px;padding:5px 7px;border-radius:7px;background:#f8faf9;border:1px solid #edf1ee;color:#64748b;font-size:9px;font-weight:850;letter-spacing:.06em}
.cwr-deal-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.cwr-mini{padding:12px;border:1px solid #e4eae6;border-radius:13px;background:rgba(255,255,255,.9)}
.cwr-mini-label{color:#64748b;font-size:9px;font-weight:750;text-transform:uppercase;letter-spacing:.06em}
.cwr-mini-value{margin-top:4px;font-size:15px;font-weight:900}
.cwr-mini-value.green{color:#15803d}
.cwr-score-pill{position:absolute;right:24px;top:130px;display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:12px;background:#fff;border:1px solid #dce9df;box-shadow:0 12px 28px rgba(15,23,42,.10)}
.cwr-score-number{font-size:23px;font-weight:950;color:#15803d;line-height:1}
.cwr-score-label{font-size:9px;font-weight:850;color:#64748b;text-transform:uppercase;letter-spacing:.07em}
.cwr-nodes{position:absolute;right:18px;bottom:17px;display:flex;gap:7px;align-items:center;color:#94a3b8;font-size:8px;font-weight:800}
.cwr-nodes b{width:7px;height:7px;border-radius:50%;background:#86efac;box-shadow:0 0 0 4px rgba(134,239,172,.15)}
#wallets.section{padding-top:52px!important}
#wallets .section-header{margin-bottom:20px!important}
#wallets .section-header h2{font-size:35px!important;letter-spacing:-.045em!important}
#wallets .section-header p{color:var(--cwr-muted)!important;max-width:740px!important}
.cwr-brand-note{display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:6px 9px;border-radius:999px;background:#f1f5f9;color:#64748b;font-size:10px;font-weight:850}
.wallet-card{border:1px solid var(--cwr-border)!important;border-radius:19px!important;box-shadow:0 7px 25px rgba(15,23,42,.045)!important;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease!important}
.wallet-card:hover{transform:translateY(-3px);box-shadow:0 20px 42px rgba(15,23,42,.09)!important;border-color:#d7dfe8!important}
.wallet-image{height:230px!important;background:linear-gradient(180deg,#fbfcfd,#f6f8fa)!important}
.deal-radar-panel{border-radius:16px!important}
.deal-radar-score{font-weight:950!important}
.cwr-score-legend{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px;font-size:10px;font-weight:750;color:#64748b}
.cwr-score-legend span{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid #e7ece9;border-radius:999px;background:#fff}
.cwr-score-legend i{width:7px;height:7px;border-radius:50%;display:inline-block}.cwr-dot-green{background:#16a34a}.cwr-dot-amber{background:#f59e0b}.cwr-dot-red{background:#ef4444}
@media(max-width:900px){.hero-grid{grid-template-columns:1fr!important}.hero-card.cwr-art{max-width:650px}.hero{padding-top:52px!important}}
@media(max-width:640px){.hero{padding:38px 0 35px!important}.hero h1{font-size:43px!important}.hero-card.cwr-art{min-height:390px!important}.cwr-chart{height:150px}.cwr-score-pill{top:113px;right:15px}.hero-grid{gap:32px!important}}
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
    <div class="hero-card cwr-art">
      <div class="cwr-art-bg"></div><div class="cwr-art-grid"></div>
      <div class="cwr-art-content">
        <div class="cwr-art-top"><div class="cwr-art-kicker">DEAL RADAR · PRICE INTELLIGENCE</div><div class="cwr-art-live"><i></i> LIVE DATA</div></div>
        <div class="cwr-art-title">Know when the price is right.</div>
        <div class="cwr-art-sub">Official price · market offers · historical range</div>
        <div class="cwr-chart">
          <div class="cwr-chart-label">PRICE HISTORY</div>
          <svg viewBox="0 0 560 190" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="cwrArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22c55e" stop-opacity=".20"/><stop offset="1" stop-color="#22c55e" stop-opacity="0"/></linearGradient></defs>
            <path d="M0 146 L45 137 L86 143 L125 119 L166 126 L207 96 L248 108 L290 82 L331 92 L370 66 L412 77 L451 52 L492 62 L530 35 L560 42 L560 190 L0 190 Z" fill="url(#cwrArea)"/>
            <path d="M0 146 L45 137 L86 143 L125 119 L166 126 L207 96 L248 108 L290 82 L331 92 L370 66 L412 77 L451 52 L492 62 L530 35 L560 42" fill="none" stroke="#16a34a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            <g stroke="#e5eae7" stroke-width="1"><line x1="0" y1="55" x2="560" y2="55"/><line x1="0" y1="100" x2="560" y2="100"/><line x1="0" y1="145" x2="560" y2="145"/></g>
            <circle cx="530" cy="35" r="5" fill="#fff" stroke="#16a34a" stroke-width="3"/>
          </svg>
          <div class="cwr-score-pill"><div class="cwr-score-number">82</div><div class="cwr-score-label">Deal<br>Score</div></div>
        </div>
        <div class="cwr-deal-row"><div class="cwr-mini"><div class="cwr-mini-label">Official vs market</div><div class="cwr-mini-value green">-4.0%</div></div><div class="cwr-mini"><div class="cwr-mini-label">Buying signal</div><div class="cwr-mini-value green">Excellent deal</div></div></div>
        <div class="cwr-nodes"><b></b> price intelligence <span>•</span> tracked across offers</div>
      </div>
    </div>
  </div>
</section>`;

      const heroStart = html.indexOf('<section class="hero">');
      const heroEnd = heroStart >= 0 ? html.indexOf('</section>', heroStart) : -1;
      if (heroStart >= 0 && heroEnd >= 0) {
        html = html.slice(0, heroStart) + heroMarkup + html.slice(heroEnd + '</section>'.length);
      }

      html = html.replace(/<h2>Trezor hardware wallets<\/h2>/, '<h2>Hardware wallets</h2>');
      html = html.replace(/Current official prices first\.\s*Market offers and history help you\s*understand whether today'?s price is good\./, 'Compare official prices, market offers and price history to find out when a wallet is actually worth buying.');
      html = html.replace(/<div class="section-header">\s*<div>\s*<h2>Hardware wallets<\/h2>\s*<p>([\s\S]*?)<\/p>\s*<\/div>\s*<\/div>/, '<div class="section-header"><div><h2>Hardware wallets</h2><p>Compare official prices, market offers and price history to find out when a wallet is actually worth buying.</p><span class="cwr-brand-note">Trezor · More brands coming</span></div></div>');
      html = html.replace('</head>', css + '</head>');

      chunk = Buffer.isBuffer(chunk) ? Buffer.from(html) : html;
    }
  }

  return previousEnd.call(this, chunk, encoding, callback);
};
