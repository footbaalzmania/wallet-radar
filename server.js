const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;

const productsData = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "products.json"),
    "utf8"
  )
);

/* -------------------------------------------------- */
/* Trezor affiliate offer IDs                        */
/* -------------------------------------------------- */

const TREZOR_OFFERS = {
  "trezor-safe-3": 169,
  "trezor-safe-5": 235
};

/* -------------------------------------------------- */
/* Affiliate cache                                   */
/* -------------------------------------------------- */

const affiliateCache = new Map();

const AFFILIATE_CACHE_MS =
  60 * 60 * 1000;

/* -------------------------------------------------- */
/* Helpers                                           */
/* -------------------------------------------------- */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function formatPrice(price, currency) {
  if (
    price === null ||
    price === undefined ||
    Number.isNaN(price)
  ) {
    return "N/A";
  }

  try {
    return new Intl.NumberFormat(
      "cs-CZ",
      {
        style: "currency",
        currency: currency || "CZK",
        maximumFractionDigits: 0
      }
    ).format(price);
  } catch {
    return `${price} ${currency || "CZK"}`;
  }
}


function getOfferSource(offer) {
  return (
    offer?.store ||
    offer?.merchant ||
    offer?.source ||
    "Tracked retailer"
  );
}


function getProductSource(product) {
  const offer = (product.offers || [])
    .find(
      item =>
        typeof item.price === "number"
    );

  return getOfferSource(offer);
}


function calculateDeal(
  currentPrice,
  history
) {
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

  const prices = history
    .map(item => item.price)
    .filter(
      price =>
        typeof price === "number"
    );

  if (!prices.length) {
    return {
      score: null,
      status: "Building price history"
    };
  }

  const lowest = Math.min(...prices);

  if (
    currentPrice === lowest
  ) {
    return {
      score: 100,
      status: "Best recorded price"
    };
  }

  if (lowest <= 0) {
    return {
      score: null,
      status: "Building price history"
    };
  }

  const aboveLowest =
    ((currentPrice - lowest) /
      lowest) *
    100;

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
          aboveLowest * 2
      )
    )
  );

  let status = "Wait";

  if (score >= 80) {
    status = "Good deal";
  } else if (score >= 50) {
    status = "Fair price";
  }

  return {
    score,
    status
  };
}


function getBestDeal(products) {
  const eligible = products.filter(
    product =>
      product.dealScore !== null
  );

  if (!eligible.length) {
    return null;
  }

  return [...eligible].sort(
    (a, b) =>
      b.dealScore -
      a.dealScore
  )[0];
}


function getBiggestDrop(products) {
  const candidates = [];

  for (const product of products) {
    const history =
      product.history || [];

    if (
      history.length < 2 ||
      product.currentPrice === null
    ) {
      continue;
    }

    const previous =
      history[
        history.length - 2
      ];

    if (
      !previous ||
      typeof previous.price !==
        "number"
    ) {
      continue;
    }

    if (
      previous.price <=
      product.currentPrice
    ) {
      continue;
    }

    const drop =
      ((previous.price -
        product.currentPrice) /
        previous.price) *
      100;

    candidates.push({
      product,
      drop
    });
  }

  if (!candidates.length) {
    return null;
  }

  return candidates.sort(
    (a, b) =>
      b.drop - a.drop
  )[0];
}


/* -------------------------------------------------- */
/* Price chart                                       */
/* -------------------------------------------------- */

