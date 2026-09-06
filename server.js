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
  console.error("Failed to load products.json:", err.message);
}

const TREZOR_OFFERS = {
  "trezor-safe-3": 169,
  "trezor-safe-5": 235,
  "trezor-safe-7": 352,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatPrice(value, currency = "CZK") {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  return new Intl.NumberFormat("cs-CZ", {
    maximumFractionDigits: 0,
  }).format(number) + ` ${currency}`;
}

function getProduct(slug) {
  return products.find((product) => product.slug === slug);
}

function getMarketOffers(product) {
  if (!product || !Array.isArray(product.offers)) {
    return [];
  }

  return product.offers
    .filter((offer) => Number.isFinite(Number(offer.price)))
    .sort((a, b) => Number(a.price) - Number(b.price));
}

function getLowestMarketPrice(product) {
  const offers = getMarketOffers(product);

  if (!offers.length) {
    return null;
  }

  return Number(offers[0].price);
}

function getCurrentPrice(product) {
  const marketPrice = getLowestMarketPrice(product);

  if (Number.isFinite(marketPrice)) {
    return marketPrice;
  }

  if (Number.isFinite(Number(product?.officialPrice))) {
    return Number(product.officialPrice);
  }

  return null;
}

function getPriceHistory(product) {
  if (!product || !Array.isArray(product.priceHistory)) {
    return [];
  }

  return product.priceHistory
    .filter(
      (item) =>
        item &&
        Number.isFinite(Number(item.price)) &&
        item.date
    )
    .sort((a, b) =>
      String(a.date).localeCompare(String(b.date))
    );
}

function getDealScore(product) {
  const current = getCurrentPrice(product);
  const history = getPriceHistory(product);

  if (!Number.isFinite(current) || current <= 0) {
    return null;
  }

  /*
    Deal Score should be based on real historical observations,
    not just the current price duplicated into the history.
    We wait for at least 7 observations before showing a score.
  */
  const historicalPrices = history
    .map((item) => Number(item.price))
    .filter((price) => Number.isFinite(price) && price > 0);

  if (historicalPrices.length < 7) {
    return null;
  }

  /*
    Score the current price by its position against historical prices.

    100 = current price is at or below all tracked historical prices.
    50  = roughly middle of the historical range.
    0   = current price is at or above all tracked historical prices.

    Using the historical distribution rather than only min/max makes the
    score less sensitive to one unusual outlier.
  */
  const betterOrEqualCount = historicalPrices.filter(
    (price) => price >= current
  ).length;

  const score =
    (betterOrEqualCount / historicalPrices.length) * 100;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function getDealStatus(score) {
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

function getOfficialPrice(product) {
  if (!product) {
    return null;
  }

  const price = Number(product.officialPrice);

  return Number.isFinite(price) ? price : null;
}

function getOfficialPriceCurrency(product) {
  return product?.officialPriceCurrency || product?.currency || "CZK";
}

function getMarketCurrency(product) {
  const offers = getMarketOffers(product);

  if (offers.length && offers[0].currency) {
    return offers[0].currency;
  }

  return product?.currency || "CZK";
}

function getPriceDifference(product) {
  const official = getOfficialPrice(product);
  const market = getLowestMarketPrice(product);

  if (
    !Number.isFinite(official) ||
    !Number.isFinite(market) ||
    official <= 0
  ) {
    return null;
  }

  return market - official;
}

function getPriceDifferencePercent(product) {
  const official = getOfficialPrice(product);
  const market = getLowestMarketPrice(product);

  if (
    !Number.isFinite(official) ||
    !Number.isFinite(market) ||
    official <= 0
  ) {
    return null;
  }

  return ((market - official) / official) * 100;
}

function getBestOffer(product) {
  const offers = getMarketOffers(product);

  if (!offers.length) {
    return null;
  }

  return offers[0];
}

function getTrackingLink(product) {
  if (!product || !TREZOR_API_KEY) {
    return null;
  }

  const offerId = TREZOR_OFFERS[product.slug];

  if (!offerId) {
    return null;
  }

  return {
    offerId,
    productSlug: product.slug,
  };
}

async function generateTrezorTrackingLink(product) {
  const tracking = getTrackingLink(product);

  if (!tracking) {
    return null;
  }

  if (!TREZOR_API_KEY) {
    return null;
  }

  try {
    const url =
      `https://api.hasoffers.com/Apiv3/json` +
      `?NetworkId=${encodeURIComponent(TREZOR_NETWORK_ID)}` +
      `&Target=Affiliate_Offer` +
      `&Method=generateTrackingLink` +
      `&offer_id=${encodeURIComponent(tracking.offerId)}` +
      `&api_key=${encodeURIComponent(TREZOR_API_KEY)}` +
      `&source=walletradar`;

    const response = await fetch(url);

    if (!response.ok) {
      console.error(
        "Trezor tracking link request failed:",
        response.status
      );

      return null;
    }

    const data = await response.json();

    const trackingUrl =
      data?.response?.data?.response?.tracking_url ||
      data?.response?.data?.tracking_url ||
      data?.response?.tracking_url ||
      null;

    return trackingUrl;
  } catch (err) {
    console.error(
      "Trezor tracking link error:",
      err.message
    );

    return null;
  }
}

function getStaticTrezorFallback(product) {
  if (!product) {
    return null;
  }

  const fallback = {
    "trezor-safe-3":
      "https://trezor.io/cs/trezor-safe-3",
    "trezor-safe-5":
      "https://trezor.io/cs/trezor-safe-5",
    "trezor-safe-7":
      "https://trezor.io/cs/trezor-safe-7",
  };

  return fallback[product.slug] || product.productUrl || null;
}

async function getTrezorBuyUrl(product) {
  const trackingUrl =
    await generateTrezorTrackingLink(product);

  return trackingUrl || getStaticTrezorFallback(product);
}

function renderHead({
  title,
  description,
  canonical,
  noindex = false,
  ogImage = null,
}) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <title>${escapeHtml(title)}</title>

  <meta
    name="description"
    content="${escapeHtml(description)}"
  >

  ${
    canonical
      ? `<link rel="canonical" href="${escapeHtml(canonical)}">`
      : ""
  }

  ${
    noindex
      ? `<meta name="robots" content="noindex,nofollow">`
      : `<meta name="robots" content="index,follow">`
  }

  <meta property="og:type" content="website">

  <meta
    property="og:title"
    content="${escapeHtml(title)}"
  >

  <meta
    property="og:description"
    content="${escapeHtml(description)}"
  >

  ${
    canonical
      ? `<meta property="og:url" content="${escapeHtml(canonical)}">`
      : ""
  }

  ${
    ogImage
      ? `<meta property="og:image" content="${escapeHtml(ogImage)}">`
      : ""
  }

  <style>
    :root {
      --bg: #f5f7fa;
      --card: #ffffff;
      --text: #111827;
      --muted: #6b7280;
      --line: #e5e7eb;
      --green: #16a34a;
      --green-dark: #15803d;
      --blue: #2563eb;
      --orange: #f59e0b;
      --red: #dc2626;
      --shadow: 0 12px 35px rgba(15, 23, 42, 0.08);
      --radius: 18px;
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
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.55;
    }

    a {
      color: inherit;
      text-decoration: none;
    }

    img {
      max-width: 100%;
      display: block;
    }

    .container {
      width: min(1180px, calc(100% - 32px));
      margin: 0 auto;
    }

    .site-header {
      position: sticky;
      top: 0;
      z-index: 50;
      background: rgba(255, 255, 255, 0.94);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--line);
    }

    .nav {
      min-height: 70px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 800;
      font-size: 20px;
      letter-spacing: -0.02em;
    }

    .brand-mark {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      background: #111827;
      color: white;
      font-size: 14px;
      font-weight: 900;
    }

    .nav-links {
      display: flex;
      align-items: center;
      gap: 22px;
      color: #374151;
      font-size: 14px;
      font-weight: 600;
    }

    .nav-links a:hover {
      color: var(--green);
    }

    .hero {
      padding: 72px 0 34px;
    }

    .hero-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.65fr);
      gap: 32px;
      align-items: center;
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 7px 11px;
      border-radius: 999px;
      background: #ecfdf5;
      color: #166534;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .hero h1 {
      margin: 18px 0 16px;
      font-size: clamp(42px, 6vw, 68px);
      line-height: 0.98;
      letter-spacing: -0.055em;
      max-width: 780px;
    }

    .hero p {
      margin: 0;
      max-width: 720px;
      color: var(--muted);
      font-size: 18px;
    }

    .hero-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 28px;
    }

    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 46px;
      padding: 0 18px;
      border-radius: 12px;
      font-weight: 800;
      font-size: 14px;
      border: 1px solid transparent;
      transition:
        transform 0.15s ease,
        box-shadow 0.15s ease,
        background 0.15s ease;
      cursor: pointer;
    }

    .button:hover {
      transform: translateY(-1px);
    }

    .button-primary {
      background: var(--green);
      color: white;
      box-shadow: 0 8px 20px rgba(22, 163, 74, 0.2);
    }

    .button-primary:hover {
      background: var(--green-dark);
    }

    .button-secondary {
      background: white;
      color: var(--text);
      border-color: var(--line);
    }

    .hero-panel {
      background: white;
      border: 1px solid var(--line);
      border-radius: 22px;
      padding: 22px;
      box-shadow: var(--shadow);
    }

    .hero-panel-title {
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
    }

    .hero-panel-main {
      margin-top: 14px;
      font-size: 34px;
      font-weight: 900;
      letter-spacing: -0.04em;
    }

    .hero-panel-sub {
      margin-top: 4px;
      color: var(--muted);
      font-size: 14px;
    }

    .mini-stats {
      display: flex;
      gap: 18px;
      flex-wrap: wrap;
      margin: 20px 0 4px;
    }

    .mini-stat {
      display: flex;
      align-items: baseline;
      gap: 6px;
      color: var(--muted);
      font-size: 12px;
    }

    .mini-stat strong {
      color: var(--text);
      font-size: 17px;
    }

    .section {
      padding: 38px 0;
    }

    .section-heading {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 20px;
    }

    .section-heading h2 {
      margin: 0;
      font-size: 30px;
      letter-spacing: -0.04em;
    }

    .section-heading p {
      margin: 4px 0 0;
      color: var(--muted);
    }

    .wallet-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 18px;
    }

    .wallet-card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      overflow: hidden;
      box-shadow: 0 5px 20px rgba(15, 23, 42, 0.04);
      display: flex;
      flex-direction: column;
    }

    .wallet-image {
      display: block;
      background: #fff;
      padding: 20px;
      aspect-ratio: 1.3;
      overflow: hidden;
    }

    .wallet-image img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      transition: transform 0.2s ease;
    }

    .wallet-image:hover img {
      transform: scale(1.025);
    }

    .wallet-content {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      flex: 1;
    }

    .wallet-brand {
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .wallet-name {
      margin: 0;
      font-size: 24px;
      letter-spacing: -0.035em;
    }

    .price-primary {
      font-size: 28px;
      font-weight: 900;
      letter-spacing: -0.04em;
    }

    .price-label {
      display: block;
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      margin-bottom: 2px;
    }

    .price-secondary {
      color: var(--muted);
      font-size: 13px;
    }

    .price-secondary strong {
      color: var(--text);
    }

    .wallet-actions {
      display: grid;
      grid-template-columns: 1fr;
      gap: 9px;
      margin-top: auto;
      padding-top: 6px;
    }

    .deal-pill {
      display: inline-flex;
      width: fit-content;
      padding: 6px 9px;
      border-radius: 999px;
      background: #f3f4f6;
      color: #374151;
      font-size: 12px;
      font-weight: 800;
    }

    .deal-pill.good {
      background: #ecfdf5;
      color: #166534;
    }

    .deal-pill.excellent {
      background: #dcfce7;
      color: #166534;
    }

    .deal-pill.high {
      background: #fef2f2;
      color: #991b1b;
    }

    .deal-pill.fair {
      background: #fffbeb;
      color: #92400e;
    }

    .radar-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
    }

    .radar-card {
      background: white;
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 20px;
    }

    .radar-card h3 {
      margin: 0 0 7px;
      font-size: 17px;
    }

    .radar-card p {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
    }

    .history-box {
      background: white;
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 22px;
    }

    .history-table {
      width: 100%;
      border-collapse: collapse;
    }

    .history-table th,
    .history-table td {
      padding: 12px 8px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      font-size: 14px;
    }

    .history-table th {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .steps {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
    }

    .step {
      background: white;
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 20px;
    }

    .step-number {
      width: 32px;
      height: 32px;
      border-radius: 10px;
      background: #111827;
      color: white;
      display: grid;
      place-items: center;
      font-weight: 900;
      font-size: 13px;
      margin-bottom: 14px;
    }

    .step h3 {
      margin: 0 0 7px;
      font-size: 17px;
    }

    .step p {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
    }

    .page-header {
      padding: 46px 0 28px;
    }

    .page-header h1 {
      margin: 0 0 10px;
      font-size: clamp(36px, 5vw, 54px);
      letter-spacing: -0.05em;
    }

    .page-header p {
      margin: 0;
      max-width: 780px;
      color: var(--muted);
    }

    .product-detail {
      display: grid;
      grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
      gap: 28px;
      align-items: start;
    }

    .product-image-panel,
    .product-info-panel {
      background: white;
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 24px;
      box-shadow: var(--shadow);
    }

    .product-image-panel img {
      width: 100%;
      max-height: 520px;
      object-fit: contain;
    }

    .product-info-panel h1 {
      margin: 0;
      font-size: 40px;
      letter-spacing: -0.05em;
    }

    .product-info-panel .brand {
      margin-bottom: 8px;
      font-size: 12px;
      color: var(--muted);
      text-transform: uppercase;
    }

    .detail-price {
      margin: 18px 0;
      font-size: 40px;
      font-weight: 900;
      letter-spacing: -0.05em;
    }

    .detail-price small {
      display: block;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0;
    }

    .detail-market {
      color: var(--muted);
      margin-bottom: 18px;
    }

    .detail-market strong {
      color: var(--text);
    }

    .score-box {
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 16px;
      margin: 20px 0;
      background: #fafafa;
    }

    .score-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .score-title {
      font-weight: 900;
    }

    .score-value {
      font-size: 30px;
      font-weight: 900;
    }

    .score-description {
      color: var(--muted);
      font-size: 13px;
      margin-top: 6px;
    }

    .notice {
      padding: 14px 16px;
      background: #f8fafc;
      border: 1px solid var(--line);
      border-radius: 14px;
      color: #475569;
      font-size: 13px;
    }

    .search-wrap {
      margin: 18px 0 28px;
    }

    .search-input {
      width: 100%;
      min-height: 48px;
      padding: 0 16px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: white;
      font: inherit;
      outline: none;
    }

    .search-input:focus {
      border-color: #94a3b8;
      box-shadow: 0 0 0 4px rgba(148, 163, 184, 0.12);
    }

    .compare-table-wrap {
      overflow-x: auto;
      background: white;
      border: 1px solid var(--line);
      border-radius: 18px;
    }

    .compare-table {
      width: 100%;
      min-width: 700px;
      border-collapse: collapse;
    }

    .compare-table th,
    .compare-table td {
      padding: 15px;
      border-bottom: 1px solid var(--line);
      text-align: left;
    }

    .compare-table th {
      background: #f8fafc;
      font-size: 13px;
    }

    .compare-table td {
      font-size: 14px;
    }

    .footer {
      margin-top: 70px;
      padding: 30px 0;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 13px;
    }

    .footer-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      flex-wrap: wrap;
    }

    .muted {
      color: var(--muted);
    }

    .empty {
      background: white;
      border: 1px dashed #cbd5e1;
      border-radius: 16px;
      padding: 28px;
      color: var(--muted);
      text-align: center;
    }

    @media (max-width: 900px) {
      .hero-grid,
      .product-detail {
        grid-template-columns: 1fr;
      }

      .wallet-grid,
      .radar-grid,
      .steps {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 620px) {
      .container {
        width: min(100% - 22px, 1180px);
      }

      .nav {
        min-height: 62px;
      }

      .nav-links {
        gap: 12px;
        font-size: 12px;
      }

      .hero {
        padding-top: 44px;
      }

      .hero h1 {
        font-size: 44px;
      }

      .hero p {
        font-size: 16px;
      }

      .wallet-grid,
      .radar-grid,
      .steps {
        grid-template-columns: 1fr;
      }

      .section-heading {
        display: block;
      }

      .section-heading h2 {
        font-size: 26px;
      }

      .product-info-panel h1 {
        font-size: 34px;
      }

      .detail-price {
        font-size: 34px;
      }
    }
  </style>
</head>
<body>
`;
}

function renderHeader() {
  return `
<header class="site-header">
  <div class="container nav">
    <a href="/" class="brand">
      <span class="brand-mark">CR</span>
      <span>CryptoWalletRadar</span>
    </a>

    <nav class="nav-links" aria-label="Main navigation">
      <a href="/">Radar</a>
      <a href="/compare">Compare</a>
      <a href="/#history">Price history</a>
      <a href="/#alerts">Alerts</a>
    </nav>
  </div>
</header>
`;
}

function renderFooter() {
  return `
<footer class="footer">
  <div class="container footer-inner">
    <div>
      CryptoWalletRadar — hardware wallet price radar.
    </div>

    <div>
      Prices are for information only and may change.
    </div>
  </div>
</footer>
</body>
</html>
`;
}

function renderWalletCard(product) {
  const officialPrice = getOfficialPrice(product);
  const officialCurrency =
    getOfficialPriceCurrency(product);

  const marketPrice =
    getLowestMarketPrice(product);

  const marketCurrency =
    getMarketCurrency(product);

  const bestOffer = getBestOffer(product);

  const score = getDealScore(product);
  const status = getDealStatus(score);

  let statusClass = "";

  if (score !== null) {
    if (score >= 80) {
      statusClass = "excellent";
    } else if (score >= 60) {
      statusClass = "good";
    } else if (score >= 40) {
      statusClass = "fair";
    } else {
      statusClass = "high";
    }
  }

  const image = product.image
    ? `
    <a
      href="/go/${escapeHtml(product.slug)}"
      class="wallet-image"
      aria-label="Buy ${escapeHtml(product.name)} at Trezor"
    >
      <img
        src="${escapeHtml(product.image)}"
        alt="${escapeHtml(product.name)}"
        loading="lazy"
      >
    </a>
    `
    : "";

  const marketLine =
    Number.isFinite(marketPrice)
      ? `
        <div class="price-secondary">
          Market price:
          <strong>
            ${formatPrice(marketPrice, marketCurrency)}
          </strong>
          ${
            bestOffer?.store
              ? ` at ${escapeHtml(bestOffer.store)}`
              : ""
          }
        </div>
      `
      : `
        <div class="price-secondary">
          No market offer tracked yet.
        </div>
      `;

  return `
<article class="wallet-card">
  ${image}

  <div class="wallet-content">
    <div class="wallet-brand">
      ${escapeHtml(product.brand)}
    </div>

    <h3 class="wallet-name">
      ${escapeHtml(product.name)}
    </h3>

    <div>
      <span class="price-label">
        Official Trezor price
      </span>

      <div class="price-primary">
        ${formatPrice(
          officialPrice,
          officialCurrency
        )}
      </div>
    </div>

    ${marketLine}

    <div>
      <span class="deal-pill ${statusClass}">
        ${
          score === null
            ? escapeHtml(status)
            : `Deal Score ${score}/100 · ${escapeHtml(status)}`
        }
      </span>
    </div>

    <div class="wallet-actions">
      <a
        class="button button-primary"
        href="/go/${escapeHtml(product.slug)}"
      >
        Buy at Trezor
      </a>

      <a
        class="button button-secondary"
        href="/${escapeHtml(product.slug)}"
      >
        View price &amp; history
      </a>
    </div>
  </div>
</article>
`;
}

function renderRadarCard(product) {
  const score = getDealScore(product);
  const current = getCurrentPrice(product);
  const status = getDealStatus(score);

  return `
<div class="radar-card">
  <h3>${escapeHtml(product.name)}</h3>

  <p>
    ${
      score === null
        ? "We are building enough price history to calculate a reliable Deal Score."
        : `Deal Score: <strong>${score}/100</strong> — ${escapeHtml(status)}.`
    }
  </p>

  ${
    Number.isFinite(current)
      ? `
        <p style="margin-top:10px;">
          Current tracked price:
          <strong>${formatPrice(current, getMarketCurrency(product))}</strong>
        </p>
      `
      : ""
  }
</div>
`;
}

function renderHome() {
  const trezorProducts = products.filter(
    (product) =>
      String(product.brand).toLowerCase() ===
      "trezor"
  );

  const totalWallets = trezorProducts.length;

  const priceDataPoints =
    trezorProducts.reduce(
      (total, product) =>
        total + getPriceHistory(product).length,
      0
    );

  const featuredProducts =
    trezorProducts.slice(0, 3);

  const latestHistory =
    trezorProducts
      .flatMap((product) =>
        getPriceHistory(product).map((item) => ({
          ...item,
          product: product.name,
        }))
      )
      .sort((a, b) =>
        String(b.date).localeCompare(String(a.date))
      )
      .slice(0, 8);

  return `
${renderHead({
  title:
    "CryptoWalletRadar — Hardware Wallet Price Tracker",
  description:
    "Track Trezor hardware wallet prices, compare current offers, see price history and find out whether now is a good time to buy.",
  canonical: BASE_URL + "/",
})}

${renderHeader()}

<main>
  <section class="hero">
    <div class="container hero-grid">
      <div>
        <span class="eyebrow">
          Hardware wallet price radar
        </span>

        <h1>
          Know the price.<br>
          Know when to buy.
        </h1>

        <p>
          CryptoWalletRadar tracks hardware wallet prices,
          price history and deal quality so you can make a
          better purchase decision.
        </p>

        <div class="hero-actions">
          <a
            class="button button-primary"
            href="#wallets"
          >
            See Trezor prices
          </a>

          <a
            class="button button-secondary"
            href="/compare"
          >
            Compare wallets
          </a>
        </div>
      </div>

      <aside class="hero-panel">
        <div class="hero-panel-title">
          Current radar
        </div>

        <div class="hero-panel-main">
          Trezor
        </div>

        <div class="hero-panel-sub">
          Official prices + tracked market offers
        </div>

        <div class="mini-stats">
          <div class="mini-stat">
            <strong>${totalWallets}</strong>
            wallets tracked
          </div>

          <div class="mini-stat">
            <strong>${priceDataPoints}</strong>
            price data points
          </div>
        </div>
      </aside>
    </div>
  </section>

  <section
    class="section"
    id="wallets"
  >
    <div class="container">
      <div class="section-heading">
        <div>
          <h2>Trezor price radar</h2>
          <p>
            Current official Trezor prices with market
            prices where we have tracked an offer.
          </p>
        </div>
      </div>

      <div class="wallet-grid">
        ${
          featuredProducts.length
            ? featuredProducts
                .map(renderWalletCard)
                .join("")
            : `
              <div class="empty">
                No Trezor products are currently available.
              </div>
            `
        }
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section-heading">
        <div>
          <h2>Best Deal radar</h2>
          <p>
            The score becomes meaningful as the price history
            grows.
          </p>
        </div>
      </div>

      <div class="radar-grid">
        ${
          featuredProducts.length
            ? featuredProducts
                .map(renderRadarCard)
                .join("")
            : ""
        }
      </div>
    </div>
  </section>

  <section
    class="section"
    id="history"
  >
    <div class="container">
      <div class="section-heading">
        <div>
          <h2>Latest price history</h2>
          <p>
            We keep the observed price points so today's
            price can be judged against the past.
          </p>
        </div>
      </div>

      <div class="history-box">
        ${
          latestHistory.length
            ? `
              <table class="history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Wallet</th>
                    <th>Price</th>
                  </tr>
                </thead>

                <tbody>
                  ${latestHistory
                    .map(
                      (item) => `
                        <tr>
                          <td>
                            ${escapeHtml(item.date)}
                          </td>

                          <td>
                            ${escapeHtml(item.product)}
                          </td>

                          <td>
                            ${formatPrice(
                              item.price,
                              item.currency || "CZK"
                            )}
                          </td>
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
            `
            : `
              <div class="empty">
                Price history is being built.
              </div>
            `
        }
      </div>
    </div>
  </section>

  <section
    class="section"
    id="alerts"
  >
    <div class="container">
      <div class="section-heading">
        <div>
          <h2>Price alerts</h2>
          <p>
            Want to know when a wallet reaches your target
            price? Alerts are part of the radar roadmap.
          </p>
        </div>
      </div>

      <div class="history-box">
        <h3 style="margin-top:0;">
          Buy when the price makes sense.
        </h3>

        <p class="muted">
          CryptoWalletRadar is being built around one simple
          idea: you should not have to guess whether today's
          hardware-wallet price is actually good.
        </p>

        <a
          class="button button-secondary"
          href="/compare"
        >
          Explore the radar
        </a>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section-heading">
        <div>
          <h2>How it works</h2>
          <p>
            Three simple steps from search to purchase.
          </p>
        </div>
      </div>

      <div class="steps">
        <div class="step">
          <div class="step-number">1</div>

          <h3>Check the current price</h3>

          <p>
            See the official Trezor price and available
            tracked market offers.
          </p>
        </div>

        <div class="step">
          <div class="step-number">2</div>

          <h3>Judge the deal</h3>

          <p>
            Compare today's price with the historical
            observations collected by the radar.
          </p>
        </div>

        <div class="step">
          <div class="step-number">3</div>

          <h3>Buy with confidence</h3>

          <p>
            When the price looks right, go directly to
            Trezor through the tracked purchase link.
          </p>
        </div>
      </div>
    </div>
  </section>
</main>

${renderFooter()}
`;
}

function renderProductPage(product) {
  const officialPrice = getOfficialPrice(product);
  const officialCurrency =
    getOfficialPriceCurrency(product);

  const marketPrice =
    getLowestMarketPrice(product);

  const marketCurrency =
    getMarketCurrency(product);

  const bestOffer = getBestOffer(product);

  const score = getDealScore(product);
  const status = getDealStatus(score);

  const history = getPriceHistory(product);

  const difference =
    getPriceDifference(product);

  const differencePercent =
    getPriceDifferencePercent(product);

  return `
${renderHead({
  title:
    `${product.brand} ${product.name} Price & History | CryptoWalletRadar`,
  description:
    `Track the ${product.brand} ${product.name} price, historical price data and current market offers.`,
  canonical:
    `${BASE_URL}/${product.slug}`,
  ogImage:
    product.image
      ? `${BASE_URL}${product.image}`
      : null,
})}

${renderHeader()}

<main>
  <section class="page-header">
    <div class="container">
      <div class="wallet-brand">
        ${escapeHtml(product.brand)}
      </div>

      <h1>${escapeHtml(product.name)}</h1>

      <p>
        Current price, market comparison and historical
        price data for ${escapeHtml(product.name)}.
      </p>
    </div>
  </section>

  <section class="section">
    <div class="container product-detail">
      <div class="product-image-panel">
        ${
          product.image
            ? `
              <img
                src="${escapeHtml(product.image)}"
                alt="${escapeHtml(product.name)}"
              >
            `
            : `
              <div class="empty">
                Product image unavailable.
              </div>
            `
        }
      </div>

      <div class="product-info-panel">
        <div class="brand">
          ${escapeHtml(product.brand)}
        </div>

        <h1>
          ${escapeHtml(product.name)}
        </h1>

        <div class="detail-price">
          <small>Official Trezor price</small>

          ${formatPrice(
            officialPrice,
            officialCurrency
          )}
        </div>

        ${
          Number.isFinite(marketPrice)
            ? `
              <div class="detail-market">
                Market price:
                <strong>
                  ${formatPrice(
                    marketPrice,
                    marketCurrency
                  )}
                </strong>

                ${
                  bestOffer?.store
                    ? ` at ${escapeHtml(bestOffer.store)}`
                    : ""
                }

                ${
                  difference !== null
                    ? `
                      <br>
                      ${
                        difference >= 0
                          ? "Market price is"
                          : "Market price is"
                      }

                      <strong>
                        ${formatPrice(
                          Math.abs(difference),
                          marketCurrency
                        )}
                      </strong>

                      ${
                        difference >= 0
                          ? "above"
                          : "below"
                      }

                      official Trezor price
                      ${
                        Number.isFinite(
                          differencePercent
                        )
                          ? `(${Math.abs(
                              differencePercent
                            ).toFixed(1)}%)`
                          : ""
                      }.
                    `
                    : ""
                }
              </div>
            `
            : `
              <div class="detail-market">
                No market offer is currently tracked for
                this wallet.
              </div>
            `
        }

        <div class="score-box">
          <div class="score-top">
            <div class="score-title">
              Deal Score
            </div>

            <div class="score-value">
              ${
                score === null
                  ? "—"
                  : `${score}/100`
              }
            </div>
          </div>

          <div class="score-description">
            ${escapeHtml(status)}.
            ${
              score === null
                ? " More real price observations are needed before the score is shown."
                : " The score compares the current tracked price with historical observations."
            }
          </div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <a
            class="button button-primary"
            href="/go/${escapeHtml(product.slug)}"
          >
            Buy at Trezor
          </a>

          <a
            class="button button-secondary"
            href="/compare"
          >
            Compare wallets
          </a>
        </div>

        <div
          class="notice"
          style="margin-top:18px;"
        >
          Prices can change. CryptoWalletRadar is a
          decision-support tool and does not guarantee the
          availability of any offer.
        </div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section-heading">
        <div>
          <h2>Price history</h2>

          <p>
            Historical observations used by the radar.
          </p>
        </div>
      </div>

      <div class="history-box">
        ${
          history.length
            ? `
              <table class="history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Price</th>
                    <th>Source</th>
                  </tr>
                </thead>

                <tbody>
                  ${history
                    .map(
                      (item) => `
                        <tr>
                          <td>
                            ${escapeHtml(item.date)}
                          </td>

                          <td>
                            ${formatPrice(
                              item.price,
                              item.currency ||
                                product.currency ||
                                "CZK"
                            )}
                          </td>

                          <td>
                            ${escapeHtml(
                              item.store ||
                                item.source ||
                                item.priceSource ||
                                "Tracked"
                            )}
                          </td>
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
            `
            : `
              <div class="empty">
                We do not have enough historical price
                observations yet.
              </div>
            `
        }
      </div>
    </div>
  </section>
</main>

${renderFooter()}
`;
}

function renderCompare() {
  const trezorProducts = products.filter(
    (product) =>
      String(product.brand).toLowerCase() ===
      "trezor"
  );

  return `
${renderHead({
  title:
    "Compare Trezor Hardware Wallets | CryptoWalletRadar",
  description:
    "Compare Trezor Safe 3, Safe 5 and Safe 7 prices, market offers and Deal Scores.",
  canonical:
    `${BASE_URL}/compare`,
})}

${renderHeader()}

<main>
  <section class="page-header">
    <div class="container">
      <h1>Compare Trezor wallets</h1>

      <p>
        Compare official prices, tracked market prices and
        Deal Scores across the Trezor Safe range.
      </p>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="compare-table-wrap">
        <table class="compare-table">
          <thead>
            <tr>
              <th>Wallet</th>
              <th>Official price</th>
              <th>Market price</th>
              <th>Deal Score</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            ${trezorProducts
              .map((product) => {
                const official =
                  getOfficialPrice(product);

                const market =
                  getLowestMarketPrice(product);

                const score =
                  getDealScore(product);

                return `
                  <tr>
                    <td>
                      <strong>
                        ${escapeHtml(product.name)}
                      </strong>
                    </td>

                    <td>
                      ${formatPrice(
                        official,
                        getOfficialPriceCurrency(
                          product
                        )
                      )}
                    </td>

                    <td>
                      ${
                        Number.isFinite(market)
                          ? formatPrice(
                              market,
                              getMarketCurrency(
                                product
                              )
                            )
                          : "—"
                      }
                    </td>

                    <td>
                      ${
                        score === null
                          ? "Building history"
                          : `${score}/100`
                      }
                    </td>

                    <td>
                      <a
                        class="button button-secondary"
                        href="/${escapeHtml(
                          product.slug
                        )}"
                      >
                        View
                      </a>
                    </td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  </section>
</main>

${renderFooter()}
`;
}

function renderNotFound() {
  return `
${renderHead({
  title:
    "Page not found | CryptoWalletRadar",
  description:
    "The requested CryptoWalletRadar page could not be found.",
  noindex: true,
})}

${renderHeader()}

<main>
  <section class="page-header">
    <div class="container">
      <h1>Page not found</h1>

      <p>
        The page you requested does not exist.
      </p>

      <div style="margin-top:20px;">
        <a
          class="button button-primary"
          href="/"
        >
          Back to radar
        </a>
      </div>
    </div>
  </section>
</main>

${renderFooter()}
`;
}

function renderRobots() {
  return `User-agent: *
Allow: /

Sitemap: ${BASE_URL}/sitemap.xml
`;
}

function renderSitemap() {
  const urls = [
    `${BASE_URL}/`,
    `${BASE_URL}/compare`,
  ];

  products
    .filter(
      (product) =>
        String(product.brand).toLowerCase() ===
        "trezor"
    )
    .forEach((product) => {
      urls.push(
        `${BASE_URL}/${product.slug}`
      );
    });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
>
${urls
  .map(
    (url) => `
  <url>
    <loc>${escapeHtml(url)}</loc>
  </url>`
  )
  .join("")}
</urlset>`;
}

async function handleAffiliateRedirect(
  req,
  res,
  slug
) {
  const product = getProduct(slug);

  if (!product) {
    res.writeHead(404, {
      "Content-Type":
        "text/plain; charset=utf-8",
    });

    res.end("Product not found");
    return;
  }

  const trackingUrl =
    await generateTrezorTrackingLink(product);

  const target =
    trackingUrl ||
    getStaticTrezorFallback(product);

  if (!target) {
    res.writeHead(404, {
      "Content-Type":
        "text/plain; charset=utf-8",
    });

    res.end("Affiliate link unavailable");
    return;
  }

  res.writeHead(302, {
    Location: target,
    "Cache-Control": "no-store",
  });

  res.end();
}

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
        const filename =
          pathname.slice(1);

        const filePath =
          path.join(
            __dirname,
            filename
          );

        if (!fs.existsSync(filePath)) {
          res.writeHead(404, {
            "Content-Type":
              "text/plain; charset=utf-8",
          });

          res.end("Image not found");
          return;
        }

        res.writeHead(200, {
          "Content-Type": "image/avif",
          "Cache-Control":
            "public, max-age=31536000, immutable",
        });

        res.end(
          fs.readFileSync(filePath)
        );

        return;
      }

      if (req.method !== "GET") {
        res.writeHead(405, {
          "Content-Type":
            "text/plain; charset=utf-8",
          "Allow": "GET",
        });

        res.end("Method not allowed");
        return;
      }

      if (pathname === "/robots.txt") {
        res.writeHead(200, {
          "Content-Type":
            "text/plain; charset=utf-8",
          "Cache-Control":
            "public, max-age=3600",
        });

        res.end(renderRobots());
        return;
      }

      if (pathname === "/sitemap.xml") {
        res.writeHead(200, {
          "Content-Type":
            "application/xml; charset=utf-8",
          "Cache-Control":
            "public, max-age=3600",
        });

        res.end(renderSitemap());
        return;
      }

      if (
        pathname.startsWith("/go/")
      ) {
        const slug =
          pathname.slice(4);

        await handleAffiliateRedirect(
          req,
          res,
          slug
        );

        return;
      }

      if (pathname === "/") {
        res.writeHead(200, {
          "Content-Type":
            "text/html; charset=utf-8",
        });

        res.end(renderHome());
        return;
      }

      if (pathname === "/compare") {
        res.writeHead(200, {
          "Content-Type":
            "text/html; charset=utf-8",
        });

        res.end(renderCompare());
        return;
      }

      const slug =
        pathname.slice(1);

      const product =
        getProduct(slug);

      if (product) {
        res.writeHead(200, {
          "Content-Type":
            "text/html; charset=utf-8",
        });

        res.end(
          renderProductPage(product)
        );

        return;
      }

      res.writeHead(404, {
        "Content-Type":
          "text/html; charset=utf-8",
      });

      res.end(renderNotFound());
    } catch (err) {
      console.error(
        "Request error:",
        err
      );

      res.writeHead(500, {
        "Content-Type":
          "text/plain; charset=utf-8",
      });

      res.end(
        "Internal server error"
      );
    }
  }
);

server.listen(PORT, () => {
  console.log(
    `CryptoWalletRadar running on port ${PORT}`
  );
});
