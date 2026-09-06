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

const ALZA_CATEGORY_URL =
  "https://m.alza.cz/hardware-penezenky-a-trezory/18862141.htm";

const ALZA_UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;

const ALZA_PRODUCTS = {
  "trezor-safe-3": "Trezor Safe 3",
  "trezor-safe-5": "Trezor Safe 5",
  "trezor-safe-7": "Trezor Safe 7",
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

function saveProducts() {
  try {
    fs.writeFileSync(
      productsPath,
      JSON.stringify(products, null, 2) + "\n",
      "utf8"
    );

    return true;
  } catch (err) {
    console.error(
      "Failed to save products.json:",
      err.message
    );

    return false;
  }
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAlzaPrice(text, productName) {
  const escapedName = productName.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

  const pattern = new RegExp(
    escapedName +
      "[\\s\\S]{0,260}?((?:\\d{1,3}(?:[ .]\\d{3})+|\\d{3,5}))\\s*(?:Kč|,-)",
    "i"
  );

  const match = text.match(pattern);

  if (!match) {
    return null;
  }

  const price = Number(
    String(match[1]).replace(/[ .]/g, "")
  );

  return Number.isFinite(price) && price > 0
    ? price
    : null;
}

async function fetchAlzaPrices() {
  try {
    const response = await fetch(ALZA_CATEGORY_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CryptoWalletRadar/1.0; +https://cryptowalletradar.com)",
        "Accept":
          "text/html,application/xhtml+xml",
        "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Alza returned HTTP ${response.status}`
      );
    }

    const html = await response.text();
    const text = stripHtml(html);

    const today =
      new Date().toISOString().slice(0, 10);

    let changed = false;

    for (const [slug, productName] of Object.entries(
      ALZA_PRODUCTS
    )) {
      const product = getProduct(slug);

      if (!product) {
        continue;
      }

      const price = extractAlzaPrice(
        text,
        productName
      );

      if (!Number.isFinite(price)) {
        console.log(
          `Alza: ${productName} price not found`
        );
        continue;
      }

      if (!Array.isArray(product.offers)) {
        product.offers = [];
      }

      let offer = product.offers.find(
        (item) =>
          String(item.store).toLowerCase() ===
          "alza"
      );

      if (!offer) {
        offer = {
          store: "Alza",
          price,
          currency: "CZK",
          priceSource: "automatic",
          affiliateUrl: null,
          url: ALZA_CATEGORY_URL,
        };

        product.offers.push(offer);
        changed = true;
      } else {
        if (Number(offer.price) !== price) {
          offer.price = price;
          changed = true;
        }

        if (offer.priceSource !== "automatic") {
          offer.priceSource = "automatic";
          changed = true;
        }

        if (!offer.currency) {
          offer.currency = "CZK";
          changed = true;
        }

        if (!offer.url) {
          offer.url = ALZA_CATEGORY_URL;
          changed = true;
        }
      }

      if (!Array.isArray(product.priceHistory)) {
        product.priceHistory = [];
      }

      const lastEntry =
        product.priceHistory[
          product.priceHistory.length - 1
        ];

      const alreadyRecorded =
        lastEntry &&
        lastEntry.date === today &&
        Number(lastEntry.price) === price;

      if (!alreadyRecorded) {
        product.priceHistory.push({
          date: today,
          price,
          currency: "CZK",
          store: "Alza",
          priceSource: "automatic",
        });

        changed = true;
      }

      product.lastUpdated = today;

      console.log(
        `Alza: ${productName} = ${price} CZK`
      );
    }

    if (changed) {
      saveProducts();
      console.log(
        "Alza price update saved to products.json"
      );
    } else {
      console.log(
        "Alza price update: no changes"
      );
    }

    return changed;
  } catch (err) {
    console.error(
      "Alza price update failed:",
      err.message
    );

    return false;
  }
}

function startAlzaPriceUpdater() {
  /*
    Run once after startup, then every 6 hours.
    The updater only writes a new history point when the
    price differs from the last observation for the day.
  */
  setTimeout(() => {
    fetchAlzaPrices();
  }, 5000);

  setInterval(() => {
    fetchAlzaPrices();
  }, ALZA_UPDATE_INTERVAL_MS);
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
    networkId: TREZOR_NETWORK_ID,
    apiKey: TREZOR_API_KEY,
  };
}
async function generateTrezorTrackingLink(product) {
  const tracking = getTrackingLink(product);

  if (!tracking) {
    return null;
  }

  const url =
    "https://api.hasoffers.com/Apiv3/json" +
    "?NetworkId=" +
    encodeURIComponent(tracking.networkId) +
    "&Target=Affiliate_Offer" +
    "&Method=generateTrackingLink" +
    "&api_key=" +
    encodeURIComponent(tracking.apiKey) +
    "&id=" +
    encodeURIComponent(tracking.offerId);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Trezor API returned HTTP ${response.status}`
      );
    }

    const data = await response.json();

    const trackingUrl =
      data?.response?.data?.tracking_url ||
      data?.response?.data?.url ||
      data?.response?.data?.trackingLink ||
      null;

    if (trackingUrl) {
      return trackingUrl;
    }

    console.error(
      "Trezor tracking link missing:",
      JSON.stringify(data)
    );

    return null;
  } catch (err) {
    console.error(
      "Trezor tracking link error:",
      err.message
    );

    return null;
  }
}

function renderHeader() {
  return `
    <header class="site-header">
      <div class="container header-inner">
        <a href="/" class="logo">
          <span class="logo-mark">₿</span>
          <span>CryptoWalletRadar</span>
        </a>

        <nav class="main-nav">
          <a href="/">Home</a>
          <a href="/compare">Compare</a>
          <a href="/history">Price History</a>
          <a href="/alerts">Price Alerts</a>
        </nav>
      </div>
    </header>
  `;
}

function renderFooter() {
  return `
    <footer class="site-footer">
      <div class="container footer-inner">
        <div>
          <strong>CryptoWalletRadar</strong>
          <p>
            Hardware wallet prices, history and deal intelligence.
          </p>
        </div>

        <div class="footer-links">
          <a href="/">Home</a>
          <a href="/compare">Compare</a>
          <a href="/history">Price History</a>
          <a href="/alerts">Price Alerts</a>
        </div>
      </div>

      <div class="container footer-bottom">
        <p>
          Prices are monitored automatically where available.
          Always verify the final price before purchase.
        </p>
      </div>
    </footer>
  `;
}

function renderPage(title, content, options = {}) {
  const description =
    options.description ||
    "CryptoWalletRadar helps you compare hardware wallet prices, track price history and find the best time to buy.";

  return `
<!DOCTYPE html>
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

  <meta
    property="og:title"
    content="${escapeHtml(title)}"
  >
  <meta
    property="og:description"
    content="${escapeHtml(description)}"
  >
  <meta
    property="og:type"
    content="website"
  >
  <meta
    property="og:url"
    content="${escapeHtml(BASE_URL)}"
  >

  <style>
    :root {
      --bg: #f7f8fa;
      --card: #ffffff;
      --text: #111827;
      --muted: #6b7280;
      --border: #e5e7eb;
      --green: #16a34a;
      --green-dark: #15803d;
      --green-soft: #dcfce7;
      --yellow: #f59e0b;
      --red: #dc2626;
      --blue: #2563eb;
      --shadow: 0 10px 30px rgba(0,0,0,.06);
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

    img {
      max-width: 100%;
      display: block;
    }

    .container {
      width: min(1180px, calc(100% - 32px));
      margin: 0 auto;
    }

    .site-header {
      background: rgba(255,255,255,.94);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 20;
      backdrop-filter: blur(12px);
    }

    .header-inner {
      min-height: 68px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
    }

    .logo {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-weight: 800;
      font-size: 19px;
      letter-spacing: -.02em;
    }

    .logo-mark {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      background: #111827;
      color: #fff;
      display: grid;
      place-items: center;
      font-size: 17px;
    }

    .main-nav {
      display: flex;
      align-items: center;
      gap: 22px;
      color: #4b5563;
      font-size: 14px;
      font-weight: 600;
    }

    .main-nav a:hover {
      color: var(--text);
    }

    .hero {
      padding: 72px 0 42px;
    }

    .hero-grid {
      display: grid;
      grid-template-columns: 1.25fr .75fr;
      gap: 48px;
      align-items: center;
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 7px 11px;
      border-radius: 999px;
      background: var(--green-soft);
      color: var(--green-dark);
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .06em;
    }

    .hero h1 {
      margin: 18px 0 16px;
      font-size: clamp(40px, 6vw, 68px);
      line-height: .98;
      letter-spacing: -.055em;
      max-width: 760px;
    }

    .hero h1 span {
      color: var(--green);
    }

    .hero p {
      max-width: 680px;
      margin: 0;
      color: var(--muted);
      font-size: 18px;
    }

    .hero-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 28px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 46px;
      padding: 0 18px;
      border-radius: 12px;
      font-weight: 800;
      font-size: 14px;
      border: 1px solid transparent;
      cursor: pointer;
    }

    .btn-primary {
      background: var(--green);
      color: #fff;
    }

    .btn-primary:hover {
      background: var(--green-dark);
    }

    .btn-secondary {
      background: #fff;
      border-color: var(--border);
    }

    .hero-card {
      background: #111827;
      color: #fff;
      border-radius: 24px;
      padding: 28px;
      box-shadow: var(--shadow);
    }

    .hero-card-label {
      color: #9ca3af;
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .06em;
    }

    .hero-card-title {
      font-size: 30px;
      font-weight: 850;
      margin-top: 10px;
      letter-spacing: -.035em;
    }

    .hero-card-text {
      color: #d1d5db;
      margin-top: 8px;
      font-size: 14px;
    }

    .hero-card-list {
      display: grid;
      gap: 12px;
      margin-top: 22px;
    }

    .hero-card-row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding-top: 12px;
      border-top: 1px solid rgba(255,255,255,.12);
      font-size: 13px;
    }

    .hero-card-row span:last-child {
      color: #86efac;
      font-weight: 800;
    }

    .stats {
      padding: 12px 0 50px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }

    .stat {
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 18px;
    }

    .stat-label {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }

    .stat-value {
      margin-top: 4px;
      font-size: 23px;
      font-weight: 850;
      letter-spacing: -.03em;
    }

    .section {
      padding: 58px 0;
    }

    .section-header {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 24px;
      margin-bottom: 24px;
    }

    .section-header h2 {
      margin: 0;
      font-size: 32px;
      letter-spacing: -.04em;
    }

    .section-header p {
      margin: 7px 0 0;
      color: var(--muted);
      max-width: 650px;
    }

    .wallet-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 18px;
    }

    .wallet-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      box-shadow: 0 4px 18px rgba(0,0,0,.03);
    }

    .wallet-image {
      display: block;
      height: 260px;
      padding: 24px;
      background: #fafafa;
    }

    .wallet-image img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .wallet-content {
      padding: 22px;
    }

    .wallet-brand {
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .08em;
    }

    .wallet-name {
      margin-top: 5px;
      font-size: 24px;
      font-weight: 850;
      letter-spacing: -.035em;
    }

    .price-block {
      margin-top: 18px;
    }

    .official-label {
      color: var(--muted);
      font-size: 12px;
    }

    .official-price {
      margin-top: 2px;
      font-size: 26px;
      font-weight: 900;
      letter-spacing: -.04em;
    }

    .market-price {
      margin-top: 4px;
      color: var(--muted);
      font-size: 13px;
    }

    .market-price strong {
      color: var(--text);
    }

    .deal-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-top: 18px;
    }

    .deal-badge {
      display: inline-flex;
      align-items: center;
      min-height: 30px;
      padding: 0 10px;
      border-radius: 999px;
      background: #f3f4f6;
      color: #4b5563;
      font-size: 12px;
      font-weight: 800;
    }

    .deal-score {
      font-weight: 900;
      font-size: 15px;
    }

    .wallet-actions {
      display: grid;
      grid-template-columns: 1fr;
      gap: 9px;
      margin-top: 18px;
    }

    .buy-button {
      width: 100%;
      min-height: 44px;
      border-radius: 11px;
      display: inline-flex;
      justify-content: center;
      align-items: center;
      background: var(--green);
      color: #fff;
      font-weight: 850;
      font-size: 14px;
    }

    .buy-button:hover {
      background: var(--green-dark);
    }

    .secondary-button {
      width: 100%;
      min-height: 42px;
      border-radius: 11px;
      border: 1px solid var(--border);
      background: #fff;
      display: inline-flex;
      justify-content: center;
      align-items: center;
      font-weight: 750;
      font-size: 13px;
    }

    .radar-box {
      background: #111827;
      color: #fff;
      border-radius: 22px;
      padding: 28px;
    }

    .radar-grid {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 24px;
      align-items: center;
    }

    .radar-title {
      font-size: 26px;
      font-weight: 850;
      letter-spacing: -.035em;
    }

    .radar-text {
      color: #d1d5db;
      margin-top: 8px;
      max-width: 720px;
    }

    .radar-price {
      text-align: right;
    }

    .radar-price-label {
      color: #9ca3af;
      font-size: 12px;
    }

    .radar-price-value {
      font-size: 32px;
      font-weight: 900;
      margin-top: 2px;
    }

    .history-card {
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 24px;
    }

    .history-list {
      display: grid;
      gap: 10px;
    }

    .history-row {
      display: grid;
      grid-template-columns: 130px 1fr 130px;
      gap: 12px;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid var(--border);
    }

    .history-row:last-child {
      border-bottom: 0;
    }

    .history-date {
      color: var(--muted);
      font-size: 13px;
    }

    .history-store {
      font-size: 13px;
      font-weight: 700;
    }

    .history-price {
      text-align: right;
      font-weight: 850;
    }

    .steps {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }

    .step {
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 22px;
    }

    .step-number {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      background: var(--green-soft);
      color: var(--green-dark);
      display: grid;
      place-items: center;
      font-weight: 900;
    }

    .step h3 {
      margin: 16px 0 6px;
      font-size: 18px;
    }

    .step p {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
    }

    .site-footer {
      margin-top: 30px;
      background: #111827;
      color: #fff;
      padding: 42px 0 24px;
    }

    .footer-inner {
      display: flex;
      justify-content: space-between;
      gap: 30px;
    }

    .footer-inner p,
    .footer-bottom p {
      color: #9ca3af;
      margin: 6px 0 0;
      font-size: 13px;
    }

    .footer-links {
      display: flex;
      gap: 20px;
      align-items: center;
      font-size: 13px;
      color: #d1d5db;
    }

    .footer-bottom {
      border-top: 1px solid rgba(255,255,255,.1);
      margin-top: 30px;
      padding-top: 18px;
    }

    .page {
      padding: 50px 0 80px;
    }

    .page-title {
      font-size: 44px;
      letter-spacing: -.05em;
      margin: 0;
    }

    .page-intro {
      color: var(--muted);
      max-width: 720px;
      margin: 10px 0 30px;
    }

    .compare-table-wrap {
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 18px;
      overflow-x: auto;
    }

    .compare-table {
      width: 100%;
      border-collapse: collapse;
      min-width: 760px;
    }

    .compare-table th,
    .compare-table td {
      padding: 16px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }

    .compare-table th {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .06em;
      color: var(--muted);
    }

    .compare-table td {
      font-size: 14px;
    }

    .alert-box {
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 24px;
      max-width: 720px;
    }

    .alert-form {
      display: grid;
      gap: 12px;
      margin-top: 20px;
    }

    .alert-form label {
      font-size: 13px;
      font-weight: 750;
    }

    .alert-form input,
    .alert-form select {
      width: 100%;
      min-height: 44px;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 0 12px;
      font: inherit;
      background: #fff;
    }

    .note {
      color: var(--muted);
      font-size: 13px;
      margin-top: 12px;
    }

    @media (max-width: 900px) {
      .hero-grid {
        grid-template-columns: 1fr;
      }

      .wallet-grid {
        grid-template-columns: 1fr 1fr;
      }

      .stats-grid {
        grid-template-columns: 1fr 1fr;
      }

      .radar-grid {
        grid-template-columns: 1fr;
      }

      .radar-price {
        text-align: left;
      }
    }

    @media (max-width: 640px) {
      .header-inner {
        flex-direction: column;
        align-items: flex-start;
        padding: 12px 0;
      }

      .main-nav {
        width: 100%;
        overflow-x: auto;
        gap: 16px;
      }

      .hero {
        padding-top: 46px;
      }

      .wallet-grid,
      .steps,
      .stats-grid {
        grid-template-columns: 1fr;
      }

      .section-header {
        display: block;
      }

      .history-row {
        grid-template-columns: 1fr 1fr;
      }

      .history-store {
        display: none;
      }

      .history-price {
        text-align: right;
      }

      .footer-inner {
        display: block;
      }

      .footer-links {
        margin-top: 20px;
        flex-wrap: wrap;
      }

      .page-title {
        font-size: 36px;
      }
    }
  </style>