function buildPriceChart(
  history,
  currency
) {
  if (
    !history ||
    history.length === 0
  ) {
    return `
      <div class="chart-empty">
        Price history will appear here
        as WalletRadar collects data.
      </div>
    `;
  }

  if (history.length === 1) {
    const point = history[0];

    return `
      <div class="chart-wrap">
        <svg
          viewBox="0 0 600 180"
          class="chart"
          role="img"
          aria-label="Price history"
        >

          <line
            x1="40"
            y1="140"
            x2="570"
            y2="140"
            class="chart-axis"
          />

          <line
            x1="40"
            y1="30"
            x2="40"
            y2="140"
            class="chart-axis"
          />

          <circle
            cx="305"
            cy="85"
            r="6"
            class="chart-point"
          />

          <text
            x="305"
            y="60"
            text-anchor="middle"
            class="chart-value"
          >
            ${formatPrice(
              point.price,
              currency
            )}
          </text>

          <text
            x="305"
            y="165"
            text-anchor="middle"
            class="chart-date"
          >
            ${escapeHtml(
              point.date
            )}
          </text>

        </svg>

        <div class="chart-note">
          Tracking started — more price
          points will appear automatically.
        </div>
      </div>
    `;
  }

  const prices = history.map(
    item => item.price
  );

  const minPrice =
    Math.min(...prices);

  const maxPrice =
    Math.max(...prices);

  const width = 600;
  const height = 180;

  const left = 40;
  const right = 30;
  const top = 25;
  const bottom = 40;

  const chartWidth =
    width - left - right;

  const chartHeight =
    height - top - bottom;

  const range =
    maxPrice - minPrice || 1;

  const points = history.map(
    (item, index) => {
      const x =
        left +
        (index /
          (history.length - 1)) *
          chartWidth;

      const y =
        top +
        (1 -
          (item.price -
            minPrice) /
            range) *
          chartHeight;

      return {
        x,
        y,
        price: item.price,
        date: item.date
      };
    }
  );

  const polyline = points
    .map(
      point =>
        `${point.x},${point.y}`
    )
    .join(" ");

  const circles = points
    .map(
      point => `
        <circle
          cx="${point.x}"
          cy="${point.y}"
          r="4"
          class="chart-point"
        />
      `
    )
    .join("");

  const first = points[0];
  const last =
    points[points.length - 1];

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
          ${formatPrice(
            maxPrice,
            currency
          )}
        </text>

        <text
          x="${left}"
          y="${height - 5}"
          class="chart-label"
        >
          ${formatPrice(
            minPrice,
            currency
          )}
        </text>

        <text
          x="${first.x}"
          y="${height - 5}"
          class="chart-date"
          text-anchor="start"
        >
          ${escapeHtml(
            first.date
          )}
        </text>

        <text
          x="${last.x}"
          y="${height - 5}"
          class="chart-date"
          text-anchor="end"
        >
          ${escapeHtml(
            last.date
          )}
        </text>

      </svg>

    </div>
  `;
}


/* -------------------------------------------------- */
/* Trezor Affiliate API                              */
/* -------------------------------------------------- */

async function generateTrezorTrackingLink(
  productSlug
) {
  const offerId =
    TREZOR_OFFERS[
      productSlug
    ];

  if (!offerId) {
    return null;
  }

  const apiKey =
    process.env.TREZOR_API_KEY;

  const networkId =
    process.env.TREZOR_NETWORK_ID ||
    "trezor";

  if (!apiKey) {
    console.log(
      "TREZOR_API_KEY is not configured."
    );

    return null;
  }

  const cached =
    affiliateCache.get(
      productSlug
    );

  if (
    cached &&
    Date.now() -
      cached.timestamp <
      AFFILIATE_CACHE_MS
  ) {
    return cached.url;
  }

  const params =
    new URLSearchParams({
      api_key: apiKey,
      Target:
        "Affiliate_Offer",
      Method:
        "generateTrackingLink",
      offer_id:
        String(offerId)
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

    if (!response.ok) {
      console.log(
        `Trezor API HTTP error: ${response.status}`
      );

      return null;
    }

    const data =
      await response.json();

    if (
      data?.response?.status !==
      1
    ) {
      console.log(
        "Trezor API error:",
        data?.response
          ?.errorMessage ||
          "Unknown error"
      );

      return null;
    }

    const clickUrl =
      data?.response?.data
        ?.click_url;

    if (!clickUrl) {
      console.log(
        "Trezor API returned no click_url."
      );

      return null;
    }

    affiliateCache.set(
      productSlug,
      {
        url: clickUrl,
        timestamp: Date.now()
      }
    );

    return clickUrl;

  } catch (error) {
    console.log(
      "Trezor affiliate request failed:",
      error.message
    );

    return null;
  }
}


/* -------------------------------------------------- */
/* Load products                                     */
/* -------------------------------------------------- */

async function loadProducts() {
  const result = [];

  for (
    const product of productsData
  ) {
    let affiliateUrl = null;

    if (
      product.brand ===
      "Trezor"
    ) {
      affiliateUrl =
        await generateTrezorTrackingLink(
          product.slug
        );
    }

    const offers =
      (product.offers || [])
        .filter(
          offer =>
            typeof offer.price ===
            "number"
        )
        .sort(
          (a, b) =>
            a.price - b.price
        );

    const bestOffer =
      offers[0] || null;

    const history =
      (product.priceHistory || [])
        .filter(
          entry =>
            typeof entry.price ===
            "number"
        )
        .sort(
          (a, b) =>
            new Date(a.date) -
            new Date(b.date)
        );

    const currentPrice =
      bestOffer?.price ??
      null;

    const lowestPrice =
      history.length
        ? Math.min(
            ...history.map(
              entry =>
                entry.price
            )
          )
        : currentPrice;

    const deal =
      calculateDeal(
        currentPrice,
        history
      );

    const currency =
      product.currency ||
      "CZK";

    const destination =
      affiliateUrl ||
      bestOffer?.affiliateUrl ||
      bestOffer?.url ||
      product.productUrl ||
      "#";

    result.push({
      brand:
        product.brand,
      name:
        product.name,
      slug:
        product.slug,
      currentPrice,
      price:
        formatPrice(
          currentPrice,
          currency
        ),
      lowestPrice:
        formatPrice(
          lowestPrice,
          currency
        ),
      lowestPriceNumber:
        lowestPrice,
      dealScore:
        deal.score,
      status:
        deal.status,
      currency,
      history,
      source:
        getProductSource(
          product
        ),
      url:
        destination,
      affiliateActive:
        Boolean(
          affiliateUrl
        )
    });
  }

  return result;
}


/* -------------------------------------------------- */
/* Trezor API diagnostic                            */
/* -------------------------------------------------- */

async function trezorApiTest(
  res
) {
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
      Target:
        "Affiliate_Offer",
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
            data?.response
              ?.status === 1,

          networkId,

          offerId:
            235,

          httpStatus:
            response.status,

          apiStatus:
            data?.response
              ?.status ??
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


/* -------------------------------------------------- */
/* Trezor Offer Files diagnostic                     */
/* -------------------------------------------------- */

async function trezorOfferFilesTest(
  res
) {
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

  const offerIds = [
    137,
    169,
    235
  ];

  const results = [];

  try {
    for (
      const offerId of offerIds
    ) {
      const params =
        new URLSearchParams({
          api_key: apiKey,
          Target:
            "Affiliate_OfferFile",
          Method:
            "findAll",
          limit: "100"
        });

      params.append(
        "filters[offer_id]",
        String(offerId)
      );

      [
        "id",
        "offer_id",
        "type",
        "filename",
        "display",
        "url",
        "status",
        "created",
        "modified"
      ].forEach(
        field => {
          params.append(
            "fields[]",
            field
          );
        }
      );

      const apiUrl =
        `https://${networkId}.api.hasoffers.com/Apiv3/json?${params.toString()}`;

      const response =
        await fetch(apiUrl);

      const data =
        await response.json();

      results.push({
        offerId,

        httpStatus:
          response.status,

        apiStatus:
          data?.response
            ?.status ??
          null,

        errorMessage:
          data?.response
            ?.errorMessage ??
          null,

        files:
          data?.response?.data ??
          []
      });
    }

    const xmlCandidates =
      results.flatMap(
        result => {
          const files =
            Array.isArray(
              result.files
            )
              ? result.files
              : [];

          return files
            .filter(
              file => {
                const text =
                  [
                    file?.type,
                    file?.filename,
                    file?.display,
                    file?.url
                  ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();

                return (
                  text.includes(
                    "xml"
                  ) ||
                  text.includes(
                    "feed"
                  )
                );
              }
            )
            .map(
              file => ({
                offerId:
                  result.offerId,

                id:
                  file.id,

                type:
                  file.type,

                filename:
                  file.filename,

                display:
                  file.display,

                url:
                  file.url,

                status:
                  file.status
              })
            );
        }
      );

    res.writeHead(200, {
      "Content-Type":
        "application/json; charset=utf-8"
    });

    res.end(
      JSON.stringify(
        {
          ok: true,

          networkId,

          offers:
            results,

          xmlCandidates
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

          error:
            "Trezor OfferFile API request failed",

          message:
            error.message
        },
        null,
        2
      )
    );
  }
}


