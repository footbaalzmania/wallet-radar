const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const BASE_URL =
  process.env.BASE_URL ||
  "https://serene-transformation-production-ab45.up.railway.app";

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

      padding-top: 17px;

      border-top:
        1px solid var(--border);

      color: var(--muted);

      font-size: 12px;
    }

    /* CHART */

    .chart {
      height: 72px;

      margin-top: 18px;

      border-bottom:
        1px solid var(--border);

      display: flex;

      align-items: end;

      gap: 4px;

      overflow: hidden;
    }

    .bar {
      flex: 1;

      min-width: 4px;

      background: #cbd5e1;

      border-radius:
        4px 4px 0 0;
    }

    .chart-empty {
      margin-top: 18px;

      padding: 18px;

      border:
        1px dashed var(--border);

      border-radius: 12px;

      color: var(--muted);

      font-size: 12px;

      text-align: center;
    }

    /* BUTTON */

    .button {
      display: inline-flex;

      align-items: center;
      justify-content: center;

      width: 100%;

      margin-top: 20px;

      padding: 13px 16px;

      border-radius: 12px;

      background: #111827;

      color: white;

      font-weight: 750;

      font-size: 14px;

      transition:
        transform .15s ease,
        opacity .15s ease;
    }

    .button:hover {
      transform: translateY(-1px);

      opacity: .92;
    }

    .button.secondary {
      background: #fff;

      color: #111827;

      border:
        1px solid var(--border);
    }

    /* ALERT */

    .alert-box {
      background: var(--card);

      border:
        1px solid var(--border);

      border-radius: 20px;

      padding: 30px;

      box-shadow: var(--shadow);

      text-align: center;
    }

    .alert-box h3 {
      margin: 0 0 8px;

      font-size: 24px;
    }

    .alert-box p {
      margin: 0 auto;

      max-width: 650px;

      color: var(--muted);
    }

    /* HOW */

    .how-grid {
      display: grid;

      grid-template-columns:
        repeat(3, 1fr);

      gap: 14px;
    }

    .how-card {
      padding: 23px;

      background: var(--card);

      border:
        1px solid var(--border);

      border-radius: 18px;
    }

    .how-number {
      font-size: 12px;

      font-weight: 800;

      color: var(--muted);
    }

    .how-card h3 {
      margin: 10px 0 7px;

      font-size: 18px;
    }

    .how-card p {
      margin: 0;

      color: var(--muted);

      font-size: 14px;
    }

    /* PRODUCT PAGE */

    .breadcrumbs {
      margin-top: 32px;

      color: var(--muted);

      font-size: 13px;
    }

    .product-page {
      padding: 55px 0 80px;
    }

    .product-hero {
      display: grid;

      grid-template-columns:
        1.15fr .85fr;

      gap: 22px;

      align-items: stretch;
    }

    .product-main,
    .product-buy {
      background: var(--card);

      border:
        1px solid var(--border);

      border-radius: 22px;

      padding: 30px;

      box-shadow: var(--shadow);
    }

    .product-image {
      width: 100%;

      height: 390px;

      display: flex;

      align-items: center;
      justify-content: center;

      background:
        linear-gradient(
          180deg,
          #f8fafc 0%,
          #eef2f7 100%
        );

      border-radius: 17px;

      overflow: hidden;

      margin-bottom: 28px;
    }

    .product-image img {
      max-width: 90%;
      max-height: 350px;

      object-fit: contain;

      display: block;
    }

    .product-main h1 {
      font-size:
        clamp(38px, 5vw, 58px);

      margin: 12px 0;
    }

    .product-description {
      color: var(--muted);

      font-size: 17px;

      max-width: 650px;
    }

    .buy-label {
      color: var(--muted);

      font-size: 12px;

      text-transform: uppercase;

      font-weight: 800;

      letter-spacing: .08em;
    }

    .buy-price {
      font-size: 42px;

      font-weight: 850;

      letter-spacing: -.05em;

      margin-top: 8px;
    }

    .buy-note {
      color: var(--muted);

      font-size: 12px;

      margin-top: 6px;
    }

    /* FOOTER */

    footer {
      border-top:
        1px solid var(--border);

      padding: 30px 0 45px;

      color: var(--muted);

      font-size: 12px;
    }

    footer p {
      margin: 5px 0;
    }

    .no-results {
      display: none;

      color: var(--muted);

      padding: 20px 0;
    }

    /* DARK */

    html.dark {
      color-scheme: dark;

      --bg: #09090b;
      --card: #111113;
      --text: #f4f4f5;
      --muted: #a1a1aa;
      --border: #27272a;
      --accent: #f4f4f5;
      --accent-soft: #18181b;
      --green: #34d399;
    }

    html.dark header {
      background:
        rgba(9, 9, 11, .88);
    }

    html.dark .badge,
    html.dark .search input,
    html.dark .theme-switcher,
    html.dark .button.secondary {
      background: #111113;

      color: var(--text);
    }

    html.dark .theme-switcher button.active {
      background: #f4f4f5;

      color: #09090b;
    }

    html.dark .button {
      background: #f4f4f5;

      color: #09090b;
    }

    html.dark .wallet-image,
    html.dark .product-image {
      background:
        linear-gradient(
          180deg,
          #18181b 0%,
          #111113 100%
        );
    }

    html.system-dark {
      color-scheme: dark;
    }

    @media (prefers-color-scheme: dark) {

      html.system-dark {
        --bg: #09090b;
        --card: #111113;
        --text: #f4f4f5;
        --muted: #a1a1aa;
        --border: #27272a;
        --accent-soft: #18181b;
        --green: #34d399;
      }

      html.system-dark header {
        background:
          rgba(9, 9, 11, .88);
      }

      html.system-dark .badge,
      html.system-dark .search input,
      html.system-dark .theme-switcher,
      html.system-dark .button.secondary {
        background: #111113;

        color: var(--text);
      }

      html.system-dark .button {
        background: #f4f4f5;

        color: #09090b;
      }

      html.system-dark .wallet-image,
      html.system-dark .product-image {
        background:
          linear-gradient(
            180deg,
            #18181b 0%,
            #111113 100%
          );
      }
    }

    /* MOBILE */

    @media (max-width: 800px) {

      nav {
        display: none;
      }

      .stats,
      .intelligence,
      .wallet-grid,
      .how-grid,
      .product-hero {
        grid-template-columns: 1fr;
      }

      .hero {
        padding-top: 55px;
      }

      h1 {
        font-size: 48px;
      }

      .wallet-image {
        height: 250px;
      }

      .product-image {
        height: 300px;
      }

      .product-image img {
        max-height: 270px;
      }
    }

  </style>