</head>

<body>
  ${renderHeader()}

  <main>
    ${content}
  </main>

  ${renderFooter()}
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

  const score = getDealScore(product);
  const status = getDealStatus(score);
  const bestOffer = getBestOffer(product);

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

  const marketHtml = Number.isFinite(marketPrice)
    ? `
      Market price:
      <strong>${formatPrice(
        marketPrice,
        marketCurrency
      )}</strong>
    `
    : `
      Market price:
      <strong>Not tracked yet</strong>
    `;

  const scoreHtml =
    score === null
      ? `
        <span class="deal-badge">
          Building price history
        </span>
      `
      : `
        <span class="deal-badge">
          ${escapeHtml(status)}
        </span>
        <span class="deal-score">
          ${score}/100
        </span>
      `;

  const bestOfferText = bestOffer
    ? `Best market offer: ${formatPrice(
        bestOffer.price,
        bestOffer.currency || "CZK"
      )}`
    : "Market offers are being added";

  return `
    <article class="wallet-card">
      ${image}

      <div class="wallet-content">
        <div class="wallet-brand">
          ${escapeHtml(product.brand)}
        </div>

        <div class="wallet-name">
          ${escapeHtml(product.name)}
        </div>

        <div class="price-block">
          <div class="official-label">
            Official Trezor price
          </div>

          <div class="official-price">
            ${
              Number.isFinite(officialPrice)
                ? formatPrice(
                    officialPrice,
                    officialCurrency
                  )
                : "—"
            }
          </div>

          <div class="market-price">
            ${marketHtml}
          </div>
        </div>

        <div class="deal-row">
          ${scoreHtml}
        </div>

        <div class="note">
          ${escapeHtml(bestOfferText)}
        </div>

        <div class="wallet-actions">
          <a
            href="/go/${escapeHtml(product.slug)}"
            class="buy-button"
          >
            Buy at Trezor
          </a>

          <a
            href="/product/${escapeHtml(product.slug)}"
            class="secondary-button"
          >
            View price history
          </a>
        </div>
      </div>
    </article>
  `;
}