/* -------------------------------------------------- */
/* Homepage                                          */
/* -------------------------------------------------- */

function page(products) {
  const bestDeal =
    getBestDeal(products);

  const biggestDrop =
    getBiggestDrop(products);

  const totalHistoryPoints =
    products.reduce(
      (sum, product) =>
        sum +
        product.history.length,
      0
    );

  const affiliateCount =
    products.filter(
      product =>
        product.affiliateActive
    ).length;

  const cards =
    products
      .map(
        product => `
          <article
            class="wallet-card"
            data-search="${escapeHtml(
              `${product.brand} ${product.name}`
            ).toLowerCase()}"
          >

            <div class="card-top">

              <div>
                <div class="brand">
                  ${escapeHtml(
                    product.brand
                  )}
                </div>

                <h3>
                  ${escapeHtml(
                    product.name
                  )}
                </h3>
              </div>

              ${
                product.affiliateActive
                  ? `
                    <div class="affiliate-badge">
                      Official
                    </div>
                  `
                  : ""
              }

            </div>

            <div class="price-block">

              <div class="current-price">
                ${product.price}
              </div>

              <div class="source">
                Tracked price ·
                ${escapeHtml(
                  product.source
                )}
              </div>

            </div>

            <div class="metrics">

              <div class="metric">

                <span>
                  Lowest recorded
                </span>

                <strong>
                  ${product.lowestPrice}
                </strong>

              </div>

              <div class="metric">

                <span>
                  Deal Score
                </span>

                <strong>
                  ${
                    product.dealScore !==
                    null
                      ? `${product.dealScore}/100`
                      : "—"
                  }
                </strong>

              </div>

            </div>

            <div
              class="status
                ${
                  product.status ===
                  "Good deal"
                    ? "status-good"
                    : ""
                }"
            >
              <span class="status-dot"></span>
              ${escapeHtml(
                product.status
              )}
            </div>

            <div class="history-heading">
              <span>
                Price history
              </span>

              <span>
                ${product.history.length}
                data points
              </span>
            </div>

            ${buildPriceChart(
              product.history,
              product.currency
            )}

            <a
              class="deal-button"
              href="${escapeHtml(
                product.url
              )}"
              target="_blank"
              rel="noopener sponsored"
            >
              View purchase option
              <span>→</span>
            </a>

          </article>
        `
      )
      .join("");

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
  content="Compare hardware wallet prices, track price history and discover when it is a good time to buy."
>

<script>

(function () {
  try {
    const saved =
      localStorage.getItem(
        "wr-theme"
      ) || "light";

    document.documentElement
      .setAttribute(
        "data-theme",
        saved
      );
  } catch (error) {
    document.documentElement
      .setAttribute(
        "data-theme",
        "light"
      );
  }
})();

</script>

<style>

:root {

  --bg: #f7f7f5;
  --surface: #ffffff;
  --surface-soft: #f2f2ef;

  --text: #18181b;
  --muted: #71717a;
  --border: #e4e4e7;

  --accent: #7c3aed;
  --accent-soft: #ede9fe;
  --accent-text: #5b21b6;

  --green: #15803d;
  --green-soft: #dcfce7;

  --shadow:
    0 10px 30px
    rgba(0,0,0,0.06);
}


html[data-theme="dark"] {

  --bg: #09090b;
  --surface: #18181b;
  --surface-soft: #202024;

  --text: #f4f4f5;
  --muted: #a1a1aa;
  --border: #303035;

  --accent: #a78bfa;
  --accent-soft: #2e1065;
  --accent-text: #c4b5fd;

  --green: #86efac;
  --green-soft: #052e16;

  --shadow:
    0 15px 40px
    rgba(0,0,0,0.25);
}


@media (
  prefers-color-scheme: dark
) {

  html[data-theme="system"] {

    --bg: #09090b;
    --surface: #18181b;
    --surface-soft: #202024;

    --text: #f4f4f5;
    --muted: #a1a1aa;
    --border: #303035;

    --accent: #a78bfa;
    --accent-soft: #2e1065;
    --accent-text: #c4b5fd;

    --green: #86efac;
    --green-soft: #052e16;

    --shadow:
      0 15px 40px
      rgba(0,0,0,0.25);
  }

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

  background:
    var(--bg);

  color:
    var(--text);

  transition:
    background 0.2s ease,
    color 0.2s ease;
}


a {
  color: inherit;
}


.container {

  width: min(
    1160px,
    calc(100% - 40px)
  );

  margin:
    0 auto;
}


header {

  position: sticky;
  top: 0;
  z-index: 20;

  backdrop-filter:
    blur(16px);

  background:
    color-mix(
      in srgb,
      var(--bg) 90%,
      transparent
    );

  border-bottom:
    1px solid
    var(--border);
}


.header-inner {

  min-height: 72px;

  display:
    flex;

  align-items:
    center;

  justify-content:
    space-between;

  gap: 20px;
}


.logo {

  font-size: 23px;

  font-weight: 850;

  letter-spacing:
    -1px;

  text-decoration:
    none;
}


.logo span {
  color:
    var(--accent);
}


.nav {

  display:
    flex;

  align-items:
    center;

  gap: 24px;
}


.nav a {

  color:
    var(--muted);

  text-decoration:
    none;

  font-size:
    14px;

  font-weight:
    600;
}


.nav a:hover {
  color:
    var(--text);
}


.theme-switcher {

  display:
    flex;

  gap: 3px;

  padding: 3px;

  border:
    1px solid
    var(--border);

  background:
    var(--surface);

  border-radius:
    10px;
}


.theme-button {

  border: 0;

  background:
    transparent;

  color:
    var(--muted);

  padding:
    7px 9px;

  border-radius:
    7px;

  cursor:
    pointer;

  font-size:
    12px;

  font-weight:
    700;
}


.theme-button.active {

  background:
    var(--surface-soft);

  color:
    var(--text);
}


.hero {

  padding:
    92px 0
    70px;

  text-align:
    center;
}


.hero-badge {

  display:
    inline-flex;

  align-items:
    center;

  gap: 8px;

  padding:
    7px 12px;

  border:
    1px solid
    var(--border);

  background:
    var(--surface);

  border-radius:
    999px;

  color:
    var(--accent-text);

  font-size:
    13px;

  font-weight:
    750;

  box-shadow:
    var(--shadow);
}


.hero h1 {

  max-width:
    850px;

  margin:
    22px auto 20px;

  font-size:
    clamp(
      44px,
      7vw,
      78px
    );

  line-height:
    0.98;

  letter-spacing:
    -4px;
}


.hero p {

  max-width:
    700px;

  margin:
    0 auto;

  color:
    var(--muted);

  font-size:
    19px;

  line-height:
    1.65;
}


.search {

  max-width:
    680px;

  margin:
    36px auto 0;

  display:
    flex;

  gap:
    10px;
}


.search input {

  flex:
    1;

  min-width:
    0;

  padding:
    15px 17px;

  border:
    1px solid
    var(--border);

  border-radius:
    12px;

  background:
    var(--surface);

  color:
    var(--text);

  font-size:
    15px;

  outline:
    none;
}


.search input:focus {

  border-color:
    var(--accent);

  box-shadow:
    0 0 0 3px
    var(--accent-soft);
}


.search button {

  border:
    0;

  padding:
    0 22px;

  border-radius:
    12px;

  background:
    var(--accent);

  color:
    white;

  font-weight:
    800;

  cursor:
    pointer;
}


.stats {

  display:
    grid;

  grid-template-columns:
    repeat(3, 1fr);

  gap:
    14px;

  margin:
    20px 0 55px;
}


.stat {

  padding:
    20px;

  border:
    1px solid
    var(--border);

  background:
    var(--surface);

  border-radius:
    16px;
}


.stat strong {

  display:
    block;

  font-size:
    28px;

  letter-spacing:
    -1px;
}


.stat span {

  display:
    block;

  margin-top:
    5px;

  color:
    var(--muted);

  font-size:
    13px;
}


section {
  padding:
    45px 0;
}


.section-header {

  display:
    flex;

  justify-content:
    space-between;

  align-items:
    end;

  gap:
    20px;

  margin-bottom:
    24px;
}


.section-title {

  margin:
    0;

  font-size:
    30px;

  letter-spacing:
    -1px;
}


.section-subtitle {

  margin:
    6px 0 0;

  color:
    var(--muted);

  font-size:
    14px;
}


.insights {

  display:
    grid;

  grid-template-columns:
    repeat(2, 1fr);

  gap:
    16px;

  margin-bottom:
    55px;
}


.insight {

  padding:
    24px;

  border:
    1px solid
    var(--border);

  background:
    var(--surface);

  border-radius:
    18px;

  box-shadow:
    var(--shadow);
}


.insight-label {

  color:
    var(--muted);

  font-size:
    12px;

  font-weight:
    800;

  text-transform:
    uppercase;

  letter-spacing:
    1px;
}


.insight h3 {

  margin:
    10px 0 4px;

  font-size:
    22px;
}


.insight p {

  margin:
    0;

  color:
    var(--muted);

  font-size:
    14px;
}


.wallet-grid {

  display:
    grid;

  grid-template-columns:
    repeat(3, 1fr);

  gap:
    18px;
}


.wallet-card {

  min-width:
    0;

  padding:
    22px;

  border:
    1px solid
    var(--border);

  background:
    var(--surface);

  border-radius:
    18px;

  box-shadow:
    var(--shadow);

  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease;
}


.wallet-card:hover {

  transform:
    translateY(-2px);

  box-shadow:
    0 16px 40px
    rgba(0,0,0,0.09);
}


.card-top {

  display:
    flex;

  justify-content:
    space-between;

  align-items:
    start;

  gap:
    12px;
}


.brand {

  color:
    var(--muted);

  font-size:
    11px;

  font-weight:
    800;

  text-transform:
    uppercase;

  letter-spacing:
    1px;
}


.wallet-card h3 {

  margin:
    6px 0 0;

  font-size:
    22px;

  letter-spacing:
    -0.5px;
}


.affiliate-badge {

  padding:
    5px 8px;

  border-radius:
    7px;

  background:
    var(--green-soft);

  color:
    var(--green);

  font-size:
    10px;

  font-weight:
    800;

  text-transform:
    uppercase;
}


.price-block {
  margin:
    25px 0 18px;
}


.current-price {

  font-size:
    34px;

  line-height:
    1;

  font-weight:
    850;

  letter-spacing:
    -1.5px;
}


.source {

  margin-top:
    7px;

  color:
    var(--muted);

  font-size:
    11px;
}


.metrics {

  display:
    grid;

  grid-template-columns:
    1fr 1fr;

  gap:
    8px;
}


.metric {

  padding:
    12px;

  border:
    1px solid
    var(--border);

  background:
    var(--surface-soft);

  border-radius:
    10px;
}


.metric span {

  display:
    block;

  color:
    var(--muted);

  font-size:
    10px;

  font-weight:
    700;
}


.metric strong {

  display:
    block;

  margin-top:
    4px;

  font-size:
    15px;
}


.status {

  display:
    flex;

  align-items:
    center;

  gap:
    7px;

  margin:
    15px 0;

  color:
    var(--muted);

  font-size:
    12px;

  font-weight:
    700;
}


.status-good {
  color:
    var(--green);
}


.status-dot {

  width:
    7px;

  height:
    7px;

  border-radius:
    50%;

  background:
    currentColor;
}


.history-heading {

  display:
    flex;

  justify-content:
    space-between;

  margin:
    17px 0 4px;

  color:
    var(--muted);

  font-size:
    11px;

  font-weight:
    700;
}


.chart-wrap {
  width:
    100%;
}


.chart {

  display:
    block;

  width:
    100%;

  height:
    auto;
}


.chart-axis {

  stroke:
    var(--border);

  stroke-width:
    1;
}


.chart-line {

  fill:
    none;

  stroke:
    var(--accent);

  stroke-width:
    3;

  stroke-linecap:
    round;

  stroke-linejoin:
    round;
}


.chart-point {

  fill:
    var(--accent);
}


.chart-label {

  fill:
    var(--muted);

  font-size:
    12px;
}


.chart-date {

  fill:
    var(--muted);

  font-size:
    10px;
}


.chart-value {

  fill:
    var(--text);

  font-size:
    15px;

  font-weight:
    800;
}


.chart-empty {

  min-height:
    100px;

  display:
    flex;

  align-items:
    center;

  justify-content:
    center;

  padding:
    15px;

  text-align:
    center;

  border:
    1px dashed
    var(--border);

  border-radius:
    10px;

  color:
    var(--muted);

  font-size:
    11px;
}


.chart-note {

  margin-top:
    2px;

  color:
    var(--muted);

  font-size:
    10px;

  line-height:
    1.4;
}


.deal-button {

  display:
    flex;

  align-items:
    center;

  justify-content:
    space-between;

  margin-top:
    17px;

  padding:
    12px 14px;

  border:
    1px solid
    var(--border);

  border-radius:
    10px;

  background:
    var(--surface-soft);

  color:
    var(--text);

  text-decoration:
    none;

  font-size:
    13px;

  font-weight:
    800;
}


.deal-button:hover {

  border-color:
    var(--accent);

  color:
    var(--accent);
}


.alert-box {

  padding:
    42px;

  border:
    1px solid
    var(--border);

  background:
    var(--surface);

  border-radius:
    20px;

  text-align:
    center;

  box-shadow:
    var(--shadow);
}


.alert-icon {

  width:
    48px;

  height:
    48px;

  margin:
    0 auto 15px;

  display:
    flex;

  align-items:
    center;

  justify-content:
    center;

  border-radius:
    14px;

  background:
    var(--accent-soft);

  color:
    var(--accent-text);

  font-size:
    22px;
}


.alert-box h2 {

  margin:
    0 0 10px;

  font-size:
    28px;
}


.alert-box p {

  max-width:
    620px;

  margin:
    0 auto;

  color:
    var(--muted);

  line-height:
    1.6;

  font-size:
    14px;
}


.alert-preview {

  max-width:
    580px;

  margin:
    25px auto 0;

  display:
    flex;

  gap:
    10px;
}


.alert-preview input {

  flex:
    1;

  min-width:
    0;

  padding:
    13px;

  border:
    1px solid
    var(--border);

  border-radius:
    10px;

  background:
    var(--surface);

  color:
    var(--text);
}


.alert-preview button {

  border:
    0;

  border-radius:
    10px;

  padding:
    0 17px;

  background:
    var(--surface-soft);

  color:
    var(--muted);

  font-weight:
    800;

  cursor:
    not-allowed;
}


.coming-soon {

  margin-top:
    12px;

  color:
    var(--muted);

  font-size:
    11px;
}


.how-grid {

  display:
    grid;

  grid-template-columns:
    repeat(3, 1fr);

  gap:
    16px;
}


.how-card {

  padding:
    22px;

  border:
    1px solid
    var(--border);

  background:
    var(--surface);

  border-radius:
    16px;
}


.how-number {

  color:
    var(--accent);

  font-size:
    12px;

  font-weight:
    900;

  letter-spacing:
    1px;
}


.how-card h3 {

  margin:
    9px 0 6px;

  font-size:
    18px;
}


.how-card p {

  margin:
    0;

  color:
    var(--muted);

  font-size:
    13px;

  line-height:
    1.55;
}


footer {

  margin-top:
    70px;

  border-top:
    1px solid
    var(--border);

  padding:
    30px 0;

  color:
    var(--muted);

  font-size:
    11px;

  line-height:
    1.6;
}


.footer-inner {

  display:
    flex;

  justify-content:
    space-between;

  gap:
    20px;
}


@media (
  max-width: 900px
) {

  .wallet-grid {
    grid-template-columns:
      1fr 1fr;
  }

  .nav {
    display:
      none;
  }

}


@media (
  max-width: 650px
) {

  .container {
    width:
      min(
        100% - 28px,
        1160px
      );
  }

  .hero {
    padding:
      65px 0 45px;
  }

  .hero h1 {
    letter-spacing:
      -2.5px;
  }

  .hero p {
    font-size:
      16px;
  }

  .search {
    flex-direction:
      column;
  }

  .search button {
    padding:
      14px;
  }

  .stats {
    grid-template-columns:
      1fr;
  }

  .insights {
    grid-template-columns:
      1fr;
  }

  .wallet-grid {
    grid-template-columns:
      1fr;
  }

  .how-grid {
    grid-template-columns:
      1fr;
  }

  .alert-preview {
    flex-direction:
      column;
  }

  .alert-preview button {
    padding:
      13px;
  }

  .footer-inner {
    flex-direction:
      column;
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
      class="theme-switcher"
      aria-label="Theme"
    >

      <button
        class="theme-button"
        data-theme-choice="light"
      >
        Light
      </button>

      <button
        class="theme-button"
        data-theme-choice="system"
      >
        System
      </button>

      <button
        class="theme-button"
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
      <span>◉</span>
      Live hardware wallet price radar
    </div>

    <h1>
      Find the right wallet
      at the right price.
    </h1>

    <p>
      WalletRadar tracks hardware wallet
      prices, builds price history and helps
      you decide whether today is a good day
      to buy.
    </p>

    <div class="search">

      <input
        id="wallet-search"
        type="search"
        placeholder="Search hardware wallets..."
        aria-label="Search hardware wallets"
      >

      <button
        id="search-button"
        type="button"
      >
        Search
      </button>

    </div>

  </div>

</section>


<section>

  <div class="container">

    <div class="stats">

      <div class="stat">

        <strong>
          ${products.length}
        </strong>

        <span>
          Wallets tracked
        </span>

      </div>

      <div class="stat">

        <strong>
          ${totalHistoryPoints}
        </strong>

        <span>
          Price data points
        </span>

      </div>

      <div class="stat">

        <strong>
          ${affiliateCount}
        </strong>

        <span>
          Official purchase links
        </span>

      </div>

    </div>


    <div class="section-header">

      <div>

        <h2 class="section-title">
          What should you buy today?
        </h2>

        <p class="section-subtitle">
          WalletRadar intelligence based on
          the price data currently available.
        </p>

      </div>

    </div>


    <div class="insights">

      <div class="insight">

        <div class="insight-label">
          Best Deal
        </div>

        ${
          bestDeal
            ? `
              <h3>
                ${escapeHtml(
                  bestDeal.name
                )}
              </h3>

              <p>
                Deal Score
                <strong>
                  ${bestDeal.dealScore}/100
                </strong>
                · ${escapeHtml(
                  bestDeal.status
                )}
              </p>
            `
            : `
              <h3>
                Building the radar
              </h3>

              <p>
                We need more historical
                price points before this
                signal becomes meaningful.
              </p>
            `
        }

      </div>


      <div class="insight">

        <div class="insight-label">
          Biggest Recent Price Drop
        </div>

        ${
          biggestDrop
            ? `
              <h3>
                ${escapeHtml(
                  biggestDrop.product.name
                )}
              </h3>

              <p>
                Down
                <strong>
                  ${biggestDrop.drop.toFixed(1)}%
                </strong>
                versus the previous
                recorded price.
              </p>
            `
            : `
              <h3>
                No recent drop detected
              </h3>

              <p>
                WalletRadar will surface this
                signal as new price data arrives.
              </p>
            `
        }

      </div>

    </div>

  </div>

</section>


<section id="wallets">

  <div class="container">

    <div class="section-header">

      <div>

        <h2 class="section-title">
          Popular wallets
        </h2>

        <p class="section-subtitle">
          Current tracked prices and
          historical signals.
        </p>

      </div>

    </div>


    <div
      id="wallet-grid"
      class="wallet-grid"
    >

      ${cards}

    </div>

  </div>

</section>


<section id="history">

  <div class="container">

    <div class="section-header">

      <div>

        <h2 class="section-title">
          Price History
        </h2>

        <p class="section-subtitle">
          The more WalletRadar observes,
          the more useful these signals become.
        </p>

      </div>

    </div>

    <div class="how-grid">

      <div class="how-card">

        <div class="how-number">
          01
        </div>

        <h3>
          Current price
        </h3>

        <p>
          We display the latest tracked
          price available to WalletRadar.
        </p>

      </div>


      <div class="how-card">

        <div class="how-number">
          02
        </div>

        <h3>
          Historical low
        </h3>

        <p>
          WalletRadar keeps historical
          observations so today's price
          can be put into context.
        </p>

      </div>


      <div class="how-card">

        <div class="how-number">
          03
        </div>

        <h3>
          Deal Score
        </h3>

        <p>
          As enough history accumulates,
          WalletRadar can estimate whether
          today's price looks attractive.
        </p>

      </div>

    </div>

  </div>

</section>


<section id="alerts">

  <div class="container">

    <div class="alert-box">

      <div class="alert-icon">
        🔔
      </div>

      <h2>
        Never miss a price drop.
      </h2>

      <p>
        Set your target price and WalletRadar
        will notify you when your preferred
        wallet reaches it.
      </p>

      <div class="alert-preview">

        <input
          type="email"
          placeholder="Your email address"
          disabled
        >

        <button
          type="button"
          disabled
        >
          Set price alert
        </button>

      </div>

      <div class="coming-soon">
        Price Alerts · Coming next
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

    <div>
      WalletRadar may receive affiliate
      commission from qualifying purchases.
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

  function getTheme() {
    return (
      localStorage.getItem(
        "wr-theme"
      ) || "light"
    );
  }

  function applyTheme(theme) {

    document.documentElement
      .setAttribute(
        "data-theme",
        theme
      );

    buttons.forEach(
      button => {
        button.classList.toggle(
          "active",
          button.dataset.themeChoice ===
            theme
        );
      }
    );
  }

  buttons.forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          const theme =
            button.dataset
              .themeChoice;

          localStorage.setItem(
            "wr-theme",
            theme
          );

          applyTheme(theme);
        }
      );

    }
  );

  media.addEventListener(
    "change",
    () => {

      if (
        getTheme() ===
        "system"
      ) {
        applyTheme("system");
      }

    }
  );

  applyTheme(
    getTheme()
  );

})();


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

  function search() {

    const query =
      input.value
        .trim()
        .toLowerCase();

    cards.forEach(
      card => {

        const text =
          card.dataset.search ||
          "";

        card.style.display =
          !query ||
          text.includes(query)
            ? ""
            : "none";
      }
    );

  }

  input.addEventListener(
    "input",
    search
  );

  button.addEventListener(
    "click",
    search
  );

  input.addEventListener(
    "keydown",
    event => {

      if (
        event.key ===
        "Enter"
      ) {
        search();
      }

    }
  );

})();