</head>

<body>

<header>

  <div class="container nav">

    <a href="/" class="brand">
      Wallet<span>Radar</span>
    </a>

    <nav>
      <a href="/">Wallets</a>
      <a href="/compare">Compare</a>
      <a href="/#history">Price History</a>
      <a href="/#alerts">Alerts</a>
    </nav>

    <div
      class="theme-switcher"
      aria-label="Theme"
    >
      <button data-theme="light">
        Light
      </button>

      <button data-theme="system">
        System
      </button>

      <button data-theme="dark">
        Dark
      </button>
    </div>

  </div>

</header>

${content}

<footer>

  <div class="container">

    <p>
      <strong>WalletRadar</strong>
      — hardware wallet price radar.
    </p>

    <p>
      Prices are tracked from available retail sources
      and may differ from affiliate purchase destinations.
    </p>

    <p>
      WalletRadar may earn a commission when you purchase
      through selected affiliate links.
      This does not change the price you pay.
    </p>

  </div>

</footer>

<script>

(function () {

  const root =
    document.documentElement;

  const buttons =
    document.querySelectorAll(
      "[data-theme]"
    );

  function applyTheme(theme) {

    root.classList.remove(
      "dark",
      "system-dark"
    );

    if (theme === "dark") {
      root.classList.add("dark");
    }

    if (theme === "system") {
      root.classList.add("system-dark");
    }

    localStorage.setItem(
      "wallet-radar-theme",
      theme
    );

    buttons.forEach((button) => {

      button.classList.toggle(
        "active",
        button.dataset.theme === theme
      );

    });

  }

  const saved =
    localStorage.getItem(
      "wallet-radar-theme"
    ) || "light";

  applyTheme(saved);

  buttons.forEach((button) => {

    button.addEventListener(
      "click",
      () => {
        applyTheme(
          button.dataset.theme
        );
      }
    );

  });

})();