function renderHome() {
  const visibleProducts = products.filter(
    (product) =>
      product.brand === "Trezor" &&
      [
        "trezor-safe-3",
        "trezor-safe-5",
        "trezor-safe-7",
      ].includes(product.slug)
  );

  const trackedOffers = visibleProducts.reduce(
    (total, product) =>
      total + getMarketOffers(product).length,
    0
  );

  const prices = visibleProducts
    .map((product) => getCurrentPrice(product))
    .filter((price) => Number.isFinite(price));

  const lowestPrice = prices.length
    ? Math.min(...prices)
    : null;

  const historyPoints = visibleProducts.reduce(
    (total, product) =>
      total + getPriceHistory(product).length,
    0
  );

  const cards = visibleProducts
    .map(renderWalletCard)
    .join("");

  return renderPage(
    "CryptoWalletRadar – Trezor Hardware Wallet Price Radar",
    `
      <section class="hero">
        <div class="container hero-grid">
          <div>
            <div class="eyebrow">
              Trezor price radar
            </div>

            <h1>
              Know when your
              <span>hardware wallet</span>
              is worth buying.
            </h1>

            <p>
              CryptoWalletRadar tracks Trezor prices,
              builds price history and turns the data
              into a simple buying signal.
            </p>

            <div class="hero-actions">
              <a
                href="#wallets"
                class="btn btn-primary"
              >
                Explore Trezor wallets
              </a>

              <a
                href="/compare"
                class="btn btn-secondary"
              >
                Compare models
              </a>
            </div>
          </div>

          <div class="hero-card">
            <div class="hero-card-label">
              What the radar does
            </div>

            <div class="hero-card-title">
              Buy smarter, not blindly.
            </div>

            <div class="hero-card-text">
              We combine official pricing,
              market offers and historical observations
              to help you decide when and where to buy.
            </div>

            <div class="hero-card-list">
              <div class="hero-card-row">
                <span>Official Trezor prices</span>
                <span>✓</span>
              </div>

              <div class="hero-card-row">
                <span>Market price tracking</span>
                <span>✓</span>
              </div>

              <div class="hero-card-row">
                <span>Price history</span>
                <span>Building</span>
              </div>

              <div class="hero-card-row">
                <span>Deal Score</span>
                <span>Coming alive</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="stats">
        <div class="container stats-grid">
          <div class="stat">
            <div class="stat-label">
              Trezor models
            </div>
            <div class="stat-value">
              ${visibleProducts.length}
            </div>
          </div>

          <div class="stat">
            <div class="stat-label">
              Market offers
            </div>
            <div class="stat-value">
              ${trackedOffers}
            </div>
          </div>

          <div class="stat">
            <div class="stat-label">
              Price observations
            </div>
            <div class="stat-value">
              ${historyPoints}
            </div>
          </div>

          <div class="stat">
            <div class="stat-label">
              Lowest tracked price
            </div>
            <div class="stat-value">
              ${
                lowestPrice !== null
                  ? formatPrice(lowestPrice, "CZK")
                  : "—"
              }
            </div>
          </div>
        </div>
      </section>

      <section
        class="section"
        id="wallets"
      >
        <div class="container">
          <div class="section-header">
            <div>
              <h2>Trezor hardware wallets</h2>
              <p>
                Current official prices first.
                Market offers and history help you
                understand whether today's price is good.
              </p>
            </div>
          </div>

          <div class="wallet-grid">
            ${cards}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container">
          <div class="radar-box">
            <div class="radar-grid">
              <div>
                <div class="radar-title">
                  The radar is getting smarter over time.
                </div>

                <div class="radar-text">
                  Every new market observation adds to
                  the price history. Once enough data is
                  collected, Deal Score can tell you
                  whether today's price is unusually good,
                  normal or expensive.
                </div>
              </div>

              <div class="radar-price">
                <div class="radar-price-label">
                  Current lowest tracked price
                </div>

                <div class="radar-price-value">
                  ${
                    lowestPrice !== null
                      ? formatPrice(
                          lowestPrice,
                          "CZK"
                        )
                      : "—"
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container">
          <div class="section-header">
            <div>
              <h2>Price history</h2>
              <p>
                We are collecting real observations
                so the radar can distinguish a normal
                price from a genuinely good deal.
              </p>
            </div>

            <a
              href="/history"
              class="btn btn-secondary"
            >
              View history
            </a>
          </div>

          <div class="history-card">
            ${
              historyPoints > 0
                ? `
                  <div class="history-list">
                    ${visibleProducts
                      .map((product) => {
                        const history =
                          getPriceHistory(product);

                        const latest =
                          history[
                            history.length - 1
                          ];

                        if (!latest) {
                          return "";
                        }

                        return `
                          <div class="history-row">
                            <div class="history-date">
                              ${escapeHtml(
                                latest.date
                              )}
                            </div>

                            <div class="history-store">
                              ${escapeHtml(
                                product.name
                              )}
                              ${
                                latest.store
                                  ? ` · ${escapeHtml(
                                      latest.store
                                    )}`
                                  : ""
                              }
                            </div>

                            <div class="history-price">
                              ${formatPrice(
                                latest.price,
                                latest.currency ||
                                  "CZK"
                              )}
                            </div>
                          </div>
                        `;
                      })
                      .join("")}
                  </div>
                `
                : `
                  <p class="note">
                    Price history is being built.
                    New observations will appear here
                    as the radar collects them.
                  </p>
                `
            }
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container">
          <div class="section-header">
            <div>
              <h2>Price alerts</h2>
              <p>
                Want to wait for a better price?
                Set an alert and let the radar do
                the checking.
              </p>
            </div>

            <a
              href="/alerts"
              class="btn btn-primary"
            >
              Set a price alert
            </a>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container">
          <div class="section-header">
            <div>
              <h2>How it works</h2>
              <p>
                The goal is simple: make a better
                hardware-wallet buying decision.
              </p>
            </div>
          </div>

          <div class="steps">
            <div class="step">
              <div class="step-number">1</div>
              <h3>Choose a wallet</h3>
              <p>
                Compare the Trezor models and see
                their current official and market prices.
              </p>
            </div>

            <div class="step">
              <div class="step-number">2</div>
              <h3>Check the radar</h3>
              <p>
                Price history shows whether the current
                price looks attractive or expensive.
              </p>
            </div>

            <div class="step">
              <div class="step-number">3</div>
              <h3>Buy when it makes sense</h3>
              <p>
                Follow the best available route to
                the official Trezor store.
              </p>
            </div>
          </div>
        </div>
      </section>
    `
  );
}
function renderComparePage() {
  const visibleProducts = products.filter(
    (product) =>
      product.brand === "Trezor" &&
      [
        "trezor-safe-3",
        "trezor-safe-5",
        "trezor-safe-7",
      ].includes(product.slug)
  );

  const rows = visibleProducts
    .map((product) => {
      const official = getOfficialPrice(product);
      const market = getLowestMarketPrice(product);
      const score = getDealScore(product);
      const status = getDealStatus(score);

      return `
        <tr>
          <td>
            <strong>
              ${escapeHtml(product.name)}
            </strong>
          </td>

          <td>
            ${
              Number.isFinite(official)
                ? formatPrice(
                    official,
                    getOfficialPriceCurrency(product)
                  )
                : "—"
            }
          </td>

          <td>
            ${
              Number.isFinite(market)
                ? formatPrice(
                    market,
                    getMarketCurrency(product)
                  )
                : "Not tracked"
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
            ${escapeHtml(status)}
          </td>

          <td>
            <a
              href="/go/${escapeHtml(product.slug)}"
              class="buy-button"
              style="padding:0 14px; min-height:38px;"
            >
              Buy
            </a>
          </td>
        </tr>
      `;
    })
    .join("");

  return renderPage(
    "Compare Trezor Wallets – CryptoWalletRadar",
    `
      <section class="page">
        <div class="container">
          <h1 class="page-title">
            Compare Trezor wallets
          </h1>

          <p class="page-intro">
            Compare official prices, current market
            prices and the developing Deal Score for
            the main Trezor Safe models.
          </p>

          <div class="compare-table-wrap">
            <table class="compare-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Official price</th>
                  <th>Market price</th>
                  <th>Deal Score</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    `
  );
}

