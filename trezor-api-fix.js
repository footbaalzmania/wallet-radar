const http = require("http");

/*
  Trezor affiliate API compatibility:
  TUNE returns click_url, while the existing server expects tracking_url.
*/
const originalFetch = global.fetch;

global.fetch = async function (...args) {
  const response = await originalFetch(...args);

  const requestUrl =
    typeof args[0] === "string"
      ? args[0]
      : args[0]?.url || "";

  if (!requestUrl.includes(".api.hasoffers.com/Apiv3/json")) {
    return response;
  }

  const originalJson = response.json.bind(response);
  let cachedJson = null;

  response.json = async function () {
    if (cachedJson === null) {
      cachedJson = await originalJson();
    }

    const clickUrl = cachedJson?.response?.data?.click_url;

    if (
      clickUrl &&
      cachedJson?.response?.data &&
      !cachedJson.response.data.tracking_url
    ) {
      cachedJson.response.data.tracking_url = clickUrl;
    }

    return cachedJson;
  };

  return response;
};

/*
  Presentation-only layer for the server-rendered HTML.
  Keeps the fragile server.js untouched while we iterate on UX.
*/
const originalEnd = http.ServerResponse.prototype.end;

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

      /* Open affiliate routes in a new tab. */
      html = html.replace(
        /href=(["'])\/go\/[^"']+\1/g,
        '$& target="_blank" rel="noopener noreferrer"'
      );

      const uxCss = `
<style id="wallet-radar-ux">
  :root {
    --wr-green: #16a34a;
    --wr-ink: #0f172a;
    --wr-muted: #64748b;
    --wr-border: #e2e8f0;
  }

  body {
    background:
      radial-gradient(circle at 78% 9%, rgba(22,163,74,.055), transparent 27%),
      radial-gradient(circle at 12% 24%, rgba(15,23,42,.035), transparent 24%),
      #fff;
  }

  .hero {
    position: relative;
    overflow: hidden;
    padding: 48px 0 28px;
    isolation: isolate;
  }

  .hero::before {
    content: "";
    position: absolute;
    inset: 0 -12%;
    z-index: -2;
    opacity: .48;
    background-image:
      linear-gradient(rgba(15,23,42,.045) 1px, transparent 1px),
      linear-gradient(90deg, rgba(15,23,42,.045) 1px, transparent 1px);
    background-size: 54px 54px;
    mask-image: linear-gradient(to right, transparent 0%, #000 16%, #000 84%, transparent 100%);
  }

  .hero::after {
    content: "₿   Ξ   ◇   ◎   ₿   Ξ   ◇";
    position: absolute;
    top: 24px;
    right: 2%;
    z-index: -1;
    color: rgba(15,23,42,.07);
    font-size: clamp(22px, 3vw, 42px);
    font-weight: 900;
    letter-spacing: 24px;
    transform: rotate(-8deg);
    white-space: nowrap;
    pointer-events: none;
  }

  .hero-grid {
    grid-template-columns: minmax(0, 1.35fr) minmax(300px, .65fr);
    gap: 42px;
    align-items: center;
  }

  .hero-copy { position: relative; }

  .wr-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border: 1px solid rgba(22,163,74,.18);
    border-radius: 999px;
    background: rgba(236,253,243,.78);
    color: #15803d;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: .08em;
    text-transform: uppercase;
    backdrop-filter: blur(8px);
  }

  .wr-eyebrow::before {
    content: "";
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--wr-green);
    box-shadow: 0 0 0 4px rgba(22,163,74,.10);
  }

  .hero h1 {
    max-width: 780px;
    margin-top: 16px;
    margin-bottom: 14px;
    font-size: clamp(42px, 5.5vw, 66px);
    line-height: .98;
    letter-spacing: -.045em;
  }

  .hero p {
    max-width: 720px;
    color: var(--wr-muted);
    font-size: 17px;
    line-height: 1.65;
  }

  .hero-actions {
    margin-top: 24px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .hero-actions a {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 17px;
    border-radius: 11px;
    font-weight: 850;
    text-decoration: none;
    transition: transform .15s ease, box-shadow .15s ease, background .15s ease;
  }

  .wr-primary-cta {
    color: #fff !important;
    background: #0f172a !important;
    box-shadow: 0 7px 18px rgba(15,23,42,.13);
  }

  .wr-primary-cta:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 24px rgba(15,23,42,.18);
  }

  .wr-secondary-cta {
    color: #334155 !important;
    background: rgba(255,255,255,.82) !important;
    border: 1px solid var(--wr-border);
  }

  .hero-card {
    display: block;
    position: relative;
    padding: 20px;
    border: 1px solid rgba(226,232,240,.95);
    border-radius: 20px;
    background: rgba(255,255,255,.78);
    box-shadow: 0 20px 55px rgba(15,23,42,.08);
    backdrop-filter: blur(14px);
  }

  .hero-card::before,
  .hero-card::after {
    content: "";
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--wr-green);
    box-shadow: 0 0 0 6px rgba(22,163,74,.09);
  }

  .hero-card::before { top: 24px; right: 24px; }
  .hero-card::after { bottom: 34px; left: 24px; opacity: .45; }

  .wr-hero-label {
    color: var(--wr-muted);
    font-size: 11px;
    font-weight: 850;
    letter-spacing: .08em;
    text-transform: uppercase;
  }

  .wr-hero-score {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 16px;
    margin: 14px 0 18px;
  }

  .wr-hero-score strong {
    font-size: 42px;
    line-height: 1;
    letter-spacing: -.04em;
  }

  .wr-hero-score span {
    color: #15803d;
    font-size: 12px;
    font-weight: 900;
  }

  .wr-signal-list { display: grid; gap: 8px; }

  .wr-signal {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    padding: 11px 12px;
    border: 1px solid var(--wr-border);
    border-radius: 11px;
    background: rgba(248,250,252,.85);
    font-size: 12px;
  }

  .wr-signal span { color: var(--wr-muted); }
  .wr-signal strong { color: var(--wr-ink); }

  .stats { padding: 16px 0 22px; }

  .stats-grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .stat {
    padding: 11px 13px;
    border-radius: 12px;
    box-shadow: none;
  }

  .stat-label { font-size: 10px; white-space: nowrap; }
  .stat-value { margin-top: 1px; font-size: 16px; }

  #wallets.section {
    padding-top: 24px;
    padding-bottom: 30px;
  }

  #wallets .section-header { margin-bottom: 18px; }
  #wallets .section-header h2 {
    font-size: 30px;
    letter-spacing: -.025em;
  }
  #wallets .section-header p { max-width: 650px; }

  .wallet-image { height: 230px; }

  .wallet-card {
    position: relative;
    overflow: hidden;
    transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease;
  }

  .wallet-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 32px rgba(15,23,42,.08);
    border-color: #d7dee8;
  }

  .deal-radar-panel {
    margin-top: 18px;
    padding: 15px;
    border: 1px solid #dfe7e2;
    border-radius: 15px;
    background: linear-gradient(180deg, #fbfffc 0%, #f5faf7 100%);
  }

  .deal-radar-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .deal-radar-title {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    font-weight: 950;
    text-transform: uppercase;
    letter-spacing: .08em;
  }

  .deal-radar-title::before {
    content: "";
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--wr-green);
    box-shadow: 0 0 0 4px rgba(22,163,74,.10);
  }

  .deal-radar-score {
    min-width: 62px;
    padding: 7px 9px;
    border-radius: 9px;
    background: #dcfce7;
    color: #166534;
    text-align: center;
    font-size: 17px;
    font-weight: 950;
  }

  .deal-radar-status {
    margin-top: 4px;
    color: #15803d;
    font-size: 13px;
    font-weight: 850;
  }

  .deal-radar-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 12px;
  }

  .deal-radar-metric {
    padding: 9px 10px;
    border-radius: 10px;
    background: #fff;
    border: 1px solid #e7ece9;
  }

  .deal-radar-label {
    color: var(--wr-muted);
    font-size: 10px;
    font-weight: 750;
  }

  .deal-radar-value {
    margin-top: 2px;
    color: var(--wr-ink);
    font-size: 13px;
    font-weight: 900;
  }

  .deal-radar-foot {
    margin-top: 10px;
    color: var(--wr-muted);
    font-size: 10.5px;
    line-height: 1.45;
  }

  .deal-radar-panel.wr-fair {
    border-color: #eadfbe;
    background: linear-gradient(180deg, #fffdf8 0%, #fcf9f0 100%);
  }

  .deal-radar-panel.wr-fair .deal-radar-score {
    background: #fef3c7;
    color: #92400e;
  }

  .deal-radar-panel.wr-fair .deal-radar-status { color: #a16207; }

  .deal-radar-panel.wr-high {
    border-color: #ead6d6;
    background: linear-gradient(180deg, #fffafa 0%, #fdf6f6 100%);
  }

  .deal-radar-panel.wr-high .deal-radar-score {
    background: #fee2e2;
    color: #991b1b;
  }

  .deal-radar-panel.wr-high .deal-radar-status { color: #b91c1c; }

  .wr-brand-note {
    display: inline-flex;
    margin-left: 8px;
    padding: 4px 7px;
    border-radius: 999px;
    background: #f1f5f9;
    color: #64748b;
    font-size: 10px;
    font-weight: 800;
    vertical-align: middle;
  }

  @media (max-width: 860px) {
    .hero-grid {
      grid-template-columns: 1fr;
      gap: 24px;
    }
    .hero-card { max-width: 560px; }
  }

  @media (max-width: 640px) {
    .hero { padding: 30px 0 18px; }
    .hero h1 { font-size: 42px; }
    .hero p { font-size: 16px; }
    .hero::after { right: -90px; top: 16px; font-size: 24px; }
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
    .wallet-image { height: 210px; }
  }
</style>`;

      const uxScript = `
<script id="wallet-radar-ux-script">
(function () {
  function parsePrice(text) {
    if (!text) return null;
    var match = text.replace(/\\s/g, '').match(/([0-9]+(?:[.,][0-9]+)?)/);
    if (!match) return null;
    var value = Number(match[1].replace(',', '.'));
    return Number.isFinite(value) ? value : null;
  }

  function formatMoney(value) {
    if (!Number.isFinite(value)) return '—';
    return new Intl.NumberFormat('cs-CZ', {
      maximumFractionDigits: 0
    }).format(value) + ' CZK';
  }

  function applyWalletRadarUX() {
    var hero = document.querySelector('.hero');
    var heroCopy = document.querySelector('.hero-copy');
    var heroTitle = hero ? hero.querySelector('h1') : null;
    var heroText = hero ? hero.querySelector('p') : null;
    var heroActions = hero ? hero.querySelector('.hero-actions') : null;
    var heroCard = hero ? hero.querySelector('.hero-card') : null;

    if (heroCopy && heroTitle) {
      var eyebrow = heroCopy.querySelector('.wr-eyebrow');
      if (!eyebrow) {
        eyebrow = document.createElement('div');
        eyebrow.className = 'wr-eyebrow';
        eyebrow.textContent = 'Crypto hardware wallet deal intelligence';
        heroTitle.parentNode.insertBefore(eyebrow, heroTitle);
      }
    }

    if (heroTitle) {
      heroTitle.textContent = 'Find the best deals on crypto hardware wallets.';
    }

    if (heroText) {
      heroText.textContent =
        'We track official prices, compare market offers and turn price history into a simple Deal Score — so you can see when a hardware wallet is actually worth buying.';
    }

    if (heroActions) {
      heroActions.innerHTML =
        '<a class="wr-primary-cta" href="#wallets">Explore the best deals <span aria-hidden="true">→</span></a>' +
        '<a class="wr-secondary-cta" href="/compare">Compare wallets</a>';
    }

    if (heroCard) {
      heroCard.innerHTML =
        '<div class="wr-hero-label">Deal Radar</div>' +
        '<div class="wr-hero-score"><strong>Deal Score</strong><span>price intelligence</span></div>' +
        '<div class="wr-signal-list">' +
          '<div class="wr-signal"><span>Official vs market</span><strong>Tracked</strong></div>' +
          '<div class="wr-signal"><span>Historical prices</span><strong>Compared</strong></div>' +
          '<div class="wr-signal"><span>Buying signal</span><strong>Simple &amp; clear</strong></div>' +
        '</div>';
    }

    var stats = document.querySelector('.stats');
    var wallets = document.querySelector('#wallets');

    if (stats && wallets) {
      wallets.parentNode.insertBefore(stats, wallets.nextElementSibling);
    }

    document.querySelectorAll('a[href^="/go/"]').forEach(function (link) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    });

    document.querySelectorAll('.wallet-card').forEach(function (card) {
      if (card.querySelector('.deal-radar-panel')) return;

      var priceBlock = card.querySelector('.price-block');
      var dealRow = card.querySelector('.deal-row');
      var note = card.querySelector('.note');
      if (!priceBlock) return;

      var officialEl = card.querySelector('.official-price');
      var marketEl = card.querySelector('.market-price strong');
      var scoreEl = card.querySelector('.deal-score');
      var badgeEl = card.querySelector('.deal-badge');

      var official = parsePrice(officialEl ? officialEl.textContent : '');
      var market = parsePrice(marketEl ? marketEl.textContent : '');
      var score = scoreEl ? parsePrice(scoreEl.textContent) : null;
      var status = badgeEl ? badgeEl.textContent.trim() : 'Building price history';

      var marketDelta = null;
      if (Number.isFinite(official) && Number.isFinite(market) && official > 0) {
        marketDelta = ((market - official) / official) * 100;
      }

      var scoreText = Number.isFinite(score) ? score + '/100' : '—/100';
      var statusText = status || 'Building price history';
      var deltaText = Number.isFinite(marketDelta)
        ? (marketDelta > 0 ? '+' : '') + marketDelta.toFixed(1) + '% vs official'
        : 'Waiting for market data';

      var panel = document.createElement('div');
      panel.className = 'deal-radar-panel';
      if (/fair/i.test(statusText)) panel.classList.add('wr-fair');
      else if (/high/i.test(statusText)) panel.classList.add('wr-high');

      panel.innerHTML =
        '<div class="deal-radar-head">' +
          '<div>' +
            '<div class="deal-radar-title">Deal Radar</div>' +
            '<div class="deal-radar-status">' + statusText + '</div>' +
          '</div>' +
          '<div class="deal-radar-score">' + scoreText + '</div>' +
        '</div>' +
        '<div class="deal-radar-grid">' +
          '<div class="deal-radar-metric">' +
            '<div class="deal-radar-label">Official price</div>' +
            '<div class="deal-radar-value">' + formatMoney(official) + '</div>' +
          '</div>' +
          '<div class="deal-radar-metric">' +
            '<div class="deal-radar-label">Market price</div>' +
            '<div class="deal-radar-value">' + formatMoney(market) + '</div>' +
          '</div>' +
          '<div class="deal-radar-metric">' +
            '<div class="deal-radar-label">Price difference</div>' +
            '<div class="deal-radar-value">' + deltaText + '</div>' +
          '</div>' +
          '<div class="deal-radar-metric">' +
            '<div class="deal-radar-label">Signal</div>' +
            '<div class="deal-radar-value">' + statusText + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="deal-radar-foot">' +
          'Deal Score compares the current price with tracked historical prices.' +
        '</div>';

      priceBlock.insertAdjacentElement('afterend', panel);

      if (dealRow) dealRow.style.display = 'none';
      if (note) note.style.display = 'none';
    });

    var walletHeader = document.querySelector('#wallets .section-header');
    if (walletHeader && !walletHeader.querySelector('.wr-brand-note')) {
      var note = document.createElement('span');
      note.className = 'wr-brand-note';
      note.textContent = 'More brands coming';
      walletHeader.appendChild(note);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyWalletRadarUX);
  } else {
    applyWalletRadarUX();
  }
})();
</script>`;

      if (html.includes("</head>")) {
        html = html.replace("</head>", `${uxCss}\n</head>`);
      }

      if (html.includes("</body>")) {
        html = html.replace("</body>", `${uxScript}\n</body>`);
      }

      chunk = Buffer.from(html, encoding || "utf8");
    }
  }

  return originalEnd.call(this, chunk, encoding, callback);
};
