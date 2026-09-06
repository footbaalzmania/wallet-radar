const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const BASE_URL =
  process.env.BASE_URL ||
  "https://cryptowalletradar.com";

const TREZOR_API_KEY = process.env.TREZOR_API_KEY || "";
const TREZOR_NETWORK_ID = process.env.TREZOR_NETWORK_ID || "trezor";

const productsPath = path.join(__dirname, "products.json");

let products = [];

try {
  products = JSON.parse(fs.readFileSync(productsPath, "utf8"));
} catch (err) {
  console.error("Could not load products.json:", err.message);
}

/* -------------------------------------------------------
   HELPERS
------------------------------------------------------- */

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getProduct(slug) {
  return products.find((product) => product.slug === slug);
}

function getBestOffer(product) {
  if (!product || !Array.isArray(product.offers)) {
    return null;
  }

  const validOffers = product.offers.filter((offer) => {
    return Number.isFinite(Number(offer.price));
  });

  if (!validOffers.length) {
    return null;
  }

  return validOffers.reduce((best, offer) => {
    return Number(offer.price) < Number(best.price) ? offer : best;
  });
}

function getCurrentPrice(product) {
  const offer = getBestOffer(product);
  return offer ? Number(offer.price) : null;
}

function formatPrice(price, currency = "CZK") {
  if (price === null || price === undefined || price === "") {
    return "Price unavailable";
  }

  const number = Number(price);

  if (!Number.isFinite(number)) {
    return escapeHtml(price);
  }

  return `${number.toLocaleString("cs-CZ")} ${escapeHtml(currency)}`;
}

function getPriceHistory(product) {
  if (!product || !Array.isArray(product.priceHistory)) {
    return [];
  }

  return product.priceHistory
    .map((item) => ({
      date: item.date,
      price: Number(item.price),
      currency: item.currency || product.currency || "CZK",
    }))
    .filter(
      (item) =>
        item.date &&
        Number.isFinite(item.price) &&
        item.price > 0
    );
}

function getLowestPrice(product) {
  const history = getPriceHistory(product);
  const current = getCurrentPrice(product);

  const values = history.map((item) => item.price);

  if (Number.isFinite(current) && current > 0) {
    values.push(current);
  }

  if (!values.length) {
    return null;
  }

  return Math.min(...values);
}

function getHighestPrice(product) {
  const history = getPriceHistory(product);
  const current = getCurrentPrice(product);

  const values = history.map((item) => item.price);

  if (Number.isFinite(current) && current > 0) {
    values.push(current);
  }

  if (!values.length) {
    return null;
  }

  return Math.max(...values);
}

function getDealScore(product) {
  const current = getCurrentPrice(product);
  const history = getPriceHistory(product);

  const values = history.map((item) => item.price);

  if (Number.isFinite(current) && current > 0) {
    values.push(current);
  }

  /*
    We deliberately do not show a fake score when there is
    not enough historical data.
  */
  if (values.length < 2 || !Number.isFinite(current)) {
    return null;
  }

  const lowest = Math.min(...values);
  const highest = Math.max(...values);

  if (highest === lowest) {
    return 50;
  }

  const score =
    ((highest - current) / (highest - lowest)) * 100;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function getDealStatus(product) {
  const score = getDealScore(product);

  if (score === null) {
    return "Building price history";
  }

  if (score >= 80) {
    return "Excellent deal";
  }

  if (score >= 60) {
    return "Good deal";
  }

  if (score >= 40) {
    return "Fair price";
  }

  return "High price";
}

/* -------------------------------------------------------
   TREZOR AFFILIATE
------------------------------------------------------- */

const TREZOR_OFFERS = {
  "trezor-safe-3": 169,
  "trezor-safe-5": 235,
  "trezor-safe-7": 352,
};

async function generateTrezorTrackingLink(offerId, source) {
  if (!TREZOR_API_KEY) {
    throw new Error("TREZOR_API_KEY is not configured");
  }

  const url = "https://api.hasoffers.com/Api";

  const body = new URLSearchParams();

  body.set("NetworkId", TREZOR_NETWORK_ID);
  body.set("Target", "Affiliate_Offer");
  body.set("Method", "generateTrackingLink");
  body.set("Format", "json");
  body.set("Version", "3");
  body.set("api_key", TREZOR_API_KEY);
  body.set("offer_id", String(offerId));
  body.set("source", source || "walletradar");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type":
        "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: body.toString(),
  });

  const data = await response.json();

  const clickUrl =
    data &&
    data.response &&
    data.response.data &&
    data.response.data.click_url;

  if (clickUrl) {
    return clickUrl;
  }

  throw new Error(
    data?.response?.errorMessage ||
      "Could not generate Trezor tracking link"
  );
}

/* -------------------------------------------------------
   CHART
------------------------------------------------------- */

function buildChart(product) {
  const history = getPriceHistory(product);
  const current = getCurrentPrice(product);

  const values = history.map((item) => item.price);

  if (Number.isFinite(current) && current > 0) {
    values.push(current);
  }

  if (!values.length) {
    return `
      <div class="chart-empty">
        Price history is being collected.
      </div>
    `;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return `
    <div
      class="chart"
      aria-label="${escapeHtml(product.name)} price history"
    >
      ${values
        .slice(-30)
        .map((value) => {
          const height =
            15 + ((value - min) / range) * 85;

          return `
            <div
              class="bar"
              style="height:${height}%"
              title="${escapeHtml(
                formatPrice(value, product.currency)
              )}"
            ></div>
          `;
        })
        .join("")}
    </div>
  `;
}

