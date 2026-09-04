const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;

const productsData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "products.json"), "utf8")
);

/*
 * --------------------------------------------------
 * Trezor affiliate offer IDs
 * --------------------------------------------------
 */

const TREZOR_OFFERS = {
  "trezor-safe-3": 169,
  "trezor-safe-5": 235
};

const affiliateCache = new Map();
const AFFILIATE_CACHE_MS = 60 * 60 * 1000;

/*
 * --------------------------------------------------
 * Helpers
 * --------------------------------------------------
 */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatPrice(price, currency) {
  if (price === null || price === undefined) {
    return "N/A";
  }

  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: currency || "CZK"
  }).format(price);
}

function getOfferSource(offer) {
  if (!offer) {
    return "Tracked retailer";
  }

  return (
    offer.store ||
    offer.merchant ||
    offer.source ||
    "Tracked retailer"
  );
}

function getProductSource(product, offer) {
  if (offer) {
    return getOfferSource(offer);
  }

  return product.brand || "Tracked source";
}

function calculateDeal(currentPrice, history) {
  if (
    currentPrice === null ||
    currentPrice === undefined ||
    !history ||
    history.length < 2
  ) {
    return {
      score: null,
      status: "Building price history"
    };
  }

  const lowestPrice = Math.min(
    ...history.map(entry => entry.price)
  );

  if (!lowestPrice || lowestPrice <= 0) {
    return {
      score: null,
      status: "Building price history"
    };
  }

  const aboveLowest =
    ((currentPrice - lowestPrice) / lowestPrice) * 100;

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(100 - aboveLowest * 2)
    )
  );

  let status = "Wait";

  if (score >= 80) {
    status = "Good deal";
  } else if (score >= 50) {
    status = "Fair price";
  }

  if (currentPrice === lowestPrice) {
    return {
      score: 100,
      status: "Best recorded price"
    };
  }

  return {
    score,
    status
  };
}

/*
 * --------------------------------------------------
 * Price chart
 * --------------------------------------------------
 */

function buildPriceChart(history, currency) {
  if (!history || history.length === 0) {
    return `
      <div class="chart-empty">
        <div class="chart-empty-icon">📈</div>
        <strong>Price history is starting</strong>
        <span>WalletRadar will collect more price points automatically.</span>
      </div>
    `;
  }

  if (history.length === 1) {
    const point = history[0];

    return `
      <div class="chart-wrap">
        <svg
          viewBox="0 0 600 190"
          class="chart"
          role="img"
          aria-label="Price history"
        >
          <line
            x1="40"
            y1="145"
            x2="570"
            y2="145"
            class="chart-axis"
          />

          <line
            x1="40"
            y1="30"
            x2="40"
            y2="145"
            class="chart-axis"
          />

          <circle
            cx="305"
            cy="85"
            r="7"
            class="chart-dot"
          />

          <text
            x="305"
            y="58"
            text-anchor="middle"
            class="chart-price"
          >
            ${escapeHtml(formatPrice(point.price, currency))}
          </text>

          <text
            x="305"
            y="174"
            text-anchor="middle"
            class="chart-date"
          >
            ${escapeHtml(point.date)}
          </text>
        </svg>

        <div class="chart-note">
          Tracking started · more price points coming
        </div>
      </div>
    `;
  }

  const prices = history.map(item => item.price);

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  const width = 600;
  const height = 190;

  const left = 40;
  const right = 30;
  const top = 25;
  const bottom = 45;

  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;

  const range = maxPrice - minPrice || 1;

  const points = history.map((item, index) => {
    const x =
      left +
      (index / (history.length - 1)) *
        chartWidth;

    const y =
      top +
      (1 - (item.price - minPrice) / range) *
        chartHeight;

    return {
      x,
      y,
      price: item.price,
      date: item.date
    };
  });

  const polyline = points
    .map(point => `${point.x},${point.y}`)
    .join(" ");

  const circles = points
    .map(
      point => `
        <circle
          cx="${point.x}"
          cy="${point.y}"
          r="4"
          class="chart-dot"
        />
      `
    )
    .join("");

  const first = points[0];
  const last = points[points.length - 1];

  return `
    <div class="chart-wrap">
      <svg
        viewBox="0 0 ${width} ${height}"
        class="chart"
        role="img"
        aria-label="Price history"
      >
        <line
          x1="${left}"
          y1="${height - bottom}"
          x2="${width - right}"
          y2="${height - bottom}"
          class="chart-axis"
        />

        <line
          x1="${left}"
          y1="${top}"
          x2="${left}"
          y2="${height - bottom}"
          class="chart-axis"
        />

        <polyline
          points="${polyline}"
          class="chart-line"
        />

        ${circles}

        <text
          x="${left}"
          y="17"
          class="chart-label"
        >
          ${escapeHtml(formatPrice(maxPrice, currency))}
        </text>

        <text
          x="${left}"
          y="${height - 7}"
          class="chart-label"
        >
          ${escapeHtml(formatPrice(minPrice, currency))}
        </text>

        <text
          x="${first.x}"
          y="${height - 7}"
          class="chart-date"
          text-anchor="start"
        >
          ${escapeHtml(first.date)}
        </text>

        <text
          x="${last.x}"
          y="${height - 7}"
          class="chart-date"
          text-anchor="end"
        >
          ${escapeHtml(last.date)}
        </text>
      </svg>
    </div>
  `;
}

/*
 * --------------------------------------------------
 * Trezor Affiliate API
 * --------------------------------------------------
 */