function renderHistoryPage() {
  const visibleProducts = products.filter(
    (product) =>
      product.brand === "Trezor" &&
      [
        "trezor-safe-3",
        "trezor-safe-5",
        "trezor-safe-7",
      ].includes(product.slug)
  );

  const productSections = visibleProducts
    .map((product) => {
      const history = getPriceHistory(product);
      const current = getCurrentPrice(product);

      return `
        <div class="history-card" style="margin-bottom:18px;">
          <div class="section-header">
            <div>
              <h2>
                ${escapeHtml(product.name)}
              </h2>

              <p>
                Current tracked price:
                ${
                  Number.isFinite(current)
                    ? formatPrice(
                        current,
                        getMarketCurrency(product)
                      )
                    : "—"
                }
              </p>
            </div>

            <div>
              ${
                getDealScore(product) === null
                  ? `
                    <span class="deal-badge">
                      Building price history
                    </span>
                  `
                  : `
                    <strong>
                      Deal Score:
                      ${getDealScore(product)}/100
                    </strong>
                  `
              }
            </div>
          </div>

          ${
            history.length
              ? `
                <div class="history-list">
                  ${history
                    .slice()
                    .reverse()
                    .map(
                      (item) => `
                        <div class="history-row">
                          <div class="history-date">
                            ${escapeHtml(
                              item.date
                            )}
                          </div>

                          <div class="history-store">
                            ${
                              item.store
                                ? escapeHtml(
                                    item.store
                                  )
                                : "Price observation"
                            }
                          </div>

                          <div class="history-price">
                            ${formatPrice(
                              item.price,
                              item.currency ||
                                "CZK"
                            )}
                          </div>
                        </div>
                      `
                    )
                    .join("")}
                </div>
              `
              : `
                <p class="note">
                  No historical observations yet.
                </p>
              `
          }
        </div>
      `;
    })
    .join("");

  return renderPage(
    "Trezor Price History – CryptoWalletRadar",
    `
      <section class="page">
        <div class="container">
          <h1 class="page-title">
            Trezor price history
          </h1>

          <p class="page-intro">
            See how tracked Trezor prices develop over
            time. The radar needs real observations before
            it can produce a meaningful Deal Score.
          </p>

          ${productSections}
        </div>
      </section>
    `
  );
}