/* -------------------------------------------------------
   PAGE TEMPLATE
------------------------------------------------------- */

function pageTemplate({
  title,
  description,
  canonical,
  content,
  productSchema = null,
}) {
  const schema = productSchema
    ? `
      <script type="application/ld+json">
        ${JSON.stringify(productSchema)}
      </script>
    `
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>

  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>${escapeHtml(title)}</title>

  <meta
    name="description"
    content="${escapeHtml(description)}"
  >

  <link
    rel="canonical"
    href="${escapeHtml(canonical)}"
  >

  <meta property="og:type" content="website">
  <meta
    property="og:title"
    content="${escapeHtml(title)}"
  >
  <meta
    property="og:description"
    content="${escapeHtml(description)}"
  >
  <meta
    property="og:url"
    content="${escapeHtml(canonical)}"
  >

  <meta name="twitter:card" content="summary">
  <meta
    name="twitter:title"
    content="${escapeHtml(title)}"
  >
  <meta
    name="twitter:description"
    content="${escapeHtml(description)}"
  >

  ${schema}

  <style>

    :root {
      color-scheme: light;

      --bg: #f5f7fb;
      --card: #ffffff;
      --text: #111827;
      --muted: #6b7280;
      --border: #e5e7eb;
      --accent: #111827;
      --accent-soft: #eef2ff;
      --green: #087f5b;

      --shadow:
        0 10px 30px rgba(15, 23, 42, .06);
    }

    * {
      box-sizing: border-box;
    }

    html {
      scroll-behavior: smooth;
    }

    body {
      margin: 0;

      font-family:
        Inter,
        ui-sans-serif,
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;

      background: var(--bg);
      color: var(--text);

      line-height: 1.5;
    }

    a {
      color: inherit;
      text-decoration: none;
    }

    .container {
      width:
        min(1120px, calc(100% - 32px));

      margin: 0 auto;
    }

    /* NAV */

    header {
      background:
        rgba(255, 255, 255, .88);

      border-bottom:
        1px solid var(--border);

      position: sticky;
      top: 0;

      z-index: 20;

      backdrop-filter: blur(12px);
    }

    .nav {
      min-height: 68px;

      display: flex;
      align-items: center;
      justify-content: space-between;

      gap: 20px;
    }

    .brand {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -.04em;
    }

    .brand span {
      color: #64748b;
    }

    nav {
      display: flex;
      align-items: center;

      gap: 22px;

      color: #475569;
      font-size: 14px;
    }

    nav a:hover {
      color: var(--text);
    }

    /* THEME */

    .theme-switcher {
      display: flex;
      gap: 4px;

      padding: 4px;

      border:
        1px solid var(--border);

      border-radius: 10px;

      background: #fff;
    }

    .theme-switcher button {
      border: 0;
      background: transparent;

      border-radius: 7px;

      padding: 5px 8px;

      cursor: pointer;

      color: #64748b;

      font-size: 12px;
    }

    .theme-switcher button.active {
      background: #111827;
      color: #fff;
    }

    /* HERO */

    .hero {
      padding: 78px 0 54px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;

      border:
        1px solid var(--border);

      background: #fff;

      padding: 7px 11px;

      border-radius: 999px;

      color: #475569;

      font-size: 12px;
      font-weight: 600;
    }

    .badge-dot {
      width: 7px;
      height: 7px;

      border-radius: 50%;

      background: #10b981;
    }

    h1 {
      margin: 18px 0 14px;

      max-width: 820px;

      font-size:
        clamp(42px, 7vw, 76px);

      line-height: .98;

      letter-spacing: -.065em;
    }

    .hero-text {
      max-width: 690px;

      color: var(--muted);

      font-size: 19px;
    }

    .search {
      margin-top: 30px;
      max-width: 640px;
    }

    .search input {
      width: 100%;

      border:
        1px solid var(--border);

      background: #fff;

      border-radius: 14px;

      padding: 16px 18px;

      font-size: 16px;

      outline: none;

      box-shadow: var(--shadow);
    }

    .search input:focus {
      border-color: #94a3b8;
    }

    /* SECTIONS */

    .section {
      padding: 34px 0 70px;
    }

    .section-header {
      display: flex;

      justify-content: space-between;
      align-items: end;

      gap: 20px;

      margin-bottom: 20px;
    }

    .section h2 {
      margin: 0;

      font-size: 28px;

      letter-spacing: -.035em;
    }

    .section-subtitle {
      margin: 5px 0 0;

      color: var(--muted);
    }

    /* STATS */

    .stats {
      display: grid;

      grid-template-columns:
        repeat(3, 1fr);

      gap: 14px;

      margin: 30px 0 10px;
    }

    .stat {
      background: var(--card);

      border:
        1px solid var(--border);

      border-radius: 16px;

      padding: 20px;

      box-shadow: var(--shadow);
    }

    .stat-number {
      font-size: 30px;

      font-weight: 800;

      letter-spacing: -.04em;
    }

    .stat-label {
      color: var(--muted);

      font-size: 13px;

      margin-top: 3px;
    }

    /* INTELLIGENCE */

    .intelligence {
      display: grid;

      grid-template-columns:
        repeat(2, 1fr);

      gap: 14px;

      margin-bottom: 42px;
    }

    .intel-card {
      border:
        1px solid var(--border);

      background: var(--card);

      border-radius: 18px;

      padding: 24px;

      box-shadow: var(--shadow);
    }

    .intel-label {
      color: var(--muted);

      text-transform: uppercase;

      font-size: 11px;

      font-weight: 800;

      letter-spacing: .08em;
    }

    .intel-value {
      margin-top: 7px;

      font-size: 23px;

      font-weight: 800;
    }

    /* WALLET GRID */

    .wallet-grid {
      display: grid;

      grid-template-columns:
        repeat(2, 1fr);

      gap: 18px;
    }

    .hero-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 220px;
      gap: 36px;
      align-items: end;
    }

    .hero-main {
      min-width: 0;
    }

    .mini-stats {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: 16px;
      background: rgba(255,255,255,.72);
      box-shadow: var(--shadow);
    }

    .mini-stat {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 10px;
      border-radius: 10px;
      background: var(--bg);
    }

    .mini-stat strong {
      font-size: 18px;
      font-weight: 800;
    }

    .mini-stat span {
      font-size: 11px;
      color: var(--muted);
      text-align: right;
      line-height: 1.2;
    }

    .wallet-card {
      background: var(--card);

      border:
        1px solid var(--border);

      border-radius: 20px;

      padding: 23px;

      box-shadow: var(--shadow);

      overflow: hidden;
    }

    .wallet-image {
      width: 100%;

      height: 230px;

      display: flex;

      align-items: center;
      justify-content: center;

      background:
        linear-gradient(
          180deg,
          #f8fafc 0%,
          #eef2f7 100%
        );

      border-radius: 15px;

      margin-bottom: 20px;

      overflow: hidden;
    }

    .wallet-image img {
      max-width: 85%;
      max-height: 210px;

      width: auto;
      height: auto;

      object-fit: contain;

      display: block;
    }

    .wallet-top {
      display: flex;

      justify-content: space-between;

      gap: 15px;

      align-items: flex-start;
    }

    .wallet-name {
      font-size: 23px;

      font-weight: 800;

      letter-spacing: -.035em;
    }

    .wallet-brand {
      color: var(--muted);

      font-size: 13px;

      margin-top: 2px;
    }

    .score {
      min-width: 64px;

      padding: 8px 9px;

      border-radius: 12px;

      background: var(--accent-soft);

      text-align: center;
    }

    .score-number {
      font-size: 21px;

      font-weight: 800;
    }

    .score-label {
      color: var(--muted);

      font-size: 9px;

      text-transform: uppercase;

      font-weight: 700;
    }

    .price {
      font-size: 32px;

      font-weight: 850;

      letter-spacing: -.045em;

      margin-top: 24px;
    }

    .source {
      color: var(--muted);

      font-size: 12px;

      margin-top: 2px;
    }

    .wallet-status {
      margin-top: 18px;

      font-weight: 700;

      color: var(--green);

      font-size: 13px;
    }

    .wallet-meta {
      display: flex;

      gap: 18px;

      flex-wrap: wrap;

      margin-top: 19px;
            flex-wrap: wrap;

      margin-top: 19px;
    }

    .wallet-meta-item {
      color: var(--muted);

      font-size: 12px;
    }

    .wallet-meta-item strong {
      color: var(--text);

      display: block;

      font-size: 13px;

      margin-bottom: 1px;
    }

    .market-price {
      margin-top: 7px;

      color: var(--muted);

      font-size: 13px;
    }

    .market-price strong {
      color: var(--text);
    }

    .wallet-actions {
      display: flex;

      gap: 10px;

      flex-wrap: wrap;

      margin-top: 23px;
    }

    .btn {
      display: inline-flex;

      align-items: center;
      justify-content: center;

      min-height: 44px;

      padding: 0 16px;

      border-radius: 11px;

      font-size: 13px;

      font-weight: 750;

      border: 1px solid var(--border);

      cursor: pointer;

      transition:
        transform .15s ease,
        background .15s ease,
        border-color .15s ease;
    }

    .btn:hover {
      transform: translateY(-1px);
    }

    .btn-primary {
      background: #111827;

      color: #fff;

      border-color: #111827;
    }

    .btn-primary:hover {
      background: #000;
    }

    .btn-trezor {
      background: #087f5b;

      color: #fff;

      border-color: #087f5b;
    }

    .btn-trezor:hover {
      background: #066b4d;

      border-color: #066b4d;
    }

    .btn-secondary {
      background: #fff;

      color: #334155;
    }

    .btn-secondary:hover {
      background: #f8fafc;
    }

    .btn-full {
      width: 100%;
    }

    /* HISTORY */

    .history-grid {
      display: grid;

      grid-template-columns:
        repeat(3, 1fr);

      gap: 14px;
    }

    .history-card {
      background: var(--card);

      border:
        1px solid var(--border);

      border-radius: 18px;

      padding: 22px;

      box-shadow: var(--shadow);
    }

    .history-card h3 {
      margin: 0;

      font-size: 18px;

      letter-spacing: -.025em;
    }

    .history-price {
      font-size: 27px;

      font-weight: 800;

      letter-spacing: -.04em;

      margin-top: 10px;
    }

    .history-details {
      display: grid;

      grid-template-columns:
        repeat(2, 1fr);

      gap: 10px;

      margin-top: 17px;
    }

    .history-detail {
      padding: 11px;

      background: var(--bg);

      border-radius: 11px;
    }

    .history-detail-label {
      color: var(--muted);

      font-size: 10px;

      text-transform: uppercase;

      font-weight: 750;

      letter-spacing: .05em;
    }

    .history-detail-value {
      margin-top: 3px;

      font-weight: 750;

      font-size: 14px;
    }

    /* CHART */

    .chart {
      height: 120px;

      display: flex;

      align-items: end;

      gap: 3px;

      margin-top: 20px;

      padding:
        12px 10px 0;

      border-radius: 12px;

      background: var(--bg);

      overflow: hidden;
    }

    .bar {
      flex: 1;

      min-width: 2px;

      background: #94a3b8;

      border-radius:
        3px 3px 0 0;
    }

    .chart-empty {
      margin-top: 18px;

      padding: 22px;

      border-radius: 13px;

      background: var(--bg);

      color: var(--muted);

      font-size: 13px;

      text-align: center;
    }

    /* ALERT */

    .alert-box {
      display: grid;

      grid-template-columns:
        minmax(0, 1fr)
        auto;

      gap: 20px;

      align-items: center;

      padding: 26px;

      background: #111827;

      color: #fff;

      border-radius: 20px;
    }

    .alert-box h3 {
      margin: 0;

      font-size: 23px;

      letter-spacing: -.03em;
    }

    .alert-box p {
      margin: 7px 0 0;

      color: #cbd5e1;

      font-size: 14px;
    }

    .alert-form {
      display: flex;

      gap: 8px;

      min-width: 360px;
    }

    .alert-form input {
      min-width: 0;
      flex: 1;

      border: 1px solid #334155;

      background: #fff;

      color: #111827;

      border-radius: 10px;

      padding: 12px 13px;

      outline: none;
    }

    .alert-form button {
      border: 0;

      border-radius: 10px;

      padding: 0 16px;

      background: #fff;

      color: #111827;

      font-weight: 750;

      cursor: pointer;
    }

    /* HOW IT WORKS */

    .steps {
      display: grid;

      grid-template-columns:
        repeat(3, 1fr);

      gap: 14px;
    }

    .step {
      background: var(--card);

      border:
        1px solid var(--border);

      border-radius: 18px;

      padding: 23px;

      box-shadow: var(--shadow);
    }

    .step-number {
      width: 34px;
      height: 34px;

      display: flex;

      align-items: center;
      justify-content: center;

      border-radius: 10px;

      background: #111827;

      color: #fff;

      font-weight: 800;

      font-size: 13px;
    }

    .step h3 {
      margin: 18px 0 7px;

      font-size: 17px;
    }

    .step p {
      margin: 0;

      color: var(--muted);

      font-size: 13px;
    }

    /* FOOTER */

    footer {
      border-top:
        1px solid var(--border);

      margin-top: 40px;

      padding: 30px 0 45px;

      color: var(--muted);

      font-size: 12px;
    }

    .footer-inner {
      display: flex;

      align-items: center;
      justify-content: space-between;

      gap: 20px;
    }

    .footer-links {
      display: flex;

      gap: 18px;

      flex-wrap: wrap;
    }

    /* RESPONSIVE */

    @media (max-width: 900px) {

      .hero-layout {
        grid-template-columns: 1fr;
      }

      .mini-stats {
        flex-direction: row;
        flex-wrap: wrap;
      }

      .mini-stat {
        flex: 1 1 150px;
      }

      .wallet-grid {
        grid-template-columns: 1fr;
      }

      .history-grid {
        grid-template-columns: 1fr;
      }

      .steps {
        grid-template-columns: 1fr;
      }

      .intelligence {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 680px) {

      .container {
        width:
          min(100% - 22px, 1120px);
      }

      .hero {
        padding: 48px 0 35px;
      }

      h1 {
        font-size: 45px;
      }

      .hero-text {
        font-size: 17px;
      }

      nav {
        gap: 12px;
      }

      nav a:nth-child(2) {
        display: none;
      }

      .stats {
        grid-template-columns: 1fr;
      }

      .wallet-card {
        padding: 17px;
      }

      .wallet-image {
        height: 200px;
      }

      .wallet-actions {
        flex-direction: column;
      }

      .wallet-actions .btn {
        width: 100%;
      }

      .alert-box {
        grid-template-columns: 1fr;
      }

      .alert-form {
        min-width: 0;

        flex-direction: column;
      }

      .alert-form button {
        min-height: 44px;
      }

      .footer-inner {
        flex-direction: column;

        align-items: flex-start;
      }
    }

  </style>

</head>

<body>

<header>

  <div class="container nav">

    <a
      class="brand"
      href="/"
    >
      CryptoWallet<span>Radar</span>
    </a>

    <nav>

      <a href="/">Home</a>

      <a href="/compare">Compare</a>

      <a href="/#history">Price history</a>

    </nav>

  </div>

</header>

<main>

${content}

</main>

<footer>

  <div class="container footer-inner">

    <div>
      © ${new Date().getFullYear()} CryptoWalletRadar
    </div>

    <div class="footer-links">

      <a href="/">Home</a>

      <a href="/compare">Compare</a>

      <a href="/sitemap.xml">Sitemap</a>

    </div>

  </div>

</footer>

</body>

</html>`;
}

/* -------------------------------------------------------
   WALLET CARD
------------------------------------------------------- */

function renderWalletCard(product) {

  const currentPrice = getCurrentPrice(product);

  const dealScore = getDealScore(product);

  const dealStatus = getDealStatus(product);

  const bestOffer = getBestOffer(product);

  const officialPrice =
    product.officialPrice !== undefined
      ? Number(product.officialPrice)
      : null;

  const marketPrice =
    Number.isFinite(currentPrice)
      ? currentPrice
      : null;

  const hasOfficialPrice =
    Number.isFinite(officialPrice) &&
    officialPrice > 0;

  const showMarketPrice =
    marketPrice !== null &&
    (!hasOfficialPrice ||
      marketPrice !== officialPrice);

  const trezorOfferId =
    TREZOR_OFFERS[product.slug];

  const image = product.image
    ? `
      <div class="wallet-image">
        <img
          src="${escapeHtml(product.image)}"
          alt="${escapeHtml(product.name)}"
          loading="lazy"
        >
      </div>
    `
    : "";

  return `
    <article class="wallet-card">

      ${image}

      <div class="wallet-top">

        <div>

          <div class="wallet-name">
            ${escapeHtml(product.name)}
          </div>

          <div class="wallet-brand">
            ${escapeHtml(product.brand || "")}
          </div>

        </div>

        ${
          dealScore !== null
            ? `
              <div class="score">

                <div class="score-number">
                  ${dealScore}
                </div>

                <div class="score-label">
                  Deal Score
                </div>

              </div>
            `
            : ""
        }

      </div>

      ${
        hasOfficialPrice
          ? `
            <div class="price">
              ${formatPrice(
                officialPrice,
                product.currency || "CZK"
              )}
            </div>

            <div class="source">
              Official Trezor price
            </div>
          `
          : `
            <div class="price">
              ${
                marketPrice !== null
                  ? formatPrice(
                      marketPrice,
                      product.currency || "CZK"
                    )
                  : "Price unavailable"
              }
            </div>

            <div class="source">
              Current tracked price
            </div>
          `
      }

      ${
        showMarketPrice
          ? `
            <div class="market-price">
              Market price:
              <strong>
                ${formatPrice(
                  marketPrice,
                  product.currency || "CZK"
                )}
              </strong>
            </div>
          `
          : ""
      }

      <div class="wallet-status">
        ${escapeHtml(dealStatus)}
      </div>

      <div class="wallet-meta">

        ${
          bestOffer
            ? `
              <div class="wallet-meta-item">
                <strong>
                  ${escapeHtml(
                    bestOffer.retailer ||
                      bestOffer.store ||
                      "Tracked seller"
                  )}
                </strong>
                Current offer
              </div>
            `
            : ""
        }

        ${
          getLowestPrice(product) !== null
            ? `
              <div class="wallet-meta-item">
                <strong>
                  ${formatPrice(
                    getLowestPrice(product),
                    product.currency || "CZK"
                  )}
                </strong>
                Lowest tracked
              </div>
            `
            : ""
        }

      </div>

      <div class="wallet-actions">

        ${
          trezorOfferId
            ? `
              <a
                class="btn btn-trezor"
                href="/go/${encodeURIComponent(
                  product.slug
                )}"
              >
                Buy at Trezor
              </a>
            `
            : ""
        }

        <a
          class="btn ${
            trezorOfferId
              ? "btn-secondary"
              : "btn-primary"
          }"
          href="/${encodeURIComponent(
            product.slug
          )}"
        >
          View price &amp; history
        </a>

      </div>

    </article>
  `;
}
/* -------------------------------------------------------
   HOME
------------------------------------------------------- */

function renderHome() {

  const trezorProducts = products.filter(
    (product) =>
      String(product.brand || "").toLowerCase() ===
      "trezor"
  );

  const totalWallets = trezorProducts.length;

  const totalDataPoints = trezorProducts.reduce(
    (sum, product) =>
      sum + getPriceHistory(product).length,
    0
  );

  const bestDealProduct = trezorProducts
    .map((product) => ({
      product,
      score: getDealScore(product),
    }))
    .filter((item) => item.score !== null)
    .sort((a, b) => b.score - a.score)[0];

  const bestDeal = bestDealProduct
    ? bestDealProduct.product
    : null;

  return pageTemplate({

    title:
      "CryptoWalletRadar — Trezor Hardware Wallet Price Tracker",

    description:
      "Track Trezor hardware wallet prices, compare current offers, view price history and find out when a hardware wallet is a good deal.",

    canonical:
      `${BASE_URL}/`,

    content: `

      <section class="hero">

        <div class="container hero-layout">

          <div class="hero-main">

            <div class="badge">
              <span class="badge-dot"></span>
              Trezor price radar
            </div>

            <h1>
              Know the price.
              <br>
              Know when to buy.
            </h1>

            <p class="hero-text">
              CryptoWalletRadar tracks Trezor hardware wallet
              prices and history so you can see what is worth
              buying now — and what is worth waiting for.
            </p>

            <div class="search">

              <input
                id="walletSearch"
                type="search"
                placeholder="Search Trezor Safe 3, Safe 5, Safe 7..."
                autocomplete="off"
              >

            </div>

          </div>

          <aside class="mini-stats">

            <div class="mini-stat">

              <strong>
                ${totalWallets}
              </strong>

              <span>
                Wallets<br>
                tracked
              </span>

            </div>

            <div class="mini-stat">

              <strong>
                ${totalDataPoints}
              </strong>

              <span>
                Price data<br>
                points
              </span>

            </div>

            <div class="mini-stat">

              <strong>
                Trezor
              </strong>

              <span>
                Official<br>
                prices
              </span>

            </div>

          </aside>

        </div>

      </section>


      <!-- TREZOR PRODUCTS -->

      <section class="section">

        <div class="container">

          <div class="section-header">

            <div>

              <h2>
                Trezor hardware wallets
              </h2>

              <p class="section-subtitle">
                Current official prices, market prices and
                price history.
              </p>

            </div>

          </div>

          <div
            class="wallet-grid"
            id="walletGrid"
          >

            ${trezorProducts
              .map(renderWalletCard)
              .join("")}

          </div>

        </div>

      </section>


      <!-- RADAR INTELLIGENCE -->

      <section class="section">

        <div class="container">

          <div class="section-header">

            <div>

              <h2>
                Radar intelligence
              </h2>

              <p class="section-subtitle">
                A quick view of where the current Trezor
                prices stand.
              </p>

            </div>

          </div>

          <div class="intelligence">

            <div class="intel-card">

              <div class="intel-label">
                Best deal
              </div>

              <div class="intel-value">

                ${
                  bestDeal
                    ? escapeHtml(bestDeal.name)
                    : "Building price history"
                }

              </div>

              <p class="section-subtitle">

                ${
                  bestDeal
                    ? `${getDealScore(bestDeal)}/100 Deal Score`
                    : "We need more historical data before calculating a reliable Deal Score."
                }

              </p>

            </div>


            <div class="intel-card">

              <div class="intel-label">
                Official store
              </div>

              <div class="intel-value">
                Trezor
              </div>

              <p class="section-subtitle">
                Official Trezor prices are shown directly
                on the product cards.
              </p>

            </div>

          </div>

        </div>

      </section>


      <!-- PRICE HISTORY -->

      <section
        class="section"
        id="history"
      >

        <div class="container">

          <div class="section-header">

            <div>

              <h2>
                Price history
              </h2>

              <p class="section-subtitle">
                See how tracked Trezor prices have changed
                over time.
              </p>

            </div>

          </div>

          <div class="history-grid">

            ${trezorProducts
              .map((product) => {

                const current =
                  getCurrentPrice(product);

                const lowest =
                  getLowestPrice(product);

                const highest =
                  getHighestPrice(product);

                return `

                  <article class="history-card">

                    <h3>
                      ${escapeHtml(product.name)}
                    </h3>

                    <div class="history-price">

                      ${
                        Number.isFinite(
                          current
                        )
                          ? formatPrice(
                              current,
                              product.currency ||
                                "CZK"
                            )
                          : "Price unavailable"
                      }

                    </div>

                    <div class="history-details">

                      <div class="history-detail">

                        <div class="history-detail-label">
                          Lowest
                        </div>

                        <div class="history-detail-value">

                          ${
                            lowest !== null
                              ? formatPrice(
                                  lowest,
                                  product.currency ||
                                    "CZK"
                                )
                              : "—"
                          }

                        </div>

                      </div>

                      <div class="history-detail">

                        <div class="history-detail-label">
                          Highest
                        </div>

                        <div class="history-detail-value">

                          ${
                            highest !== null
                              ? formatPrice(
                                  highest,
                                  product.currency ||
                                    "CZK"
                                )
                              : "—"
                          }

                        </div>

                      </div>

                    </div>

                    ${buildChart(product)}

                  </article>

                `;

              })
              .join("")}

          </div>

        </div>

      </section>


      <!-- ALERTS -->

      <section class="section">

        <div class="container">

          <div class="alert-box">

            <div>

              <h3>
                Waiting for a better price?
              </h3>

              <p>
                Price alerts are coming soon.
                Tell us what price would make you buy.
              </p>

            </div>

            <form
              class="alert-form"
              onsubmit="return false;"
            >

              <input
                type="email"
                placeholder="Your email"
                aria-label="Email address"
              >

              <button type="submit">
                Coming soon
              </button>

            </form>

          </div>

        </div>

      </section>


      <!-- HOW IT WORKS -->

      <section class="section">

        <div class="container">

          <div class="section-header">

            <div>

              <h2>
                How CryptoWalletRadar works
              </h2>

              <p class="section-subtitle">
                Simple information before you spend your money.
              </p>

            </div>

          </div>

          <div class="steps">

            <article class="step">

              <div class="step-number">
                1
              </div>

              <h3>
                Check the current price
              </h3>

              <p>
                See the official Trezor price together with
                tracked market offers where available.
              </p>

            </article>


            <article class="step">

              <div class="step-number">
                2
              </div>

              <h3>
                Check the history
              </h3>

              <p>
                Compare today's price with the prices we have
                collected over time.
              </p>

            </article>


            <article class="step">

              <div class="step-number">
                3
              </div>

              <h3>
                Decide when to buy
              </h3>

              <p>
                Use the radar and Deal Score to decide whether
                the current price looks attractive.
              </p>

            </article>

          </div>

        </div>

      </section>


      <script>

        const searchInput =
          document.getElementById("walletSearch");

        const walletGrid =
          document.getElementById("walletGrid");

        if (searchInput && walletGrid) {

          searchInput.addEventListener(
            "input",
            function () {

              const query =
                this.value
                  .trim()
                  .toLowerCase();

              const cards =
                walletGrid.querySelectorAll(
                  ".wallet-card"
                );

              cards.forEach((card) => {

                const text =
                  card.textContent
                    .toLowerCase();

                card.style.display =
                  !query ||
                  text.includes(query)
                    ? ""
                    : "none";

              });

            }
          );

        }

      </script>

    `,

  });

}


/* -------------------------------------------------------
   COMPARE
------------------------------------------------------- */

function renderCompare() {

  const trezorProducts =
    products.filter(
      (product) =>
        String(product.brand || "").toLowerCase() ===
        "trezor"
    );

  return pageTemplate({

    title:
      "Compare Trezor Hardware Wallets — CryptoWalletRadar",

    description:
      "Compare Trezor Safe 3, Safe 5 and Safe 7 prices, current offers and price history.",

    canonical:
      `${BASE_URL}/compare`,

    content: `

      <section class="hero">

        <div class="container">

          <div class="badge">
            Trezor comparison
          </div>

          <h1>
            Compare Trezor wallets.
          </h1>

          <p class="hero-text">
            Compare current official Trezor prices and
            tracked market prices in one place.
          </p>

        </div>

      </section>


      <section class="section">

        <div class="container">

          <div class="wallet-grid">

            ${trezorProducts
              .map(renderWalletCard)
              .join("")}

          </div>

        </div>

      </section>

    `,

  });

}


/* -------------------------------------------------------
   PRODUCT PAGE
------------------------------------------------------- */

function renderProduct(product) {

  const currentPrice =
    getCurrentPrice(product);

  const lowestPrice =
    getLowestPrice(product);

  const highestPrice =
    getHighestPrice(product);

  const dealScore =
    getDealScore(product);

  const trezorOfferId =
    TREZOR_OFFERS[product.slug];

  const officialPrice =
    Number.isFinite(
      Number(product.officialPrice)
    )
      ? Number(product.officialPrice)
      : null;

  const productSchema = {

    "@context":
      "https://schema.org",

    "@type":
      "Product",

    name:
      product.name,

    brand: {
      "@type":
        "Brand",

      name:
        product.brand || "Trezor",
    },

    offers: {

      "@type":
        "Offer",

      price:
        officialPrice !== null
          ? officialPrice
          : currentPrice,

      priceCurrency:
        product.currency || "CZK",

      availability:
        "https://schema.org/InStock",

      url:
        `${BASE_URL}/${product.slug}`,

    },

  };

  const image =
    product.image
      ? `
        <div class="wallet-image">

          <img
            src="${escapeHtml(product.image)}"
            alt="${escapeHtml(product.name)}"
          >

        </div>
      `
      : "";

  return pageTemplate({

    title:
      `${product.name} Price & History — CryptoWalletRadar`,

    description:
      `Track the current price and price history of ${product.name}. Compare official Trezor pricing with tracked market offers.`,

    canonical:
      `${BASE_URL}/${product.slug}`,

    productSchema,

    content: `

      <section class="hero">

        <div class="container">

          <div class="badge">
            ${escapeHtml(
              product.brand || "Hardware wallet"
            )}
          </div>

          <h1>
            ${escapeHtml(product.name)}
          </h1>

          <p class="hero-text">
            Track the current price, historical range and
            Deal Score for this hardware wallet.
          </p>

        </div>

      </section>


      <section class="section">

        <div class="container">

          <article class="wallet-card">

            ${image}

            <div class="wallet-top">

              <div>

                <div class="wallet-name">
                  ${escapeHtml(product.name)}
                </div>

                <div class="wallet-brand">
                  ${escapeHtml(
                    product.brand || ""
                  )}
                </div>

              </div>

              ${
                dealScore !== null
                  ? `
                    <div class="score">

                      <div class="score-number">
                        ${dealScore}
                      </div>

                      <div class="score-label">
                        Deal Score
                      </div>

                    </div>
                  `
                  : ""
              }

            </div>


            <div class="price">

              ${
                officialPrice !== null
                  ? formatPrice(
                      officialPrice,
                      product.currency ||
                        "CZK"
                    )
                  : currentPrice !== null
                    ? formatPrice(
                        currentPrice,
                        product.currency ||
                          "CZK"
                      )
                    : "Price unavailable"
              }

            </div>

            <div class="source">

              ${
                officialPrice !== null
                  ? "Official Trezor price"
                  : "Current tracked price"
              }

            </div>


            ${
              officialPrice !== null &&
              currentPrice !== null &&
              officialPrice !== currentPrice
                ? `
                  <div class="market-price">

                    Market price:
                    <strong>
                      ${formatPrice(
                        currentPrice,
                        product.currency ||
                          "CZK"
                      )}
                    </strong>

                  </div>
                `
                : ""
            }


            <div class="wallet-status">
              ${escapeHtml(
                getDealStatus(product)
              )}
            </div>


            <div class="history-details">

              <div class="history-detail">

                <div class="history-detail-label">
                  Lowest tracked
                </div>

                <div class="history-detail-value">

                  ${
                    lowestPrice !== null
                      ? formatPrice(
                          lowestPrice,
                          product.currency ||
                            "CZK"
                        )
                      : "—"
                  }

                </div>

              </div>


              <div class="history-detail">

                <div class="history-detail-label">
                  Highest tracked
                </div>

                <div class="history-detail-value">

                  ${
                    highestPrice !== null
                      ? formatPrice(
                          highestPrice,
                          product.currency ||
                            "CZK"
                        )
                      : "—"
                  }

                </div>

              </div>

            </div>


            ${buildChart(product)}


            <div class="wallet-actions">

              ${
                trezorOfferId
                  ? `
                    <a
                      class="btn btn-trezor"
                      href="/go/${encodeURIComponent(
                        product.slug
                      )}"
                    >
                      Buy at Trezor
                    </a>
                  `
                  : ""
              }

            </div>

          </article>

        </div>

      </section>

    `,

  });

}
/* -------------------------------------------------------
   404
------------------------------------------------------- */

function render404() {

  return pageTemplate({

    title:
      "Page not found — CryptoWalletRadar",

    description:
      "The requested CryptoWalletRadar page could not be found.",

    canonical:
      `${BASE_URL}/404`,

    content: `

      <section class="hero">

        <div class="container">

          <div class="badge">
            404
          </div>

          <h1>
            Page not found.
          </h1>

          <p class="hero-text">
            The page you are looking for does not exist
            or may have moved.
          </p>

          <div class="wallet-actions">

            <a
              class="btn btn-primary"
              href="/"
            >
              Back to CryptoWalletRadar
            </a>

          </div>

        </div>

      </section>

    `,

  });

}


/* -------------------------------------------------------
   SITEMAP
------------------------------------------------------- */

function generateSitemap() {

  const trezorProducts =
    products.filter(
      (product) =>
        String(product.brand || "").toLowerCase() ===
        "trezor"
    );

  const urls = [

    `${BASE_URL}/`,

    `${BASE_URL}/compare`,

    ...trezorProducts.map(
      (product) =>
        `${BASE_URL}/${encodeURIComponent(
          product.slug
        )}`
    ),

  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
>
${urls
  .map(
    (url) => `
  <url>
    <loc>${escapeHtml(url)}</loc>
  </url>