</script>

</body>

</html>
`;
}


/* -------------------------------------------------- */
/* Server                                           */
/* -------------------------------------------------- */

const server =
  http.createServer(
    async (req, res) => {

      const url =
        new URL(
          req.url,
          `http://${req.headers.host || "localhost"}`
        );

      /* -------------------------------------------- */
      /* Health                                       */
      /* -------------------------------------------- */

      if (
        url.pathname ===
        "/health"
      ) {

        res.writeHead(200, {
          "Content-Type":
            "application/json; charset=utf-8"
        });

        res.end(
          JSON.stringify({
            ok: true,
            service:
              "WalletRadar"
          })
        );

        return;
      }


      /* -------------------------------------------- */
      /* Trezor API test                             */
      /* -------------------------------------------- */

      if (
        url.pathname ===
        "/api/trezor-test"
      ) {

        await trezorApiTest(
          res
        );

        return;
      }


      /* -------------------------------------------- */
      /* Trezor Offer Files test                     */
      /* -------------------------------------------- */

      if (
        url.pathname ===
        "/api/trezor-files"
      ) {

        await trezorOfferFilesTest(
          res
        );

        return;
      }


      /* -------------------------------------------- */
      /* Homepage                                    */
      /* -------------------------------------------- */

      if (
        url.pathname === "/" ||
        url.pathname ===
          "/index.html"
      ) {

        try {

          const products =
            await loadProducts();

          res.writeHead(200, {
            "Content-Type":
              "text/html; charset=utf-8"
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


      /* -------------------------------------------- */
      /* 404                                         */
      /* -------------------------------------------- */

      res.writeHead(404, {
        "Content-Type":
          "text/plain; charset=utf-8"
      });

      res.end(
        "Not found"
      );

    }
  );


/* -------------------------------------------------- */
/* Start                                            */
/* -------------------------------------------------- */

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `WalletRadar running on port ${PORT}`
    );
  }
);