function renderProductPage(product) {
  if (!product) {
    return render404();
  }

  const officialPrice = getOfficialPrice(product);
  const marketPrice = getLowestMarketPrice(product);
  const score = getDealScore(product);
  const status = getDealStatus(score);
  const history = getPriceHistory(product);
  const bestOffer = getBestOffer(product);

  const image = product.image
    ? `
      <a
        href="/go/${escapeHtml(product.slug)}"
        class="wallet-image"
        aria-label="Buy ${escapeHtml(product.name)} at Trezor"
        style="height:360px;"
      >
        <img
          src="${escapeHtml(product.image)}"
          alt="${escapeHtml(product.name)}"
        >
      </a>
    `
    : "";

  return renderPage(
    `${product.name} Price Radar – CryptoWalletRadar`,
    `
      <section class="page">
        <div class="container">
          <div
            style="
              display:grid;
              grid-template-columns:minmax(0,1fr) minmax(0,1fr);
              gap:28px;
              align-items:start;
            "
          >
            <div class="wallet-card">
              ${image}
            </div>

            <div>
              <div class="eyebrow">
                Trezor price radar
              </div>

              <h1 class="page-title" style="margin-top:16px;">
                ${escapeHtml(product.name)}
              </h1>

              <div class="history-card" style="margin-top:24px;">
                <div class="official-label">
                  Official Trezor price
                </div>

                <div class="official-price">
                  ${
                    Number.isFinite(officialPrice)
                      ? formatPrice(
                          officialPrice,
                          getOfficialPriceCurrency(
                            product
                          )
                        )
                      : "—"
                  }
                </div>

                <div class="market-price">
                  ${
                    Number.isFinite(marketPrice)
                      ? `Current market price:
                         <strong>
                           ${formatPrice(
                             marketPrice,
                             getMarketCurrency(
                               product
                             )
                           )}
                         </strong>`
                      : "Current market price: Not tracked"
                  }
                </div>

                <div
                  class="deal-row"
                  style="margin-top:20px;"
                >
                  <span class="deal-badge">
                    ${escapeHtml(status)}
                  </span>

                  ${
                    score !== null
                      ? `
                        <span class="deal-score">
                          ${score}/100
                        </span>
                      `
                      : ""
                  }
                </div>

                ${
                  bestOffer
                    ? `
                      <p class="note">
                        Best tracked market offer:
                        <strong>
                          ${formatPrice(
                            bestOffer.price,
                            bestOffer.currency ||
                              "CZK"
                          )}
                        </strong>
                        from
                        <strong>
                          ${escapeHtml(
                            bestOffer.store ||
                              "market"
                          )}
                        </strong>
                      </p>
                    `
                    : ""
                }

                <div
                  class="wallet-actions"
                  style="margin-top:22px;"
                >
                  <a
                    href="/go/${escapeHtml(
                      product.slug
                    )}"
                    class="buy-button"
                  >
                    Buy at Trezor
                  </a>
                </div>
              </div>
            </div>
          </div>

          <section
            class="section"
            style="padding-bottom:20px;"
          >
            <div class="section-header">
              <div>
                <h2>Price history</h2>
                <p>
                  Historical market observations for
                  ${escapeHtml(product.name)}.
                </p>
              </div>
            </div>

            <div class="history-card">
              ${
                history.length
                  ? `
                    <div class="history-list">
                      ${history
                        .slice()
                        .reverse()
                        .map(
                          (item) => `
                            <div class="history-row">
                              <div class="history-date">
                                ${escapeHtml(
                                  item.date
                                )}
                              </div>

                              <div class="history-store">
                                ${
                                  item.store
                                    ? escapeHtml(
                                        item.store
                                      )
                                    : "Price observation"
                                }
                              </div>

                              <div class="history-price">
                                ${formatPrice(
                                  item.price,
                                  item.currency ||
                                    "CZK"
                                )}
                              </div>
                            </div>
                          `
                        )
                        .join("")}
                    </div>
                  `
                  : `
                    <p class="note">
                      Price history is being built.
                    </p>
                  `
              }
            </div>
          </section>
        </div>
      </section>
    `
  );
}