</script>

</body>
</html>`;
}

/* -------------------------------------------------------
   WALLET CARD
------------------------------------------------------- */

function renderWalletCard(product) {

  const currentPrice =
    getCurrentPrice(product);

  const lowest =
    getLowestPrice(product);

  const score =
    getDealScore(product);

  const history =
    getPriceHistory(product);

  const image =
    product.image
      ? `
        <div class="wallet-image">
          <img
            src="${escapeHtml(product.image)}"
            alt="${escapeHtml(
              `${product.brand || ""} ${product.name} hardware wallet`
            )}"
            loading="lazy"
          >
        </div>
      `
      : "";

  const source =
    getBestOffer(product)?.store ||
    "Tracked retailer";

  return `
    <article
      class="wallet-card"
      data-search="${escapeHtml(
        `${product.brand || ""} ${product.name} ${product.slug}`
      ).toLowerCase()}"
    >

      ${image}

      <div class="wallet-top">

        <div>

          <div class="wallet-name">
            ${escapeHtml(product.brand || "")}
            ${escapeHtml(product.name)}
          </div>

          <div class="wallet-brand">
            Hardware wallet
          </div>

        </div>

        <div class="score">

          <div class="score-number">
            ${score === null ? "—" : score}
          </div>

          <div class="score-label">
            Deal Score
          </div>

        </div>

      </div>

      <div class="price">
        ${formatPrice(
          currentPrice,
          product.currency
        )}
      </div>

      <div class="source">
        Source:
        ${escapeHtml(source)}
      </div>

      <div class="wallet-status">
        ${escapeHtml(
          getDealStatus(product)
        )}
      </div>

      ${buildChart(product)}

      <div class="wallet-meta">

        <span>
          Lowest recorded:
          <strong>
            ${
              lowest === null
                ? "—"
                : formatPrice(
                    lowest,
                    product.currency
                  )
            }
          </strong>
        </span>

        <span>
          ${history.length}
          price data point${
            history.length === 1
              ? ""
              : "s"
          }
        </span>

      </div>

      <a
        class="button"
        href="/${escapeHtml(product.slug)}"
      >
        View price & history
      </a>

    </article>
  `;
}

/* -------------------------------------------------------
   HOMEPAGE
------------------------------------------------------- */

function renderHome() {

  const tracked =
    products.length;

  const dataPoints =
    products.reduce(
      (sum, product) =>
        sum +
        getPriceHistory(product).length,
      0
    );

  const purchaseDestinations =
    products.filter(
      (product) =>
        Array.isArray(product.offers) &&
        product.offers.some(
          (offer) =>
            offer.url ||
            offer.affiliateUrl
        )
    ).length;

  let bestDeal = null;

  for (const product of products) {

    const score =
      getDealScore(product);

    if (
      score !== null &&
      (!bestDeal ||
        score > bestDeal.score)
    ) {
      bestDeal = {
        product,
        score,
      };
    }
  }

  const bestDealHtml =
    bestDeal
      ? `
        <div class="intel-card">

          <div class="intel-label">
            Best deal right now
          </div>

          <div class="intel-value">
            ${escapeHtml(
              bestDeal.product.brand || ""
            )}
            ${escapeHtml(
              bestDeal.product.name
            )}
            · ${bestDeal.score}/100
          </div>

        </div>
      `
      : `
        <div class="intel-card">

          <div class="intel-label">
            Best deal right now
          </div>

          <div class="intel-value">
            Building price history
          </div>

        </div>
      `;

  const content = `
