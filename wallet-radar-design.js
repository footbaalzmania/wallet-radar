const http = require("http");

/*
  CryptoWalletRadar visual design layer.
  Runs after trezor-api-fix.js and only changes server-rendered HTML/CSS/UX.
  No pricing, affiliate or server logic is changed here.
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

      const designCss = `
<style id="crypto-wallet-radar-design">
  :root {
    --cwr-ink: #0b1220;
    --cwr-muted: #64748b;
    --cwr-border: #e5eaf0;
    --cwr-green: #16a34a;
    --cwr-green-dark: #15803d;
    --cwr-green-soft: #ecfdf3;
    --cwr-amber: #d97706;
    --cwr-amber-soft: #fffbeb;
    --cwr-red: #dc2626;
    --cwr-red-soft: #fef2f2;
  }

  body {
    color: var(--cwr-ink);
    background:
      radial-gradient(circle at 83% 10%, rgba(22,163,74,.07), transparent 24%),
      radial-gradient(circle at 8% 30%, rgba(15,23,42,.035), transparent 22%),
      #fff;
  }

  .hero {
    position: relative;
    overflow: hidden;
    padding: 56px 0 30px !important;
    isolation: isolate;
    border-bottom: 1px solid rgba(226,232,240,.72);
  }

  .hero::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -2;
    opacity: .52;
    background-image:
      linear-gradient(rgba(15,23,42,.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(15,23,42,.035) 1px, transparent 1px);
    background-size: 52px 52px;
    mask-image: linear-gradient(to right, transparent, #000 15%, #000 85%, transparent);
  }

  .hero::after {
    content: "₿    Ξ    ◇    ◎    ₿    Ξ";
    position: absolute;
    top: 30px;
    right: -30px;
    z-index: -1;
    color: rgba(15,23,42,.055);
    font-size: clamp(28px, 4vw, 54px);
    font-weight: 900;
    letter-spacing: 18px;
    transform: rotate(-7deg);
    white-space: nowrap;
    pointer-events: none;
  }

  .hero-grid {
    grid-template-columns: minmax(0, 1.32fr) minmax(310px, .68fr) !important;
    gap: 48px !important;
    align-items: center;
  }

  .hero-copy { position: relative; z-index: 2; }

  .hero-copy::before {
    content: "CRYPTO HARDWARE WALLET RADAR";
    display: inline-flex;
    align-items: center;
    padding: 7px 11px;
    border: 1px solid rgba(22,163,74,.18);
    border-radius: 999px;
    background: rgba(236,253,243,.88);
    color: var(--cwr-green-dark);
    font-size: 10px;
    font-weight: 950;
    letter-spacing: .13em;
    text-transform: uppercase;
    box-shadow: 0 4px 15px rgba(22,163,74,.05);
  }

  .hero h1 {
    max-width: 820px !important;
    margin: 16px 0 15px !important;
    font-size: clamp(43px, 5.7vw, 70px) !important;
    line-height: .97 !important;
    letter-spacing: -.055em !important;
  }

  .hero h1 .cwr-accent { color: var(--cwr-green); }

  .hero p {
    max-width: 700px !important;
    color: #64748b !important;
    font-size: 17px !important;
    line-height: 1.65 !important;
  }

  .hero-actions {
    margin-top: 25px !important;
    gap: 10px !important;
  }

  .hero-actions a {
    min-height: 46px !important;
    border-radius: 11px !important;
    padding: 0 18px !important;
    font-weight: 900 !important;
    text-decoration: none !important;
  }

  .hero-actions a:first-child {
    background: var(--cwr-green) !important;
    color: #fff !important;
    box-shadow: 0 8px 22px rgba(22,163,74,.18) !important;
  }

  .hero-actions a:first-child:hover {
    background: #15803d !important;
    transform: translateY(-1px);
  }

  .hero-actions a:not(:first-child) {
    background: #fff !important;
    color: var(--cwr-ink) !important;
    border: 1px solid var(--cwr-border) !important;
  }

  .hero-card {
    display: block !important;
    min-height: 235px;
    padding: 21px !important;
    border: 1px solid rgba(226,232,240,.95) !important;
    border-radius: 22px !important;
    background: rgba(255,255,255,.84) !important;
    box-shadow: 0 24px 65px rgba(15,23,42,.09) !important;
    backdrop-filter: blur(14px);
  }

  .hero-card .wr-hero-score strong {
    color: var(--cwr-green) !important;
  }

  .hero-card::before {
    background: var(--cwr-green) !important;
  }

  #wallets.section {
    padding-top: 34px !important;
    padding-bottom: 34px !important;
  }

  #wallets .section-header {
    margin-bottom: 19px !important;
  }

  #wallets .section-header h2 {
    font-size: clamp(30px, 3vw, 38px) !important;
    letter-spacing: -.035em !important;
  }

  #wallets .section-header p {
    max-width: 720px !important;
    color: var(--cwr-muted) !important;
  }

  .wallet-card {
    overflow: hidden;
    border: 1px solid var(--cwr-border) !important;
    border-radius: 18px !important;
    background: #fff !important;
    box-shadow: 0 5px 22px rgba(15,23,42,.035) !important;
    transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease !important;
  }

  .wallet-card:hover {
    transform: translateY(-3px);
    border-color: #d5dde7 !important;
    box-shadow: 0 18px 38px rgba(15,23,42,.09) !important;
  }

  .wallet-card .wallet-image {
    height: 220px !important;
    background: linear-gradient(180deg, #fbfcfd 0%, #f6f8fa 100%) !important;
  }

  .deal-radar-panel {
    margin-top: 15px !important;
    padding: 16px !important;
    border-radius: 16px !important;
    border: 1px solid #dbe9df !important;
    background: linear-gradient(180deg, #fbfffc, #f3faf5) !important;
  }

  .deal-radar-head {
    align-items: flex-start !important;
  }

  .deal-radar-title {
    color: #334155 !important;
    font-size: 10px !important;
    letter-spacing: .11em !important;
  }

  .deal-radar-score {
    min-width: 72px !important;
    padding: 8px 10px !important;
    border-radius: 11px !important;
    background: #dcfce7 !important;
    color: #166534 !important;
    font-size: 21px !important;
    line-height: 1 !important;
    box-shadow: inset 0 0 0 1px rgba(22,101,52,.06);
  }

  .deal-radar-status {
    margin-top: 5px !important;
    font-size: 13px !important;
    font-weight: 900 !important;
  }

  .deal-radar-grid {
    gap: 8px !important;
    margin-top: 13px !important;
  }

  .deal-radar-metric {
    border: 1px solid #e6ece8 !important;
    border-radius: 10px !important;
    background: #fff !important;
  }

  .deal-radar-value {
    font-size: 13px !important;
  }

  .deal-radar-panel.wr-fair {
    border-color: #eee2be !important;
    background: linear-gradient(180deg, #fffdf8, #fcf9ef) !important;
  }

  .deal-radar-panel.wr-fair .deal-radar-score {
    background: #fef3c7 !important;
    color: #a16207 !important;
  }

  .deal-radar-panel.wr-fair .deal-radar-status {
    color: #a16207 !important;
  }

  .deal-radar-panel.wr-high {
    border-color: #efdada !important;
    background: linear-gradient(180deg, #fffafa, #fdf6f6) !important;
  }

  .deal-radar-panel.wr-high .deal-radar-score {
    background: #fee2e2 !important;
    color: #b91c1c !important;
  }

  .deal-radar-panel.wr-high .deal-radar-status {
    color: #b91c1c !important;
  }

  .cwr-score-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: 14px;
    color: #64748b;
    font-size: 10px;
    font-weight: 750;
  }

  .cwr-score-legend span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 7px;
    border: 1px solid #e8edf1;
    border-radius: 999px;
    background: #fff;
  }

  .cwr-score-legend i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    display: inline-block;
  }

  .cwr-dot-green { background: #16a34a; }
  .cwr-dot-amber { background: #f59e0b; }
  .cwr-dot-red { background: #ef4444; }

  .stats {
    padding: 17px 0 25px !important;
  }

  .stat {
    border: 1px solid var(--cwr-border) !important;
    border-radius: 13px !important;
    background: #fff !important;
  }

  .wr-brand-note {
    background: #f1f5f9 !important;
    color: #64748b !important;
  }

  @media (max-width: 860px) {
    .hero-grid { grid-template-columns: 1fr !important; gap: 28px !important; }
    .hero-card { max-width: 600px; }
  }

  @media (max-width: 640px) {
    .hero { padding: 34px 0 24px !important; }
    .hero h1 { font-size: 42px !important; }
    .hero p { font-size: 16px !important; }
    .wallet-card .wallet-image { height: 205px !important; }
    .deal-radar-score { min-width: 65px !important; font-size: 19px !important; }
  }
</style>`;

      const designScript = `
<script id="crypto-wallet-radar-design-script">
(function () {
  function text(el) {
    return el ? (el.textContent || '').trim() : '';
  }

  function scoreOf(panel) {
    var scoreEl = panel && panel.querySelector('.deal-radar-score');
    if (!scoreEl) return null;
    var m = text(scoreEl).match(/\\d+/);
    return m ? Number(m[0]) : null;
  }

  function classify(panel) {
    if (!panel) return;
    panel.classList.remove('wr-fair', 'wr-high');
    var score = scoreOf(panel);
    if (score === null) return;
    if (score < 40) panel.classList.add('wr-high');
    else if (score < 60) panel.classList.add('wr-fair');
  }

  function run() {
    var hero = document.querySelector('.hero');
    if (!hero) return;

    var title = hero.querySelector('h1');
    if (title) {
      title.innerHTML = 'Find the best deals on <span class="cwr-accent">crypto</span> hardware wallets.';
    }

    var paragraph = hero.querySelector('p');
    if (paragraph) {
      paragraph.textContent = 'We track official prices, compare market offers and turn price history into simple buying signals — so you know when a hardware wallet is actually worth buying.';
    }

    var buttons = hero.querySelectorAll('.hero-actions a');
    if (buttons.length) {
      buttons[0].textContent = 'Explore the best deals →';
      if (buttons[0].getAttribute('href') === '#wallets' || !buttons[0].getAttribute('href')) buttons[0].setAttribute('href', '#wallets');
      if (buttons.length > 1) buttons[1].textContent = 'Compare wallets';
    }

    var heroCard = hero.querySelector('.hero-card');
    if (heroCard && !heroCard.dataset.cwrRebuilt) {
      heroCard.dataset.cwrRebuilt = '1';
      heroCard.innerHTML = '\n        <div class="wr-hero-label">DEAL RADAR</div>\n        <div class="wr-hero-score"><strong>Price intelligence</strong><span>DATA-DRIVEN</span></div>\n        <div class="wr-signal-list">\n          <div class="wr-signal"><span>Official vs market</span><strong>Tracked</strong></div>\n          <div class="wr-signal"><span>Historical prices</span><strong>Compared</strong></div>\n          <div class="wr-signal"><span>Buying signal</span><strong>Simple &amp; clear</strong></div>\n        </div>';
    }

    var walletSection = document.querySelector('#wallets');
    if (walletSection) {
      var heading = walletSection.querySelector('.section-header h2');
      if (heading) heading.textContent = 'Hardware wallets';

      var sub = walletSection.querySelector('.section-header p');
      if (sub) sub.textContent = 'Compare official prices, market offers and price history to find out when a wallet is actually worth buying.';

      var header = walletSection.querySelector('.section-header');
      if (header && !header.querySelector('.wr-brand-note')) {
        var note = document.createElement('span');
        note.className = 'wr-brand-note';
        note.textContent = 'Trezor · More brands coming';
        header.appendChild(note);
      }

      walletSection.querySelectorAll('.deal-radar-panel').forEach(classify);

      var legend = walletSection.querySelector('.cwr-score-legend');
      if (!legend) {
        legend = document.createElement('div');
        legend.className = 'cwr-score-legend';
        legend.innerHTML = '<span><i class="cwr-dot-green"></i>60–100 Good / Excellent</span><span><i class="cwr-dot-amber"></i>40–59 Fair price</span><span><i class="cwr-dot-red"></i>0–39 High price</span>';
        var cards = walletSection.querySelector('.wallet-grid') || walletSection.querySelector('.products-grid');
        if (cards && cards.parentNode) cards.parentNode.insertBefore(legend, cards.nextSibling);
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
</script>`;

      if (html.includes('</head>')) html = html.replace('</head>', designCss + '\n</head>');
      if (html.includes('</body>')) html = html.replace('</body>', designScript + '\n</body>');

      chunk = Buffer.from(html, encoding || 'utf8');
    }
  }

  return previousEnd.call(this, chunk, encoding, callback);
};