function renderAlertsPage() {
  const visibleProducts = products.filter(
    (product) =>
      product.brand === "Trezor" &&
      [
        "trezor-safe-3",
        "trezor-safe-5",
        "trezor-safe-7",
      ].includes(product.slug)
  );

  const options = visibleProducts
    .map(
      (product) => `
        <option value="${escapeHtml(
          product.slug
        )}">
          ${escapeHtml(product.name)}
        </option>
      `
    )
    .join("");

  return renderPage(
    "Trezor Price Alerts – CryptoWalletRadar",
    `
      <section class="page">
        <div class="container">
          <h1 class="page-title">
            Price alerts
          </h1>

          <p class="page-intro">
            Tell us which Trezor wallet and target price
            you care about. Alert delivery will be
            connected as the radar backend develops.
          </p>

          <div class="alert-box">
            <h2 style="margin-top:0;">
              Create a price alert
            </h2>

            <form
              class="alert-form"
              method="POST"
              action="/alerts"
            >
              <div>
                <label for="product">
                  Wallet
                </label>

                <select
                  id="product"
                  name="product"
                  required
                >
                  ${options}
                </select>
              </div>

              <div>
                <label for="target">
                  Target price (CZK)
                </label>

                <input
                  id="target"
                  name="target"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="e.g. 2800"
                  required
                >
              </div>

              <div>
                <label for="email">
                  Email
                </label>

                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                >
              </div>

              <button
                class="btn btn-primary"
                type="submit"
              >
                Create alert
              </button>
            </form>

            <p class="note">
              We will use your target price only for the
              alert you request.
            </p>
          </div>
        </div>
      </section>
    `
  );
}