<main>

  <section class="hero">

    <div class="container">

      <div class="badge">

        <span class="badge-dot"></span>

        Live hardware wallet price radar

      </div>

      <h1>
        Find the right wallet
        at the right price.
      </h1>

      <p class="hero-text">
        WalletRadar tracks hardware wallet prices,
        price history and deal signals so you can
        decide what to buy and whether now is the
        right time to buy it.
      </p>

      <div class="search">

        <input
          id="walletSearch"
          type="search"
          placeholder="Search Trezor, Ledger, Safe 5..."
          autocomplete="off"
        >

      </div>

      <div class="stats">

        <div class="stat">

          <div class="stat-number">
            ${tracked}
          </div>

          <div class="stat-label">
            Wallets tracked
          </div>

        </div>

        <div class="stat">

          <div class="stat-number">
            ${dataPoints}
          </div>

          <div class="stat-label">
            Price data points
          </div>

        </div>

        <div class="stat">

          <div class="stat-number">
            ${purchaseDestinations}
          </div>

          <div class="stat-label">
            Purchase destinations
          </div>

        </div>

      </div>

    </div>

  </section>

  <section class="section">

    <div class="container">

      <div class="intelligence">

        ${bestDealHtml}

        <div class="intel-card">

          <div class="intel-label">
            Radar status
          </div>

          <div class="intel-value">
            ${
              dataPoints > 0
                ? "Price tracking active"
                : "Data collection starting"
            }
          </div>

        </div>

      </div>

      <div class="section-header">

        <div>

          <h2>
            Hardware wallets
          </h2>

          <p class="section-subtitle">
            Compare current prices and see how
            today's price compares with history.
          </p>

        </div>

      </div>

      <div
        class="wallet-grid"
        id="walletGrid"
      >
        ${products
          .map(renderWalletCard)
          .join("")}
      </div>

      <div
        class="no-results"
        id="noResults"
      >
        No wallets matched your search.
      </div>

    </div>

  </section>

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
            A current price only tells part
            of the story.
          </p>

        </div>

      </div>

      <div class="alert-box">

        <h3>
          Know whether today's price
          is actually good.
        </h3>

        <p>
          WalletRadar builds a historical
          price record for each wallet and
          turns it into a simple Deal Score.
          More history means better signals.
        </p>

      </div>

    </div>

  </section>

  <section
    class="section"
    id="alerts"
  >

    <div class="container">

      <div class="section-header">

        <div>

          <h2>
            Price alerts
          </h2>

          <p class="section-subtitle">
            Get notified when the wallet you
            want reaches your target price.
          </p>

        </div>

      </div>

      <div class="alert-box">

        <h3>
          Price alerts are coming next.
        </h3>

        <p>
          Set a target price for a wallet
          and let WalletRadar watch the
          market for you.
        </p>

        <a
          class="button secondary"
          href="/#alerts"
        >
          Coming soon
        </a>

      </div>

    </div>

  </section>

  <section class="section">

    <div class="container">

      <div class="section-header">

        <div>

          <h2>
            How WalletRadar works
          </h2>

          <p class="section-subtitle">
            Three simple steps before you buy.
          </p>

        </div>

      </div>

      <div class="how-grid">

        <div class="how-card">

          <div class="how-number">
            01
          </div>

          <h3>
            Find your wallet
          </h3>

          <p>
            Search the hardware wallets
            you are considering and compare
            their current prices.
          </p>

        </div>

        <div class="how-card">

          <div class="how-number">
            02
          </div>

          <h3>
            Check the price signal
          </h3>

          <p>
            Use price history and Deal Score
            to understand whether the current
            price is attractive.
          </p>

        </div>

        <div class="how-card">

          <div class="how-number">
            03
          </div>

          <h3>
            Buy with confidence
          </h3>

          <p>
            When the price looks right,
            follow the available purchase
            destination.
          </p>

        </div>

      </div>

    </div>

  </section>

</main>

<script>