async function generateTrezorTrackingLink(productSlug) {
  const offerId = TREZOR_OFFERS[productSlug];

  if (!offerId) {
    return null;
  }

  const apiKey = process.env.TREZOR_API_KEY;
  const networkId =
    process.env.TREZOR_NETWORK_ID || "trezor";

  if (!apiKey) {
    console.log(
      "TREZOR_API_KEY is not configured."
    );

    return null;
  }

  const cached = affiliateCache.get(productSlug);

  if (
    cached &&
    Date.now() - cached.timestamp <
      AFFILIATE_CACHE_MS
  ) {
    return cached.url;
  }

  const params = new URLSearchParams({
    api_key: apiKey,
    Target: "Affiliate_Offer",
    Method: "generateTrackingLink",
    offer_id: String(offerId)
  });

  params.append(
    "params[source]",
    "walletradar"
  );

  const apiUrl =
    `https://${networkId}.api.hasoffers.com/Apiv3/json?${params.toString()}`;

  try {
    const response = await fetch(apiUrl);

    if (!response.ok) {
      console.log(
        `Trezor API HTTP error: ${response.status}`
      );

      return null;
    }

    const data = await response.json();

    if (
      data?.response?.status !== 1
    ) {
      console.log(
        "Trezor API error:",
        data?.response?.errorMessage ||
          "Unknown error"
      );

      return null;
    }

    const clickUrl =
      data?.response?.data?.click_url;

    if (!clickUrl) {
      console.log(
        "Trezor API returned no click_url."
      );

      return null;
    }

    affiliateCache.set(productSlug, {
      url: clickUrl,
      timestamp: Date.now()
    });

    return clickUrl;

  } catch (error) {
    console.log(
      "Trezor affiliate request failed:",
      error.message
    );

    return null;
  }
}

/*
 * --------------------------------------------------
 * Product loader
 * --------------------------------------------------
 */

async function loadProducts() {
  const result = [];

  for (const product of productsData) {
    let affiliateUrl = null;

    if (product.brand === "Trezor") {
      affiliateUrl =
        await generateTrezorTrackingLink(
          product.slug
        );
    }

    const offers = (product.offers || [])
      .filter(
        offer =>
          typeof offer.price === "number"
      )
      .sort(
        (a, b) =>
          a.price - b.price
      );

    const bestOffer = offers[0];

    const history = (
      product.priceHistory || []
    )
      .filter(
        entry =>
          typeof entry.price === "number"
      )
      .sort(
        (a, b) =>
          new Date(a.date) -
          new Date(b.date)
      );

    const currentPrice =
      bestOffer?.price ?? null;

    const lowestPrice =
      history.length
        ? Math.min(
            ...history.map(
              entry => entry.price
            )
          )
        : currentPrice;

    const deal = calculateDeal(
      currentPrice,
      history
    );

    const currency =
      product.currency || "CZK";

    /*
     * Affiliate URL gets priority.
     *
     * Price source remains separate from
     * purchase destination.
     */
    const destination =
      affiliateUrl ||
      bestOffer?.affiliateUrl ||
      bestOffer?.url ||
      product.productUrl ||
      "#";

    result.push({
      brand: product.brand,
      name: product.name,
      slug: product.slug,

      price: formatPrice(
        currentPrice,
        currency
      ),

      rawPrice: currentPrice,

      lowestPrice: formatPrice(
        lowestPrice,
        currency
      ),

      rawLowestPrice: lowestPrice,

      dealScore: deal.score,
      status: deal.status,

      currency,

      history,

      source: getProductSource(
        product,
        bestOffer
      ),

      url: destination,

      affiliateActive:
        Boolean(affiliateUrl),

      hasHistory:
        history.length >= 2
    });
  }

  return result;
}

/*
 * --------------------------------------------------
 * Intelligence
 * --------------------------------------------------
 */

function getBestDeal(products) {
  const candidates = products
    .filter(
      product =>
        product.dealScore !== null
    )
    .sort(
      (a, b) =>
        b.dealScore - a.dealScore
    );

  return candidates[0] || null;
}

function getBiggestDrop(products) {
  const candidates = [];

  for (const product of products) {
    if (
      !product.history ||
      product.history.length < 2
    ) {
      continue;
    }

    const first =
      product.history[0].price;

    const last =
      product.history[
        product.history.length - 1
      ].price;

    if (first <= 0) {
      continue;
    }

    const drop =
      ((first - last) / first) * 100;

    candidates.push({
      product,
      drop
    });
  }

  candidates.sort(
    (a, b) =>
      b.drop - a.drop
  );

  return candidates[0] || null;
}

/*
 * --------------------------------------------------
 * Product cards
 * --------------------------------------------------
 */

function renderProductCard(product) {
  const score =
    product.dealScore !== null
      ? `${product.dealScore}/100`
      : "—";

  const scoreClass =
    product.dealScore === null
      ? "neutral"
      : product.dealScore >= 80
        ? "good"
        : product.dealScore >= 50
          ? "fair"
          : "wait";

  const cta =
    product.affiliateActive
      ? `Shop official ${escapeHtml(product.brand)}`
      : "View offer";

  const affiliateBadge =
    product.affiliateActive
      ? `<span class="affiliate-badge">Official affiliate</span>`
      : "";

  const searchText =
    `${product.brand} ${product.name}`.toLowerCase();

  return `
    <article
      class="wallet-card"
      data-search="${escapeHtml(searchText)}"
    >

      <div class="wallet-top">

        <div>
          <div class="wallet-brand">
            ${escapeHtml(product.brand)}
          </div>

          <h3>
            ${escapeHtml(product.name)}
          </h3>
        </div>

        ${affiliateBadge}

      </div>

      <div class="price-block">

        <div class="price-label">
          Tracked price
        </div>

        <div class="price">
          ${escapeHtml(product.price)}
        </div>

        <div class="source">
          Source:
          <strong>
            ${escapeHtml(product.source)}
          </strong>
        </div>

      </div>

      <div class="metrics">

        <div class="metric">

          <span class="metric-label">
            Lowest recorded
          </span>

          <strong>
            ${escapeHtml(product.lowestPrice)}
          </strong>

        </div>

        <div class="metric score-${scoreClass}">

          <span class="metric-label">
            Deal Score
          </span>

          <strong>
            ${score}
          </strong>

        </div>

      </div>

      <div class="status-row">

        <span class="status-dot status-${scoreClass}"></span>

        <span>
          ${escapeHtml(product.status)}
        </span>

      </div>

      <div class="mini-history">

        <div class="mini-history-title">
          Price history
        </div>

        ${buildPriceChart(
          product.history,
          product.currency
        )}

      </div>

      <a
        class="wallet-cta"
        href="${escapeHtml(product.url)}"
        target="_blank"
        rel="noopener sponsored"
      >
        ${cta}
        <span>↗</span>
      </a>

      ${
        product.affiliateActive
          ? `
            <div class="destination-note">
              Price source and purchase destination
              are shown separately.
            </div>
          `
          : ""
      }

    </article>
  `;
}