function parseFormBody(req) {
  return new Promise((resolve) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();

      if (body.length > 100000) {
        body = body.slice(0, 100000);
      }
    });

    req.on("end", () => {
      const params = new URLSearchParams(body);
      const data = {};

      for (const [key, value] of params.entries()) {
        data[key] = value;
      }

      resolve(data);
    });

    req.on("error", () => {
      resolve({});
    });
  });
}

function renderAlertCreatedPage(data) {
  const product = getProduct(data.product);

  return renderPage(
    "Price Alert Created – CryptoWalletRadar",
    `
      <section class="page">
        <div class="container">
          <div class="alert-box">
            <div class="eyebrow">
              Alert request received
            </div>

            <h1
              class="page-title"
              style="margin-top:16px;"
            >
              You're on the radar.
            </h1>

            <p class="page-intro">
              ${
                product
                  ? escapeHtml(product.name)
                  : "Your selected wallet"
              }
              will be monitored against your requested
              target price of
              <strong>
                ${escapeHtml(data.target || "—")} CZK
              </strong>.
            </p>

            <p class="note">
              Email delivery is the next backend step.
              The form submission itself is working.
            </p>

            <a
              href="/"
              class="btn btn-primary"
            >
              Back to radar
            </a>
          </div>
        </div>
      </section>
    `
  );
}

function render404() {
  return renderPage(
    "Page not found – CryptoWalletRadar",
    `
      <section class="page">
        <div class="container">
          <h1 class="page-title">
            Page not found
          </h1>

          <p class="page-intro">
            The page you're looking for doesn't exist.
          </p>

          <a
            href="/"
            class="btn btn-primary"
          >
            Back to CryptoWalletRadar
          </a>
        </div>
      </section>
    `
  );
}