(function () {

  const input =
    document.getElementById(
      "walletSearch"
    );

  const cards =
    Array.from(
      document.querySelectorAll(
        ".wallet-card"
      )
    );

  const noResults =
    document.getElementById(
      "noResults"
    );

  if (!input) {
    return;
  }

  input.addEventListener(
    "input",
    function () {

      const query =
        input.value
          .trim()
          .toLowerCase();

      let visible = 0;

      cards.forEach((card) => {

        const text =
          card.dataset.search || "";

        const match =
          !query ||
          text.includes(query);

        card.style.display =
          match
            ? ""
            : "none";

        if (match) {
          visible++;
        }

      });

      noResults.style.display =
        visible
          ? "none"
          : "block";

    }
  );

})();

</script>
`;

  return pageTemplate({

    title:
      "WalletRadar — Hardware Wallet Price Tracker & Comparison",

    description:
      "Compare hardware wallet prices, price history and deal signals. Find the right Trezor or Ledger wallet at the right price.",

    canonical:
      `${BASE_URL}/`,

    content,
  });
}

/* -------------------------------------------------------
   PRODUCT PAGE
------------------------------------------------------- */

function renderProduct(product) {

  const currentPrice =
    getCurrentPrice(product);

  const lowest =
    getLowestPrice(product);

  const highest =
    getHighestPrice(product);

  const score =
    getDealScore(product);

  const history =
    getPriceHistory(product);

  const bestOffer =
    getBestOffer(product);

  const image =
    product.image
      ? `
        <div class="product-image">

          <img
            src="${escapeHtml(product.image)}"
            alt="${escapeHtml(
              `${product.brand || ""} ${product.name} hardware wallet`
            )}"
            fetchpriority="high"
          >

        </div>
      `
      : "";

  const historyRows =
    history
      .slice()
      .reverse()
      .slice(0, 30)
      .map(
        (item) => `
          <div
            style="
              display:flex;
              justify-content:space-between;
              padding:10px 0;
              border-bottom:1px solid var(--border);
              font-size:13px;
            "
          >

            <span>
              ${escapeHtml(item.date)}
            </span>

            <strong>
              ${formatPrice(
                item.price,
                item.currency
              )}
            </strong>

          </div>
        `
      )
      .join("");

  const productSchema = {
    "@context":
      "https://schema.org",

    "@type":
      "Product",

    name:
      `${product.brand || ""} ${product.name}`.trim(),

    description:
      product.description ||
      `Current price and price history for ${product.brand || ""} ${product.name}.`,

    image:
      product.image
        ? [`${BASE_URL}${product.image}`]
        : undefined,

    brand: {
      "@type":
        "Brand",

      name:
        product.brand ||
        "Hardware Wallet",
    },

    offers:
      Number.isFinite(currentPrice)
        ? {
            "@type":
              "Offer",

            priceCurrency:
              product.currency ||
              "CZK",

            price:
              currentPrice,

            availability:
              "https://schema.org/InStock",

            url:
              `${BASE_URL}/${product.slug}`,
          }
        : undefined,
  };

  const content = `
