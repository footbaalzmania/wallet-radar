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
  Small presentation-only layer for the current server-rendered HTML.
  This lets us improve UX without touching the large, fragile server.js.
*/
const originalEnd = http.ServerResponse.prototype.end;

http.ServerResponse.prototype.end = function (chunk, encoding, callback) {
  if (chunk && !this.headersSent) {
    const contentType = String(this.getHeader("content-type") || "");
    const looksLikeHtml =
      contentType.includes("text/html") ||
      (typeof chunk === "string" && chunk.includes("<!DOCTYPE html>"));

    if (looksLikeHtml) {
      let html = Buffer.isBuffer(chunk)
        ? chunk.toString(encoding || "utf8")
        : String(chunk);

      /* Keep Trezor affiliate links out of the current tab. */
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

  /* Stats sit below the wallet cards, not between hero and products. */
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
  function applyWalletRadarUX() {
    var stats = document.querySelector('.stats');
    var wallets = document.querySelector('#wallets');

    if (stats && wallets && stats.previousElementSibling !== wallets) {
      wallets.parentNode.insertBefore(stats, wallets.nextElementSibling);
    }

    document.querySelectorAll('a[href^="/go/trezor-"]').forEach(function (link) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
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

      /* Content-Length, if already present, is now stale after HTML changes. */
      this.removeHeader("content-length");
    }
  }

  return originalEnd.call(this, chunk, encoding, callback);
};