/*
 * --------------------------------------------------
 * Homepage
 * --------------------------------------------------
 */

function page(products) {
  const bestDeal =
    getBestDeal(products);

  const biggestDrop =
    getBiggestDrop(products);

  const cards = products
    .map(renderProductCard)
    .join("");

  const trackedCount =
    products.length;

  const historyCount =
    products.reduce(
      (sum, product) =>
        sum + product.history.length,
      0
    );

  const affiliateCount =
    products.filter(
      product =>
        product.affiliateActive
    ).length;

  const bestDealHtml =
    bestDeal
      ? `
        <div class="intel-card featured">

          <div class="intel-icon">🔥</div>

          <div class="intel-content">

            <div class="intel-kicker">
              BEST DEAL RIGHT NOW
            </div>

            <h3>
              ${escapeHtml(bestDeal.name)}
            </h3>

            <div class="intel-price">
              ${escapeHtml(bestDeal.price)}
            </div>

            <div class="intel-meta">
              Deal Score
              <strong>
                ${bestDeal.dealScore}/100
              </strong>
            </div>

          </div>

          <a
            href="${escapeHtml(bestDeal.url)}"
            target="_blank"
            rel="noopener sponsored"
            class="intel-action"
          >
            View deal ↗
          </a>

        </div>
      `
      : `
        <div class="intel-card">

          <div class="intel-icon">🔥</div>

          <div class="intel-content">

            <div class="intel-kicker">
              BEST DEAL
            </div>

            <h3>
              Price intelligence is warming up
            </h3>

            <p>
              WalletRadar needs more historical
              price points before it can reliably
              identify the best deal.
            </p>

          </div>

        </div>
      `;

  const biggestDropHtml =
    biggestDrop
      ? `
        <div class="intel-card">

          <div class="intel-icon">📉</div>

          <div class="intel-content">

            <div class="intel-kicker">
              BIGGEST PRICE DROP
            </div>

            <h3>
              ${escapeHtml(
                biggestDrop.product.name
              )}
            </h3>

            <div class="drop-value">
              ${biggestDrop.drop.toFixed(1)}% lower
            </div>

            <div class="intel-meta">
              Current price
              <strong>
                ${escapeHtml(
                  biggestDrop.product.price
                )}
              </strong>
            </div>

          </div>

          <a
            href="${escapeHtml(
              biggestDrop.product.url
            )}"
            target="_blank"
            rel="noopener sponsored"
            class="intel-action"
          >
            View deal ↗
          </a>

        </div>
      `
      : `
        <div class="intel-card">

          <div class="intel-icon">📉</div>

          <div class="intel-content">

            <div class="intel-kicker">
              BIGGEST PRICE DROP
            </div>

            <h3>
              Collecting price history
            </h3>

            <p>
              Once WalletRadar has multiple
              price points, this section will
              identify meaningful price drops.
            </p>

          </div>

        </div>
      `;

  return `
<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>
  WalletRadar — Hardware Wallet Price Radar
</title>

<meta
  name="description"
  content="Compare hardware wallet prices, track price history, find better deals and know when to buy."
>

<meta
  name="theme-color"
  content="#f7f8fb"
>

<script>
(function () {
  try {
    const saved =
      localStorage.getItem("wr-theme") ||
      "light";

    const systemDark =
      window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;

    const theme =
      saved === "system"
        ? (systemDark ? "dark" : "light")
        : saved;

    document.documentElement.dataset.theme =
      theme;
  } catch (e) {
    document.documentElement.dataset.theme =
      "light";
  }
})();
</script>

<style>

* {
  box-sizing: border-box;
}

:root {
  color-scheme: light;

  --bg: #f7f8fb;
  --surface: #ffffff;
  --surface-soft: #f2f4f7;
  --surface-strong: #eef1f5;

  --text: #111827;
  --text-soft: #344054;
  --muted: #667085;

  --border: #e4e7ec;
  --border-strong: #d0d5dd;

  --accent: #5b5bd6;
  --accent-soft: #eeeeff;
  --accent-text: #4545b8;

  --green: #087443;
  --green-soft: #e8f7ef;

  --orange: #b54708;
  --orange-soft: #fff4e5;

  --red: #b42318;
  --red-soft: #fff0ef;

  --shadow:
    0 10px 30px rgba(16, 24, 40, .06);

  --shadow-hover:
    0 18px 45px rgba(16, 24, 40, .11);

  --radius: 18px;
}

html[data-theme="dark"] {
  color-scheme: dark;

  --bg: #08090d;
  --surface: #11131a;
  --surface-soft: #171a22;
  --surface-strong: #1c202a;

  --text: #f5f7fa;
  --text-soft: #d0d5dd;
  --muted: #98a2b3;

  --border: #252a35;
  --border-strong: #343b49;

  --accent: #9387ff;
  --accent-soft: #201d3b;
  --accent-text: #b9b1ff;

  --green: #52d69b;
  --green-soft: #102c21;

  --orange: #ffb866;
  --orange-soft: #322517;

  --red: #ff8d86;
  --red-soft: #351918;

  --shadow:
    0 14px 40px rgba(0, 0, 0, .25);

  --shadow-hover:
    0 20px 55px rgba(0, 0, 0, .38);
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

  background:
    var(--bg);

  color:
    var(--text);

  transition:
    background .2s ease,
    color .2s ease;
}

a {
  color: inherit;
}

button,
input {
  font: inherit;
}

.container {
  width: min(
    1180px,
    calc(100% - 40px)
  );

  margin: 0 auto;
}

/* HEADER */

header {
  position: sticky;
  top: 0;
  z-index: 50;

  background:
    color-mix(
      in srgb,
      var(--bg) 88%,
      transparent
    );

  backdrop-filter:
    blur(18px);

  border-bottom:
    1px solid var(--border);
}

.header-inner {
  min-height: 72px;

  display: flex;
  align-items: center;
  justify-content: space-between;

  gap: 24px;
}

.logo {
  font-size: 22px;
  font-weight: 850;
  letter-spacing: -1px;
  text-decoration: none;
}

.logo span {
  color: var(--accent);
}

.nav {
  display: flex;
  align-items: center;
  gap: 24px;
}

.nav a {
  color: var(--muted);
  text-decoration: none;
  font-size: 14px;
  font-weight: 600;
}

.nav a:hover {
  color: var(--text);
}

.theme-switch {
  display: flex;
  align-items: center;

  padding: 3px;

  border:
    1px solid var(--border);

  border-radius: 10px;

  background:
    var(--surface);
}

.theme-switch button {
  border: 0;
  background: transparent;

  color: var(--muted);

  padding: 7px 9px;

  border-radius: 7px;

  cursor: pointer;

  font-size: 12px;
  font-weight: 700;
}

.theme-switch button.active {
  background: var(--surface-strong);
  color: var(--text);
}

/* HERO */

.hero {
  padding:
    90px 0 70px;

  text-align: center;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;

  padding:
    7px 12px;

  border:
    1px solid var(--border);

  border-radius: 999px;

  background:
    var(--surface);

  color:
    var(--text-soft);

  font-size: 13px;
  font-weight: 700;

  box-shadow:
    var(--shadow);
}

.live-dot {
  width: 7px;
  height: 7px;

  border-radius: 50%;

  background: #16a36a;

  box-shadow:
    0 0 0 4px
    color-mix(
      in srgb,
      #16a36a 15%,
      transparent
    );
}

.hero h1 {
  max-width: 850px;

  margin:
    24px auto 20px;

  font-size:
    clamp(44px, 7vw, 76px);

  line-height:
    .98;

  letter-spacing:
    -4px;

  font-weight:
    850;
}

.hero h1 span {
  color: var(--accent);
}

.hero-description {
  max-width: 680px;

  margin: 0 auto;

  color: var(--muted);

  font-size: 19px;
  line-height: 1.6;
}

/* SEARCH */

.search-box {
  max-width: 700px;

  margin:
    34px auto 0;

  display: flex;

  padding: 6px;

  background:
    var(--surface);

  border:
    1px solid var(--border);

  border-radius: 15px;

  box-shadow:
    var(--shadow);
}

.search-box input {
  flex: 1;

  min-width: 0;

  border: 0;
  outline: 0;

  background: transparent;

  color: var(--text);

  padding:
    13px 15px;

  font-size: 16px;
}

.search-box button {
  border: 0;

  background:
    var(--accent);

  color: white;

  border-radius: 10px;

  padding:
    0 22px;

  font-weight: 800;

  cursor: pointer;
}

/* STATS */

.stats {
  display: grid;

  grid-template-columns:
    repeat(3, 1fr);

  gap: 14px;

  margin-bottom: 60px;
}

.stat {
  padding: 22px;

  background:
    var(--surface);

  border:
    1px solid var(--border);

  border-radius:
    var(--radius);

  box-shadow:
    var(--shadow);
}

.stat-number {
  font-size: 27px;
  font-weight: 850;
  letter-spacing: -1px;
}

.stat-label {
  margin-top: 5px;

  color: var(--muted);

  font-size: 13px;
}

/* SECTIONS */

section {
  padding:
    35px 0 65px;
}

.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;

  gap: 20px;

  margin-bottom: 24px;
}

.section-kicker {
  color: var(--accent);

  font-size: 12px;
  font-weight: 850;

  letter-spacing: 1.1px;

  text-transform: uppercase;

  margin-bottom: 6px;
}

.section-title {
  margin: 0;

  font-size: 32px;

  letter-spacing: -1.4px;
}

.section-description {
  color: var(--muted);

  max-width: 500px;

  line-height: 1.55;

  font-size: 14px;
}

/* INTELLIGENCE */

.intelligence {
  display: grid;

  grid-template-columns:
    repeat(2, 1fr);

  gap: 18px;
}

.intel-card {
  min-height: 210px;

  display: flex;
  align-items: center;

  gap: 20px;

  padding: 28px;

  background:
    var(--surface);

  border:
    1px solid var(--border);

  border-radius:
    var(--radius);

  box-shadow:
    var(--shadow);
}

.intel-card.featured {
  border-color:
    color-mix(
      in srgb,
      var(--accent) 35%,
      var(--border)
    );
}

.intel-icon {
  width: 52px;
  height: 52px;

  flex:
    0 0 52px;

  display: grid;
  place-items: center;

  border-radius: 15px;

  background:
    var(--surface-soft);

  font-size: 23px;
}

.intel-content {
  flex: 1;
}

.intel-kicker {
  color: var(--muted);

  font-size: 11px;
  font-weight: 850;

  letter-spacing: 1px;
}

.intel-card h3 {
  margin:
    7px 0 8px;

  font-size: 20px;

  letter-spacing: -.5px;
}

.intel-card p {
  margin: 0;

  color: var(--muted);

  font-size: 13px;

  line-height: 1.5;
}

.intel-price {
  font-size: 26px;
  font-weight: 850;
}

.intel-meta {
  margin-top: 7px;

  color: var(--muted);

  font-size: 12px;
}

.intel-meta strong {
  color: var(--text);
}

.drop-value {
  color: var(--green);

  font-size: 25px;

  font-weight: 850;
}

.intel-action {
  align-self: end;

  color: var(--accent);

  text-decoration: none;

  font-size: 13px;
  font-weight: 800;

  white-space: nowrap;
}

/* WALLETS */

.wallet-grid {
  display: grid;

  grid-template-columns:
    repeat(3, 1fr);

  gap: 18px;
}

.wallet-card {
  background:
    var(--surface);

  border:
    1px solid var(--border);

  border-radius:
    var(--radius);

  padding: 23px;

  box-shadow:
    var(--shadow);

  transition:
    transform .18s ease,
    box-shadow .18s ease,
    border-color .18s ease;
}

.wallet-card:hover {
  transform:
    translateY(-3px);

  box-shadow:
    var(--shadow-hover);
}

.wallet-card.hidden {
  display: none;
}

.wallet-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;

  gap: 12px;
}

.wallet-brand {
  color: var(--muted);

  font-size: 11px;
  font-weight: 850;

  text-transform: uppercase;

  letter-spacing: 1px;
}

.wallet-card h3 {
  margin:
    6px 0 0;

  font-size: 20px;

  letter-spacing: -.6px;
}

.affiliate-badge {
  padding:
    5px 8px;

  border-radius:
    999px;

  background:
    var(--green-soft);

  color:
    var(--green);

  font-size: 10px;

  font-weight: 850;

  white-space: nowrap;
}

.price-block {
  margin-top: 25px;
}

.price-label {
  color: var(--muted);

  font-size: 11px;

  margin-bottom: 4px;
}

.price {
  font-size: 32px;

  font-weight: 850;

  letter-spacing: -1.3px;
}

.source {
  margin-top: 5px;

  color: var(--muted);

  font-size: 11px;
}

.source strong {
  color: var(--text-soft);
}

.metrics {
  display: grid;

  grid-template-columns:
    1fr 1fr;

  gap: 9px;

  margin-top: 19px;
}

.metric {
  padding:
    12px;

  border:
    1px solid var(--border);

  border-radius:
    11px;

  background:
    var(--surface-soft);
}

.metric-label {
  display: block;

  color: var(--muted);

  font-size: 10px;

  margin-bottom: 5px;
}

.metric strong {
  font-size: 14px;
}

.score-good strong {
  color: var(--green);
}

.score-fair strong {
  color: var(--orange);
}

.score-wait strong {
  color: var(--red);
}

.status-row {
  display: flex;
  align-items: center;

  gap: 7px;

  margin-top: 14px;

  color: var(--muted);

  font-size: 12px;
}

.status-dot {
  width: 7px;
  height: 7px;

  border-radius: 50%;

  background:
    var(--muted);
}

.status-good {
  background: var(--green);
}

.status-fair {
  background: var(--orange);
}

.status-wait {
  background: var(--red);
}

.mini-history {
  margin-top: 22px;
}

.mini-history-title {
  font-size: 12px;

  font-weight: 750;

  margin-bottom: 5px;
}

.chart-wrap {
  width: 100%;
}

.chart {
  width: 100%;

  height: auto;

  display: block;
}

.chart-axis {
  stroke:
    var(--border-strong);

  stroke-width: 1;
}

.chart-line {
  fill: none;

  stroke:
    var(--accent);

  stroke-width: 3;

  stroke-linecap: round;

  stroke-linejoin: round;
}

.chart-dot {
  fill:
    var(--accent);

  stroke:
    var(--surface);

  stroke-width: 2;
}

.chart-price {
  fill:
    var(--text);

  font-size: 15px;

  font-weight: 800;
}

.chart-label,
.chart-date {
  fill:
    var(--muted);

  font-size: 11px;
}

.chart-note {
  color: var(--muted);

  font-size: 10px;

  margin-top: -5px;
}

.chart-empty {
  min-height: 115px;

  display: flex;

  flex-direction: column;

  align-items: center;

  justify-content: center;

  text-align: center;

  gap: 4px;

  border:
    1px dashed var(--border-strong);

  border-radius:
    11px;

  color:
    var(--muted);

  font-size: 11px;
}

.chart-empty-icon {
  font-size: 20px;
  margin-bottom: 2px;
}

.chart-empty strong {
  color: var(--text-soft);
}

.wallet-cta {
  display: flex;

  align-items: center;
  justify-content: space-between;

  margin-top: 18px;

  padding:
    12px 14px;

  background:
    var(--accent);

  color:
    white;

  border-radius:
    11px;

  text-decoration:
    none;

  font-size: 13px;

  font-weight: 800;
}

.wallet-cta:hover {
  filter:
    brightness(1.06);
}

.destination-note {
  margin-top: 8px;

  color: var(--muted);

  font-size: 9px;

  line-height: 1.4;

  text-align: center;
}

/* ALERT */

.alert-section {
  padding-top: 20px;
}

.alert-box {
  position: relative;

  overflow: hidden;

  padding:
    48px 30px;

  text-align: center;

  background:
    var(--surface);

  border:
    1px solid var(--border);

  border-radius:
    24px;

  box-shadow:
    var(--shadow);
}

.alert-box::before {
  content: "";

  position: absolute;

  width: 300px;
  height: 300px;

  border-radius: 50%;

  background:
    var(--accent-soft);

  filter:
    blur(50px);

  top: -180px;
  left: 50%;

  transform:
    translateX(-50%);
}

.alert-box > * {
  position: relative;
}

.alert-icon {
  font-size: 28px;
}

.alert-box h2 {
  margin:
    10px 0 10px;

  font-size: 30px;

  letter-spacing: -1px;
}

.alert-box p {
  max-width: 570px;

  margin:
    0 auto;

  color: var(--muted);

  line-height: 1.55;

  font-size: 14px;
}

.alert-form {
  max-width: 580px;

  display: flex;

  gap: 8px;

  margin:
    25px auto 0;
}

.alert-form input {
  flex: 1;

  min-width: 0;

  padding:
    13px 15px;

  border:
    1px solid var(--border);

  border-radius:
    10px;

  background:
    var(--surface-soft);

  color:
    var(--text);

  outline: none;
}

.alert-form button {
  border: 0;

  padding:
    0 18px;

  border-radius:
    10px;

  background:
    var(--accent);

  color:
    white;

  font-weight:
    800;

  cursor:
    pointer;
}

.alert-note {
  margin-top: 10px;

  color: var(--muted);

  font-size: 10px;
}

/* HOW IT WORKS */

.steps {
  display: grid;

  grid-template-columns:
    repeat(3, 1fr);

  gap: 16px;
}

.step {
  padding: 24px;

  background:
    var(--surface);

  border:
    1px solid var(--border);

  border-radius:
    var(--radius);
}

.step-number {
  width: 34px;
  height: 34px;

  display: grid;
  place-items: center;

  border-radius:
    10px;

  background:
    var(--accent-soft);

  color:
    var(--accent-text);

  font-size: 13px;

  font-weight: 850;

  margin-bottom:
    18px;
}

.step h3 {
  margin:
    0 0 7px;

  font-size: 17px;
}

.step p {
  margin: 0;

  color: var(--muted);

  font-size: 13px;

  line-height: 1.55;
}

/* FOOTER */

footer {
  margin-top:
    35px;

  padding:
    32px 0 42px;

  border-top:
    1px solid var(--border);
}

.footer-inner {
  display: flex;

  justify-content: space-between;

  gap: 30px;

  color: var(--muted);

  font-size: 11px;

  line-height: 1.6;
}

.footer-right {
  text-align: right;

  max-width: 480px;
}

/* NO RESULTS */

.no-results {
  display: none;

  padding:
    40px;

  text-align: center;

  color: var(--muted);

  border:
    1px dashed var(--border-strong);

  border-radius:
    var(--radius);
}

.no-results.visible {
  display: block;
}

/* RESPONSIVE */

@media (max-width: 950px) {

  .wallet-grid {
    grid-template-columns:
      repeat(2, 1fr);
  }

  .intelligence {
    grid-template-columns:
      1fr;
  }

  .nav {
    display: none;
  }

}

@media (max-width: 700px) {

  .container {
    width:
      min(
        100% - 28px,
        1180px
      );
  }

  .header-inner {
    min-height: 64px;
  }

  .hero {
    padding:
      65px 0 50px;
  }

  .hero h1 {
    font-size:
      clamp(40px, 13vw, 58px);

    letter-spacing:
      -2.8px;
  }

  .hero-description {
    font-size: 16px;
  }

  .search-box {
    flex-direction:
      column;

    padding: 5px;
  }

  .search-box button {
    padding:
      13px;
  }

  .stats {
    grid-template-columns:
      1fr;

    margin-bottom:
      35px;
  }

  section {
    padding:
      25px 0 45px;
  }

  .section-heading {
    display: block;
  }

  .section-title {
    font-size:
      27px;
  }

  .wallet-grid {
    grid-template-columns:
      1fr;
  }

  .steps {
    grid-template-columns:
      1fr;
  }

  .intel-card {
    align-items:
      flex-start;

    padding:
      22px;
  }

  .intel-action {
    display: none;
  }

  .alert-form {
    flex-direction:
      column;
  }

  .alert-form button {
    padding:
      13px;
  }

  .footer-inner {
    flex-direction:
      column;
  }

  .footer-right {
    text-align:
      left;
  }

}

</style>

</head>

<body>

<header>

  <div class="container header-inner">

    <a
      href="/"
      class="logo"
    >
      Wallet<span>Radar</span>
    </a>

    <nav class="nav">

      <a href="#wallets">
        Wallets
      </a>

      <a href="#history">
        Price History
      </a>

      <a href="#alerts">
        Price Alerts
      </a>

    </nav>

    <div
      class="theme-switch"
      aria-label="Theme"
    >

      <button
        type="button"
        data-theme-choice="light"
      >
        Light
      </button>

      <button
        type="button"
        data-theme-choice="system"
      >
        System
      </button>

      <button
        type="button"
        data-theme-choice="dark"
      >
        Dark
      </button>

    </div>

  </div>

</header>

<main>

  <section class="hero">

    <div class="container">

      <div class="hero-badge">

        <span class="live-dot"></span>

        Live hardware wallet price radar

      </div>

      <h1>
        Find the right wallet
        <span>at the right price.</span>
      </h1>

      <p class="hero-description">
        Compare hardware wallet prices,
        track price history and know when
        a deal is actually worth buying.
      </p>

      <div class="search-box">

        <input
          id="wallet-search"
          type="search"
          placeholder="Search hardware wallets…"
          aria-label="Search hardware wallets"
          autocomplete="off"
        >

        <button
          type="button"
          id="search-button"
        >
          Search
        </button>

      </div>

    </div>

  </section>

  <div class="container">

    <div class="stats">

      <div class="stat">

        <div class="stat-number">
          ${trackedCount}
        </div>

        <div class="stat-label">
          Wallets tracked
        </div>

      </div>

      <div class="stat">

        <div class="stat-number">
          ${historyCount}
        </div>

        <div class="stat-label">
          Price data points
        </div>

      </div>

      <div class="stat">

        <div class="stat-number">
          ${affiliateCount}
        </div>

        <div class="stat-label">
          Official purchase links
        </div>

      </div>

    </div>

  </div>

  <section>

    <div class="container">

      <div class="section-heading">

        <div>

          <div class="section-kicker">
            Price intelligence
          </div>

          <h2 class="section-title">
            What should you buy today?
          </h2>

        </div>

        <div class="section-description">
          WalletRadar turns price data into
          simple buying signals. As more
          history is collected, these signals
          become more useful.
        </div>

      </div>

      <div class="intelligence">

        ${bestDealHtml}

        ${biggestDropHtml}

      </div>

    </div>

  </section>

  <section id="wallets">

    <div class="container">

      <div class="section-heading">

        <div>

          <div class="section-kicker">
            Hardware wallets
          </div>

          <h2 class="section-title">
            Compare wallets
          </h2>

        </div>

        <div class="section-description">
          Current tracked prices, lowest recorded
          prices and Deal Score in one place.
        </div>

      </div>

      <div
        class="wallet-grid"
        id="wallet-grid"
      >

        ${cards}

      </div>

      <div
        class="no-results"
        id="no-results"
      >
        No wallet matches your search.
      </div>

    </div>

  </section>

  <section id="history">

    <div class="container">

      <div class="section-heading">

        <div>

          <div class="section-kicker">
            Price history
          </div>

          <h2 class="section-title">
            See before you buy.
          </h2>

        </div>

        <div class="section-description">
          A low price is only interesting when
          you know how it compares with the past.
        </div>

      </div>

      <div class="intelligence">

        <div class="intel-card">

          <div class="intel-icon">
            📊
          </div>

          <div class="intel-content">

            <div class="intel-kicker">
              TRACKING
            </div>

            <h3>
              Price history grows automatically
            </h3>

            <p>
              WalletRadar stores price observations
              so future Deal Scores can distinguish
              a genuinely good price from an ordinary one.
            </p>

          </div>

        </div>

        <div class="intel-card">

          <div class="intel-icon">
            🎯
          </div>

          <div class="intel-content">

            <div class="intel-kicker">
              DECISION
            </div>

            <h3>
              Buy now or wait
            </h3>

            <p>
              The goal is simple: help you make
              a better hardware-wallet purchase
              decision without guessing.
            </p>

          </div>

        </div>

      </div>

    </div>

  </section>

  <section
    id="alerts"
    class="alert-section"
  >

    <div class="container">

      <div class="alert-box">

        <div class="alert-icon">
          🔔
        </div>

        <h2>
          Never miss your target price.
        </h2>

        <p>
          Price alerts are coming next.
          Tell WalletRadar which wallet and
          target price you care about, and
          we will build the notification layer
          around the radar.
        </p>

        <form
          class="alert-form"
          id="alert-form"
        >

          <input
            type="email"
            placeholder="Your email address"
            aria-label="Email address"
            required
          >

          <button type="submit">
            Join early access
          </button>

        </form>

        <div class="alert-note">
          No emails are stored yet — this is
          currently an interface preview.
        </div>

      </div>

    </div>

  </section>

  <section>

    <div class="container">

      <div class="section-heading">

        <div>

          <div class="section-kicker">
            How it works
          </div>

          <h2 class="section-title">
            From price to decision.
          </h2>

        </div>

      </div>

      <div class="steps">

        <div class="step">

          <div class="step-number">
            01
          </div>

          <h3>
            Find your wallet
          </h3>

          <p>
            Search and compare hardware wallets
            from the manufacturers and retailers
            WalletRadar tracks.
          </p>

        </div>

        <div class="step">

          <div class="step-number">
            02
          </div>

          <h3>
            Understand the price
          </h3>

          <p>
            See the current tracked price,
            historical low and Deal Score
            instead of looking at one number
            in isolation.
          </p>

        </div>

        <div class="step">

          <div class="step-number">
            03
          </div>

          <h3>
            Buy when it makes sense
          </h3>

          <p>
            When the price is attractive,
            follow the purchase link and
            complete your order with the seller.
          </p>

        </div>

      </div>

    </div>

  </section>

</main>

<footer>

  <div class="container footer-inner">

    <div>
      © 2026 WalletRadar
    </div>

    <div class="footer-right">
      WalletRadar may earn a commission from
      qualifying purchases through affiliate links.
      Tracked prices and purchase destinations
      may come from different sources.
    </div>

  </div>

</footer>

<script>

(function () {

  const buttons =
    document.querySelectorAll(
      "[data-theme-choice]"
    );

  const media =
    window.matchMedia(
      "(prefers-color-scheme: dark)"
    );

  function getSavedTheme() {
    return (
      localStorage.getItem("wr-theme") ||
      "light"
    );
  }

  function applyTheme(choice) {

    const effective =
      choice === "system"
        ? (media.matches
            ? "dark"
            : "light")
        : choice;

    document.documentElement.dataset.theme =
      effective;

    buttons.forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.themeChoice === choice
      );
    });

  }

  buttons.forEach(button => {

    button.addEventListener(
      "click",
      function () {

        const choice =
          this.dataset.themeChoice;

        localStorage.setItem(
          "wr-theme",
          choice
        );

        applyTheme(choice);

      }
    );

  });

  media.addEventListener(
    "change",
    function () {

      if (
        getSavedTheme() === "system"
      ) {
        applyTheme("system");
      }

    }
  );

  applyTheme(
    getSavedTheme()
  );

})();

/*
 * --------------------------------------------------
 * Search
 * --------------------------------------------------
 */

(function () {

  const input =
    document.getElementById(
      "wallet-search"
    );

  const button =
    document.getElementById(
      "search-button"
    );

  const cards =
    Array.from(
      document.querySelectorAll(
        ".wallet-card"
      )
    );

  const noResults =
    document.getElementById(
      "no-results"
    );

  function runSearch() {

    const query =
      input.value
        .trim()
        .toLowerCase();

    let visible = 0;

    cards.forEach(card => {

      const text =
        card.dataset.search || "";

      const match =
        !query ||
        text.includes(query);

      card.classList.toggle(
        "hidden",
        !match
      );

      if (match) {
        visible++;
      }

    });

    noResults.classList.toggle(
      "visible",
      visible === 0
    );

    if (query) {
      document
        .getElementById("wallets")
        .scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
    }

  }

  input.addEventListener(
    "input",
    runSearch
  );

  button.addEventListener(
    "click",
    runSearch
  );

  input.addEventListener(
    "keydown",
    function (event) {

      if (
        event.key === "Enter"
      ) {
        event.preventDefault();
        runSearch();
      }

    }
  );

})();

/*
 * --------------------------------------------------
 * Alert preview
 * --------------------------------------------------
 */

(function () {

  const form =
    document.getElementById(
      "alert-form"
    );

  if (!form) {
    return;
  }

  form.addEventListener(
    "submit",
    function (event) {

      event.preventDefault();

      const button =
        form.querySelector(
          "button"
        );

      button.textContent =
        "Coming soon ✓";

      button.disabled =
        true;

      setTimeout(
        function () {

          button.textContent =
            "Join early access";

          button.disabled =
            false;

        },
        2500
      );

    }
  );

})();

</script>

</body>

</html>
  `;
}