<main class="product-page">

  <div class="container">

    <div class="breadcrumbs">

      <a href="/">
        WalletRadar
      </a>

      &nbsp; / &nbsp;

      ${escapeHtml(
        product.brand || "Wallet"
      )}

      &nbsp; / &nbsp;

      ${escapeHtml(product.name)}

    </div>

    <div
      class="product-hero"
      style="margin-top:20px;"
    >

      <section class="product-main">

        ${image}

        <div class="badge">

          <span class="badge-dot"></span>

          Price radar

        </div>

        <h1>
          ${escapeHtml(
            product.brand || ""
          )}
          ${escapeHtml(product.name)}
        </h1>

        <p class="product-description">

          ${
            escapeHtml(
              product.description || ""
            ) ||
            `Track the current price and historical price movement for ${escapeHtml(
              product.brand || ""
            )} ${escapeHtml(
              product.name
            )}.`
          }

        </p>

        <div class="wallet-meta">

          <span>
            Lowest recorded:
            <strong>
              ${
                lowest === null
                  ? "—"
                  : formatPrice(
                      lowest,
                      product.currency
                    )
              }
            </strong>
          </span>

          <span>
            Highest recorded:
            <strong>
              ${
                highest === null
                  ? "—"
                  : formatPrice(
                      highest,
                      product.currency
                    )
              }
            </strong>
          </span>

          <span>
            Deal Score:
            <strong>
              ${
                score === null
                  ? "—"
                  : `${score}/100`
              }
            </strong>
          </span>

        </div>

        ${buildChart(product)}

      </section>

      <aside class="product-buy">

        <div class="buy-label">
          Current tracked price
        </div>

        <div class="buy-price">

          ${formatPrice(
            currentPrice,
            product.currency
          )}

        </div>

        <div class="buy-note">

          ${
            bestOffer
              ? `Best tracked offer: ${escapeHtml(
                  bestOffer.store || "Retailer"
                )}`
              : "No retail offer available."
          }

        </div>

        ${
          bestOffer
            ? `
              <a
                class="button"
                href="${escapeHtml(
                  bestOffer.affiliateUrl ||
                    bestOffer.url ||
                    "#"
                )}"
              >
                Check purchase option
              </a>
            `
            : `
              <div
                class="button"
                style="opacity:.55;cursor:not-allowed;"
              >
                Purchase option unavailable
              </div>
            `
        }

        <a
          class="button secondary"
          href="/"
        >
          Back to all wallets
        </a>

      </aside>

    </div>

    <section
      class="section"
      style="padding-bottom:20px;"
    >

      <div class="section-header">

        <div>

          <h2>
            Price history
          </h2>

          <p class="section-subtitle">
            Historical observations collected
            by WalletRadar.
          </p>

        </div>

      </div>

      <div class="product-main">

        ${
          historyRows ||
          `
            <p class="section-subtitle">
              Price history is still being built.
            </p>
          `
        }

      </div>

    </section>

  </div>

</main>
`;

  return pageTemplate({

    title:
      `${product.brand || ""} ${product.name} Price & Price History | WalletRadar`,

    description:
      `Check the current ${product.brand || ""} ${product.name} price, historical prices and Deal Score. See whether ${product.name} is a good buy today.`,

    canonical:
      `${BASE_URL}/${product.slug}`,

    content,

    productSchema,
  });
}

/* -------------------------------------------------------
   COMPARE
------------------------------------------------------- */

function renderCompare() {

  const rows =
    products
      .map((product) => {

        const currentPrice =
          getCurrentPrice(product);

        const score =
          getDealScore(product);

        return `
          <article class="wallet-card">

            ${
              product.image
                ? `
                  <div class="wallet-image">

                    <img
                      src="${escapeHtml(
                        product.image
                      )}"
                      alt="${escapeHtml(
                        `${product.brand || ""} ${product.name} hardware wallet`
                      )}"
                      loading="lazy"
                    >

                  </div>
                `
                : ""
            }

            <div class="wallet-name">

              ${escapeHtml(
                product.brand || ""
              )}

              ${escapeHtml(
                product.name
              )}

            </div>

            <div class="wallet-brand">
              Hardware wallet
            </div>

            <div class="price">

              ${formatPrice(
                currentPrice,
                product.currency
              )}

            </div>

            <div class="wallet-status">

              ${
                score === null
                  ? "Building price history"
                  : `Deal Score ${score}/100`
              }

            </div>

            <a
              class="button"
              href="/${escapeHtml(
                product.slug
              )}"
            >
              View wallet
            </a>

          </article>
        `;

      })
      .join("");

  const content = `
<main class="product-page">

  <div class="container">

    <div class="breadcrumbs">

      <a href="/">
        WalletRadar
      </a>

      / Compare

    </div>

    <section
      style="
        padding:35px 0 35px;
      "
    >

      <h1
        style="
          font-size:clamp(42px,6vw,68px);
        "
      >
        Hardware Wallet Comparison
      </h1>

      <p class="hero-text">

        Compare current hardware wallet
        prices and Deal Scores in one place.
        WalletRadar is built to help you
        decide what to buy and when to buy it.

      </p>

    </section>

    <div class="wallet-grid">

      ${rows}

    </div>

  </div>