function redirect(res, location) {
  res.writeHead(302, {
    Location: location,
  });

  res.end();
}

async function handleGo(req, res, slug) {
  const product = getProduct(slug);

  if (!product) {
    res.writeHead(404, {
      "Content-Type":
        "text/plain; charset=utf-8",
    });

    res.end("Product not found");
    return;
  }

  /*
    For the three Trezor products, generate a real
    Trezor affiliate tracking URL through the TUNE API.
  */

  const trackingLink =
    await generateTrezorTrackingLink(product);

  if (trackingLink) {
    redirect(res, trackingLink);
    return;
  }

  /*
    Fallback to the official product URL if the API
    is temporarily unavailable.
  */

  if (product.productUrl) {
    redirect(res, product.productUrl);
    return;
  }

  res.writeHead(404, {
    "Content-Type":
      "text/plain; charset=utf-8",
  });

  res.end("Product URL not available");
}

function renderRobots() {
  return `User-agent: *
Allow: /

Sitemap: ${BASE_URL}/sitemap.xml
`;
}

function renderSitemap() {
  const urls = [
    "/",
    "/compare",
    "/history",
    "/alerts",
  ];

  for (const product of products) {
    if (
      product.brand === "Trezor" &&
      [
        "trezor-safe-3",
        "trezor-safe-5",
        "trezor-safe-7",
      ].includes(product.slug)
    ) {
      urls.push(
        `/product/${product.slug}`
      );
    }
  }

  const uniqueUrls = [
    ...new Set(urls),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
>
${uniqueUrls
  .map(
    (url) => `
  <url>
    <loc>${escapeHtml(
      BASE_URL + url
    )}</loc>
  </url>`
  )
  .join("")}
</urlset>
`;
}

const server = http.createServer(
  async (req, res) => {
    try {
      const requestUrl = new URL(
        req.url,
        BASE_URL
      );

      const pathname =
        requestUrl.pathname;

      /*
        Static product images.
      */

      if (
        pathname === "/trezor-safe-3.avif" ||
        pathname === "/trezor-safe-5.avif" ||
        pathname === "/trezor-safe-7.avif"
      ) {
        const filename =
          pathname.slice(1);

        const filePath = path.join(
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

      /*
        Robots.txt
      */

      if (pathname === "/robots.txt") {
        res.writeHead(200, {
          "Content-Type":
            "text/plain; charset=utf-8",
        });

        res.end(renderRobots());
        return;
      }

      /*
        Sitemap
      */

      if (pathname === "/sitemap.xml") {
        res.writeHead(200, {
          "Content-Type":
            "application/xml; charset=utf-8",
        });

        res.end(renderSitemap());
        return;
      }

      /*
        Affiliate redirect
      */

      if (
        req.method === "GET" &&
        pathname.startsWith("/go/")
      ) {
        const slug = pathname.slice(4);

        await handleGo(
          req,
          res,
          slug
        );

        return;
      }

      /*
        Product page
      */

      if (
        req.method === "GET" &&
        pathname.startsWith("/product/")
      ) {
        const slug =
          pathname.slice(
            "/product/".length
          );

        const product =
          getProduct(slug);

        res.writeHead(
          product ? 200 : 404,
          {
            "Content-Type":
              "text/html; charset=utf-8",
          }
        );

        res.end(
          renderProductPage(product)
        );

        return;
      }

      /*
        Compare page
      */

      if (
        req.method === "GET" &&
        pathname === "/compare"
      ) {
        res.writeHead(200, {
          "Content-Type":
            "text/html; charset=utf-8",
        });

        res.end(
          renderComparePage()
        );

        return;
      }

      /*
        History page
      */

      if (
        req.method === "GET" &&
        pathname === "/history"
      ) {
        res.writeHead(200, {
          "Content-Type":
            "text/html; charset=utf-8",
        });

        res.end(
          renderHistoryPage()
        );

        return;
      }

      /*
        Alerts GET
      */

      if (
        req.method === "GET" &&
        pathname === "/alerts"
      ) {
        res.writeHead(200, {
          "Content-Type":
            "text/html; charset=utf-8",
        });

        res.end(
          renderAlertsPage()
        );

        return;
      }

      /*
        Alerts POST
      */

      if (
        req.method === "POST" &&
        pathname === "/alerts"
      ) {
        const data =
          await parseFormBody(req);

        res.writeHead(200, {
          "Content-Type":
            "text/html; charset=utf-8",
        });

        res.end(
          renderAlertCreatedPage(
            data
          )
        );

        return;
      }

      /*
        Homepage
      */

      if (
        req.method === "GET" &&
        pathname === "/"
      ) {
        res.writeHead(200, {
          "Content-Type":
            "text/html; charset=utf-8",
        });

        res.end(
          renderHome()
        );

        return;
      }

      /*
        404
      */

      res.writeHead(404, {
        "Content-Type":
          "text/html; charset=utf-8",
      });

      res.end(
        render404()
      );
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

server.listen(
  PORT,
  () => {
    console.log(
      `CryptoWalletRadar running on port ${PORT}`
    );

    console.log(
      `Base URL: ${BASE_URL}`
    );

    console.log(
      `Trezor API configured: ${
        TREZOR_API_KEY
          ? "yes"
          : "no"
      }`
    );

    startAlzaPriceUpdater();
  }
);