/*
 * --------------------------------------------------
 * Trezor API diagnostics
 * --------------------------------------------------
 *
 * Kept for current testing.
 * API key is never returned.
 */

async function trezorApiTest(res) {

  const apiKey =
    process.env.TREZOR_API_KEY;

  const networkId =
    process.env.TREZOR_NETWORK_ID ||
    "trezor";

  if (!apiKey) {

    res.writeHead(500, {
      "Content-Type":
        "application/json; charset=utf-8"
    });

    res.end(
      JSON.stringify(
        {
          ok: false,
          error:
            "TREZOR_API_KEY is not configured"
        },
        null,
        2
      )
    );

    return;
  }

  const params =
    new URLSearchParams({
      api_key: apiKey,
      Target: "Affiliate_Offer",
      Method:
        "generateTrackingLink",
      offer_id: "235"
    });

  params.append(
    "params[source]",
    "walletradar"
  );

  const apiUrl =
    `https://${networkId}.api.hasoffers.com/Apiv3/json?${params.toString()}`;

  try {

    const response =
      await fetch(apiUrl);

    const data =
      await response.json();

    res.writeHead(
      response.ok ? 200 : 502,
      {
        "Content-Type":
          "application/json; charset=utf-8"
      }
    );

    res.end(
      JSON.stringify(
        {
          ok:
            response.ok &&
            data?.response?.status === 1,

          networkId,

          offerId: 235,

          httpStatus:
            response.status,

          apiStatus:
            data?.response?.status ??
            null,

          errorMessage:
            data?.response
              ?.errorMessage ??
            null,

          data:
            data?.response?.data ??
            null
        },
        null,
        2
      )
    );

  } catch (error) {

    res.writeHead(502, {
      "Content-Type":
        "application/json; charset=utf-8"
    });

    res.end(
      JSON.stringify(
        {
          ok: false,

          networkId,

          offerId: 235,

          error:
            "Trezor API request failed",

          message:
            error.message
        },
        null,
        2
      )
    );

  }

}