</main>
`;

  return pageTemplate({

    title:
      "Hardware Wallet Comparison — Trezor vs Ledger | WalletRadar",

    description:
      "Compare hardware wallets from Trezor and Ledger by current price, price history and Deal Score.",

    canonical:
      `${BASE_URL}/compare`,

    content,
  });
}

/* -------------------------------------------------------
   TREZOR API TEST
------------------------------------------------------- */

async function trezorApiRequest(
  method,
  params
) {

  if (!TREZOR_API_KEY) {
    throw new Error(
      "TREZOR_API_KEY is not configured"
    );
  }

  const url =
    "https://api.hasoffers.com/Api";

  const body =
    new URLSearchParams();

  body.set(
    "NetworkId",
    TREZOR_NETWORK_ID
  );

  body.set(
    "Target",
    "Affiliate_Offer"
  );

  body.set(
    "Method",
    method
  );

  body.set(
    "Format",
    "json"
  );

  body.set(
    "Version",
    "3"
  );

  body.set(
    "api_key",
    TREZOR_API_KEY
  );

  for (
    const [key, value]
    of Object.entries(params || {})
  ) {
    body.set(
      key,
      String(value)
    );
  }

  const response =
    await fetch(
      url,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded;charset=UTF-8",
        },

        body:
          body.toString(),
      }
    );

  const text =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(text);
  } catch {
    throw new Error(
      `Trezor API returned non-JSON response: ${text.slice(
        0,
        500
      )}`
    );
  }

  return data;
}

/* -------------------------------------------------------
   STATIC RESPONSES
------------------------------------------------------- */

function serveText(
  res,
  status,
  content,
  contentType
) {

  res.writeHead(
    status,
    {
      "Content-Type":
        contentType,

      "Cache-Control":
        "public, max-age=300",
    }
  );

  res.end(content);
}

function generateSitemap() {

  const urls = [
    "/",
    "/compare",

    ...products.map(
      (product) =>
        `/${product.slug}`
    ),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
>
${urls
  .map(
    (url) =>
      `  <url>
    <loc>${escapeHtml(
      BASE_URL + url
    )}</loc>
  </url>`
  )
  .join("\n")}
</urlset>`;
}

function generateRobots() {

  return `User-agent: *
Allow: /

Sitemap: ${BASE_URL}/sitemap.xml
`;
}

/* -------------------------------------------------------
   SERVER
------------------------------------------------------- */

