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
  This keeps the fragile server.js untouched while we iterate on UX.
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

      /* Open every Trezor affiliate route in a new tab. */
      html = html.replace(
        /href=(["'])\/go\/[^"']+\1/g,
        '$& target="_blank" rel="noopener noreferrer"'
      );

      const uxCss = `
<style id="wallet-radar-ux">
  .hero {
    padding: 38px 0 18px;
  }

  .hero-grid {
    grid-template-columns: 1fr;
    gap: 18px;
  }

  .hero h1 {
    font-size: clamp(38px, 5vw, 58px);
    max-width: 820px;
    margin-top: 14px;
    margin-bottom: 12px;
  }

  .hero p {
    max-width: 760px;
    font-size: 16px;
  }

  .hero-actions {
    margin-top: 20px;
  }

  .hero-card {
    display: none;
  }

  /* Stats sit below the wallet cards. */
  .stats {
    padding: 18px 0 20px;
  }

  .stats-grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .stat {
    padding: 10px 13px;
    border-radius: 12px;
    box-shadow: none;
  }

  .stat-label {
    font-size: 10px;
    white-space: nowrap;
  }

  .stat-value {
    margin-top: 1px;
    font-size: 16px;
  }

  #wallets.section {
    padding-top: 20px;
    padding-bottom: 20px;
  }

  #wallets .section-header {
    margin-bottom: 16px;
  }

  #wallets .section-header h2 {
    font-size: 28px;
  }

  .wallet-image {
    height: 230px;
  }

  .wallet-card {
    transition: transform .15s ease, box-shadow .15s ease;
  }

  .wallet-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,0,0,.07);
  }

  /* Deal Radar card */
  .deal-radar-panel {
    margin-top: 18px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: #f8fafc;
  }

  .deal-radar-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .deal-radar-title {
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: .07em;
  }

  .deal-radar-score {
    font-size: 18px;
    font-weight: 950;
  }

  .deal-radar-status {
    margin-top: 3px;
    font-size: 13px;
    font-weight: 800;
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
    border: 1px solid var(--border);
  }

  .deal-radar-label {
    color: var(--muted);
    font-size: 10px;
    font-weight: 750;
  }

  .deal-radar-value {
    margin-top: 2px;
    font-size: 13px;
    font-weight: 900;
  }

  .deal-radar-foot {
    margin-top: 10px;
    color: var(--muted);
    font-size: 11px;
    line-height: 1.4;
  }

  @media (max-width: 640px) {
    .hero {
      padding: 28px 0 12px;
    }

    .hero h1 {
      font-size: 40px;
    }

    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .wallet-image {
      height: 210px;
    }
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
    var stats = document.querySelector('.stats');
    var wallets = document.querySelector('#wallets');

    if (stats && wallets) {
      wallets.parentNode.insertBefore(stats, wallets.nextElementSibling);
    }

    document.querySelectorAll('a[href^="/go/trezor-"]').forEach(function (link) {
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
          'Deal Score will become more precise as the radar collects real historical prices.' +
        '</div>';

      priceBlock.insertAdjacentElement('afterend', panel);

      if (dealRow) dealRow.style.display = 'none';
      if (note) note.style.display = 'none';
    });
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