/*
 * --------------------------------------------------
 * Server
 * --------------------------------------------------
 */

const server =
  http.createServer(
    async (req, res) => {

      /*
       * Trezor diagnostic endpoint
       */
      if (
        req.url ===
        "/api/trezor-test"
      ) {

        await trezorApiTest(res);

        return;
      }

      /*
       * Homepage
       */
      if (
        req.url === "/" ||
        req.url === "/index.html"
      ) {

        try {

          const products =
            await loadProducts();

          res.writeHead(200, {
            "Content-Type":
              "text/html; charset=utf-8",

            "Cache-Control":
              "no-cache"
          });

          res.end(
            page(products)
          );

        } catch (error) {

          console.error(
            "Page generation error:",
            error
          );

          res.writeHead(500, {
            "Content-Type":
              "text/plain; charset=utf-8"
          });

          res.end(
            "WalletRadar error"
          );

        }

        return;
      }

      /*
       * Health check
       */
      if (
        req.url === "/health"
      ) {

        res.writeHead(200, {
          "Content-Type":
            "application/json; charset=utf-8"
        });

        res.end(
          JSON.stringify({
            ok: true,
            service: "WalletRadar"
          })
        );

        return;
      }

      /*
       * 404
       */
      res.writeHead(404, {
        "Content-Type":
          "text/plain; charset=utf-8"
      });

      res.end(
        "Not found"
      );

    }
  );

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `WalletRadar running on port ${PORT}`
    );

  }
);