const server =
  http.createServer(
    async (req, res) => {

      try {

        const url =
          new URL(
            req.url,
            `http://${
              req.headers.host ||
              "localhost"
            }`
          );

        const pathname =
          url.pathname;

        /* HEALTH */

        if (
          pathname ===
          "/health"
        ) {

          return serveText(
            res,
            200,

            JSON.stringify(
              {
                ok: true,

                service:
                  "wallet-radar",

                products:
                  products.length,

                trezorApiConfigured:
                  Boolean(
                    TREZOR_API_KEY
                  ),
              },
              null,
              2
            ),

            "application/json; charset=utf-8"
          );
        }

        /* ROBOTS */

        if (
          pathname ===
          "/robots.txt"
        ) {

          return serveText(
            res,
            200,

            generateRobots(),

            "text/plain; charset=utf-8"
          );
        }

        /* SITEMAP */

        if (
          pathname ===
          "/sitemap.xml"
        ) {

          return serveText(
            res,
            200,

            generateSitemap(),

            "application/xml; charset=utf-8"
          );
        }

        /* TREZOR TEST */

        if (
          pathname ===
          "/api/trezor-test"
        ) {

          const result =
            await trezorApiRequest(
              "findAll",
              {
                "filters[status]":
                  "active",

                limit: 5,
              }
            );

          return serveText(
            res,
            200,

            JSON.stringify(
              {
                ok: true,

                apiConfigured:
                  Boolean(
                    TREZOR_API_KEY
                  ),

                result,
              },
              null,
              2
            ),

            "application/json; charset=utf-8"
          );
        }

        /* TREZOR AFFILIATE REDIRECTS */

        if (
          pathname ===
          "/go/trezor-safe-3"
        ) {

          const clickUrl =
            await generateTrezorTrackingLink(
              TREZOR_OFFERS[
                "trezor-safe-3"
              ],
              "walletradar"
            );

          res.writeHead(
            302,
            {
              Location:
                clickUrl,

              "Cache-Control":
                "no-store",
            }
          );

          return res.end();
        }

        if (
          pathname ===
          "/go/trezor-safe-5"
        ) {

          const clickUrl =
            await generateTrezorTrackingLink(
              TREZOR_OFFERS[
                "trezor-safe-5"
              ],
              "walletradar"
            );

          res.writeHead(
            302,
            {
              Location:
                clickUrl,

              "Cache-Control":
                "no-store",
            }
          );

          return res.end();
        }
/* STATIC IMAGES */

if (pathname.startsWith("/images/")) {
  const relativePath = pathname.replace(/^\/+/, "");
  const filePath = path.join(__dirname, relativePath);
  const imagesRoot = path.join(__dirname, "images");

  if (!filePath.startsWith(imagesRoot + path.sep)) {
    return serveText(
      res,
      403,
      "Forbidden",
      "text/plain; charset=utf-8"
    );
  }

  if (!fs.existsSync(filePath)) {
    return serveText(
      res,
      404,
      "Image not found",
      "text/plain; charset=utf-8"
    );
  }

  const ext = path.extname(filePath).toLowerCase();

  const contentTypes = {
    ".avif": "image/avif",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml"
  };

  const contentType =
    contentTypes[ext] || "application/octet-stream";

  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable"
  });

  return res.end(fs.readFileSync(filePath));
}
        /* COMPARE */

        if (
          pathname ===
          "/compare"
        ) {

          return serveText(
            res,
            200,

            renderCompare(),

            "text/html; charset=utf-8"
          );
        }

        /* HOME */

        if (
          pathname === "/"
        ) {

          return serveText(
            res,
            200,

            renderHome(),

            "text/html; charset=utf-8"
          );
        }

        /* PRODUCT */

        const slug =
          pathname
            .replace(/^\/+/, "")
            .replace(/\/+$/, "");

        const product =
          getProduct(slug);

        if (product) {

          return serveText(
            res,
            200,

            renderProduct(
              product
            ),

            "text/html; charset=utf-8"
          );
        }

        /* 404 */

        return serveText(
          res,
          404,

          pageTemplate(
            {
              title:
                "Page not found | WalletRadar",

              description:
                "The requested WalletRadar page could not be found.",

              canonical:
                `${BASE_URL}${pathname}`,

              content: `
                <main class="product-page">

                  <div class="container">

                    <h1
                      style="
                        font-size:52px;
                      "
                    >
                      Page not found
                    </h1>

                    <p class="hero-text">
                      The wallet or page you
                      requested does not exist.
                    </p>

                    <a
                      class="button"
                      href="/"
                      style="
                        max-width:300px;
                      "
                    >
                      Back to WalletRadar
                    </a>

                  </div>

                </main>
              `,
            }
          ),

          "text/html; charset=utf-8"
        );

      } catch (err) {

        console.error(err);

        return serveText(
          res,
          500,

          JSON.stringify(
            {
              ok: false,
              error:
                err.message,
            }
          ),

          "application/json; charset=utf-8"
        );
      }

    }
  );

server.listen(
  PORT,
  () => {

    console.log(
      `WalletRadar running on port ${PORT}`
    );

    console.log(
      `Products loaded: ${products.length}`
    );

    console.log(
      `Trezor API configured: ${Boolean(
        TREZOR_API_KEY
      )}`
    );

  }
);