`
  )
  .join("")}
</urlset>`;
}


/* -------------------------------------------------------
   REQUEST HANDLER
------------------------------------------------------- */

const server = http.createServer(
  async (req, res) => {

    try {

      const requestUrl =
        new URL(
          req.url,
          BASE_URL
        );

      const pathname =
        requestUrl.pathname;

      /* -----------------------------------------------
   STATIC PRODUCT IMAGES
----------------------------------------------- */

if (
  pathname === "/trezor-safe-3.avif" ||
  pathname === "/trezor-safe-5.avif" ||
  pathname === "/trezor-safe-7.avif"
) {
  const filename = pathname.slice(1);
  const filePath = path.join(__dirname, filename);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
    });

    res.end("Image not found");
    return;
  }

  res.writeHead(200, {
    "Content-Type": "image/avif",
    "Cache-Control": "public, max-age=31536000, immutable",
  });

  res.end(fs.readFileSync(filePath));
  return;
}

      /* -----------------------------------------------
   STATIC PRODUCT IMAGES
----------------------------------------------- */

if (
  pathname === "/trezor-safe-3.avif" ||
  pathname === "/trezor-safe-5.avif" ||
  pathname === "/trezor-safe-7.avif"
) {
  const filename = pathname.slice(1);
  const filePath = path.join(__dirname, filename);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
    });

    res.end("Image not found");
    return;
  }

  res.writeHead(200, {
    "Content-Type": "image/avif",
    "Cache-Control": "public, max-age=31536000, immutable",
  });

  res.end(fs.readFileSync(filePath));
  return;
}


      /* -----------------------------------------------
         SITEMAP
      ----------------------------------------------- */

      if (pathname === "/sitemap.xml") {

        res.writeHead(
          200,
          {
            "Content-Type":
              "application/xml; charset=utf-8",
          }
        );

        res.end(
          generateSitemap()
        );

        return;
      }


      /* -----------------------------------------------
         ROBOTS
      ----------------------------------------------- */

      if (pathname === "/robots.txt") {

        res.writeHead(
          200,
          {
            "Content-Type":
              "text/plain; charset=utf-8",
          }
        );

        res.end(
          `User-agent: *
Allow: /

Sitemap: ${BASE_URL}/sitemap.xml
`
        );

        return;
      }


      /* -----------------------------------------------
         Trezor AFFILIATE REDIRECT
      ----------------------------------------------- */

      if (
        pathname.startsWith("/go/")
      ) {

        const slug =
          decodeURIComponent(
            pathname.substring(4)
          );

        const offerId =
          TREZOR_OFFERS[slug];

        if (!offerId) {

          res.writeHead(
            404,
            {
              "Content-Type":
                "text/plain; charset=utf-8",
            }
          );

          res.end(
            "Affiliate offer not found"
          );

          return;
        }

        try {

          const trackingUrl =
            await generateTrezorTrackingLink(
              offerId,
              "walletradar"
            );

          res.writeHead(
            302,
            {
              Location:
                trackingUrl,
            }
          );

          res.end();

          return;

        } catch (error) {

          console.error(
            "Trezor tracking link error:",
            error
          );

          res.writeHead(
            502,
            {
              "Content-Type":
                "text/plain; charset=utf-8",
            }
          );

          res.end(
            "Unable to generate affiliate link"
          );

          return;
        }

      }


      /* -----------------------------------------------
         HOME
      ----------------------------------------------- */

      if (
        pathname === "/" ||
        pathname === ""
      ) {

        res.writeHead(
          200,
          {
            "Content-Type":
              "text/html; charset=utf-8",
          }
        );

        res.end(
          renderHome()
        );

        return;
      }


      /* -----------------------------------------------
         COMPARE
      ----------------------------------------------- */

      if (
        pathname === "/compare"
      ) {

        res.writeHead(
          200,
          {
            "Content-Type":
              "text/html; charset=utf-8",
          }
        );

        res.end(
          renderCompare()
        );

        return;
      }


      /* -----------------------------------------------
         PRODUCT PAGE
      ----------------------------------------------- */

      const slug =
        decodeURIComponent(
          pathname.replace(
            /^\/+/,
            ""
          )
        );

      const product =
        getProduct(slug);

      if (product) {

        res.writeHead(
          200,
          {
            "Content-Type":
              "text/html; charset=utf-8",
          }
        );

        res.end(
          renderProduct(product)
        );

        return;
      }


      /* -----------------------------------------------
         404
      ----------------------------------------------- */

      res.writeHead(
        404,
        {
          "Content-Type":
            "text/html; charset=utf-8",
        }
      );

      res.end(
        render404()
      );

    } catch (error) {

      console.error(
        "Server error:",
        error
      );

      res.writeHead(
        500,
        {
          "Content-Type":
            "text/plain; charset=utf-8",
        }
      );

      res.end(
        "Internal server error"
      );

    }

  }
);


/* -------------------------------------------------------
   START SERVER
------------------------------------------------------- */

server.listen(
  PORT,
  () => {

    console.log(
      `CryptoWalletRadar running on port ${PORT}`
    );

  }
);
