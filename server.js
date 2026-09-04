const http = require("http");

const PORT = process.env.PORT || 3000;

const fs = require("fs");
const path = require("path");

const productsData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "products.json"), "utf8")
);

function formatPrice(price, currency) {
  if (price === null || price === undefined) {
    return "N/A";
  }

  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: currency || "CZK"
  }).format(price);
}

function buildPriceChart(history, currency) {
  if (!history || history.length === 0) {
    return `
      <div class="chart-empty">
        Price history will appear here as WalletRadar collects data.
      </div>
    `;
  }

  if (history.length === 1) {
    const point = history[0];

    return `
      <div class="chart-wrap">
        <svg viewBox="0 0 600 180" class="chart" role="img"
             aria-label="Price history">
          <line x1="40" y1="140" x2="570" y2="140"
                stroke="#27272a" stroke-width="1"/>
          <line x1="40" y1="30" x2="40" y2="140"
                stroke="#27272a" stroke-width="1"/>

          <circle cx="305" cy="85" r="6"
                  fill="#a78bfa"/>

          <text x="305" y="60"
                text-anchor="middle"
                fill="#f4f4f5"
                font-size="15"
                font-weight="700">
            ${formatPrice(point.price, currency)}
          </text>

          <text x="305" y="165"
                text-anchor="middle"
                fill="#71717a"
                font-size="12">
            ${point.date}
          </text>
        </svg>

        <div class="chart-note">
          📊 Tracking started — more price points will appear automatically.
        </div>
      </div>
    `;
  }

  const prices = history.map(item => item.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  const width = 600;
  const height = 180;
  const left = 40;
  const right = 30;
  const top = 25;
  const bottom = 40;

  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;

  const range = maxPrice - minPrice || 1;

  const points = history.map((item, index) => {
    const x = left + (index / (history.length - 1)) * chartWidth;

    const y =
      top +
      (1 - (item.price - minPrice) / range) * chartHeight;

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
    .map(point => `
      <circle
        cx="${point.x}"
        cy="${point.y}"
        r="4"
        fill="#a78bfa"
      />
    `)
    .join("");

  const first = points[0];
  const last = points[points.length - 1];

  return `
    <div class="chart-wrap">
      <svg viewBox="0 0 ${width} ${height}"
           class="chart"
           role="img"
           aria-label="Price history">

        <line
          x1="${left}"
          y1="${height - bottom}"
          x2="${width - right}"
          y2="${height - bottom}"
          stroke="#27272a"
          stroke-width="1"
        />

        <line
          x1="${left}"
          y1="${top}"
          x2="${left}"
          y2="${height - bottom}"
          stroke="#27272a"
          stroke-width="1"
        />

        <polyline
          points="${polyline}"
          fill="none"
          stroke="#a78bfa"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        ${circles}

        <text
          x="${left}"
          y="17"
          fill="#71717a"
          font-size="12"
        >
          ${formatPrice(maxPrice, currency)}
        </text>

        <text
          x="${left}"
          y="${height - 5}"
          fill="#71717a"
          font-size="12"
        >
          ${formatPrice(minPrice, currency)}
        </text>

        <text
          x="${first.x}"
          y="${height - 5}"
          fill="#71717a"
          font-size="11"
          text-anchor="start"
        >
          ${first.date}
        </text>

        <text
          x="${last.x}"
          y="${height - 5}"
          fill="#71717a"
          font-size="11"
          text-anchor="end"
        >
          ${last.date}
        </text>
      </svg>
    </div>
  `;
}

const products = productsData.map((product) => {
  const offers = (product.offers || [])
    .filter((offer) => typeof offer.price === "number")
    .sort((a, b) => a.price - b.price);

  const bestOffer = offers[0];

  const history = (product.priceHistory || [])
    .filter((entry) => typeof entry.price === "number")
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const currentPrice = bestOffer?.price ?? null;

  const lowestPrice = history.length
    ? Math.min(...history.map((entry) => entry.price))
    : currentPrice;

  let dealScore = null;
  let status = "Tracking started";

  if (currentPrice !== null && lowestPrice !== null) {
    if (currentPrice === lowestPrice) {
      dealScore = 100;
      status = "Best recorded price";
    } else if (lowestPrice > 0) {
      const aboveLowest =
        ((currentPrice - lowestPrice) / lowestPrice) * 100;

      dealScore = Math.max(
        0,
        Math.round(100 - aboveLowest * 2)
      );

      if (dealScore >= 80) {
        status = "Good deal";
      } else if (dealScore >= 50) {
        status = "Fair price";
      } else {
        status = "Wait";
      }
    }
  }

  const currency = product.currency || "CZK";

  return {
    brand: product.brand,
    name: product.name,
    price: formatPrice(currentPrice, currency),
    lowestPrice: formatPrice(lowestPrice, currency),
    dealScore,
    status,
    currency,
    history,
    url: bestOffer?.url || "#"
  };
});


/*
 * Trezor Affiliate API test
 *
 * Uses:
 *   TREZOR_API_KEY
 *   TREZOR_NETWORK_ID
 *
 * The API key is never hard-coded into the source code.
 *
 * This test generates a tracking link for:
 *   Trezor Safe 5
 *   Offer ID: 235
 */

async function trezorApiTest(res) {
  const apiKey = process.env.TREZOR_API_KEY;
  const networkId = process.env.TREZOR_NETWORK_ID || "trezor";

  if (!apiKey) {
    res.writeHead(500, {
      "Content-Type": "application/json; charset=utf-8"
    });

    res.end(JSON.stringify({
      ok: false,
      error: "TREZOR_API_KEY is not configured"
    }));

    return;
  }

  const params = new URLSearchParams({
    api_key: apiKey,
    Target: "Affiliate_Offer",
    Method: "generateTrackingLink",
    offer_id: "235"
  });

  params.append("params[source]", "walletradar");

  const apiUrl =
    `https://${networkId}.api.hasoffers.com/Apiv3/json?${params.toString()}`;

  try {
    const response = await fetch(apiUrl);
    const data = await response.json();

    res.writeHead(response.ok ? 200 : 502, {
      "Content-Type": "application/json; charset=utf-8"
    });

    res.end(JSON.stringify({
      ok: response.ok && data?.response?.status === 1,
      networkId,
      offerId: 235,
      httpStatus: response.status,
      apiStatus: data?.response?.status ?? null,
      errorMessage: data?.response?.errorMessage ?? null,
      data: data?.response?.data ?? null
    }, null, 2));

  } catch (error) {
    res.writeHead(502, {
      "Content-Type": "application/json; charset=utf-8"
    });

    res.end(JSON.stringify({
      ok: false,
      networkId,
      offerId: 235,
      error: "Trezor API request failed",
      message: error.message
    }, null, 2));
  }
}


function page() {
  const cards = products.map(product => `
    <article class="card">

      <div class="brand">${product.brand}</div>

      <h2>${product.name}</h2>

      <div class="price">${product.price}</div>

      <div class="lowest">
        Lowest recorded: <strong>${product.lowestPrice}</strong>
      </div>

      <div class="score-row">

        <div class="score">

          <span>Deal Score</span>

          <strong>
            ${product.dealScore !== null
              ? product.dealScore + "/100"
              : "—"}
          </strong>

        </div>

        <div class="deal">
          ✓ ${product.status}
        </div>

      </div>

      <div class="history-title">
        📈 Price history
      </div>

      ${buildPriceChart(product.history, product.currency)}

      <a href="${product.url}"
         target="_blank"
         rel="noopener">
        View deal →
      </a>

    </article>
  `).join("");

  return `<!DOCTYPE html>

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
  content="Track hardware wallet prices, compare deals and get notified when your preferred wallet reaches your target price."
>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Inter, Arial, sans-serif;
  background: #09090b;
  color: #f4f4f5;
}

.container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 24px;
}

header {
  border-bottom: 1px solid #27272a;
  padding: 22px 0;
}

.logo {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -1px;
}

.logo span {
  color: #a78bfa;
}

.hero {
  padding: 90px 0 65px;
  text-align: center;
}

.badge {
  display: inline-block;
  border: 1px solid #3f3f46;
  background: #18181b;
  border-radius: 999px;
  padding: 8px 14px;
  color: #c4b5fd;
  font-size: 14px;
  margin-bottom: 24px;
}

h1 {
  font-size: clamp(42px, 7vw, 76px);
  line-height: 0.98;
  letter-spacing: -4px;
  margin: 0 auto 24px;
  max-width: 850px;
}

.hero p {
  color: #a1a1aa;
  font-size: 20px;
  line-height: 1.6;
  max-width: 680px;
  margin: auto;
}

.search {
  margin: 40px auto 0;
  max-width: 650px;
  display: flex;
  gap: 10px;
}

.search input {
  flex: 1;
  padding: 17px 20px;
  border-radius: 12px;
  border: 1px solid #3f3f46;
  background: #18181b;
  color: white;
  font-size: 16px;
}

.search button {
  padding: 17px 24px;
  border: 0;
  border-radius: 12px;
  background: #a78bfa;
  color: #18181b;
  font-weight: 800;
  cursor: pointer;
}

section {
  padding: 45px 0;
}

.section-title {
  font-size: 30px;
  margin-bottom: 25px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.card {
  background: #18181b;
  border: 1px solid #27272a;
  border-radius: 18px;
  padding: 26px;
}

.brand {
  color: #a1a1aa;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.card h2 {
  margin: 8px 0 20px;
  font-size: 25px;
}

.price {
  font-size: 36px;
  font-weight: 800;
  margin-bottom: 6px;
}

.lowest {
  color: #a1a1aa;
  font-size: 14px;
  margin-bottom: 20px;
}

.lowest strong {
  color: #f4f4f5;
}

.score-row {
  margin-bottom: 22px;
}

.score {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-radius: 12px;
  background: #09090b;
  border: 1px solid #27272a;
  margin-bottom: 12px;
}

.score span {
  color: #a1a1aa;
  font-size: 13px;
}

.score strong {
  color: #c4b5fd;
  font-size: 18px;
}

.deal {
  color: #86efac;
  font-size: 14px;
}

.history-title {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 8px;
}

.chart-wrap {
  width: 100%;
  margin-bottom: 12px;
}

.chart {
  width: 100%;
  height: auto;
  display: block;
}

.chart-empty {
  min-height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: #71717a;
  font-size: 13px;
  border: 1px dashed #3f3f46;
  border-radius: 12px;
  margin-bottom: 12px;
}

.chart-note {
  color: #71717a;
  font-size: 12px;
  line-height: 1.4;
  margin-bottom: 12px;
}

.card a {
  color: #c4b5fd;
  text-decoration: none;
  font-weight: 700;
}

.alert {
  background: #18181b;
  border: 1px solid #3f3f46;
  border-radius: 20px;
  padding: 40px;
  text-align: center;
  margin-top: 25px;
}

.alert h2 {
  margin-top: 0;
  font-size: 30px;
}

.alert p {
  color: #a1a1aa;
  line-height: 1.6;
}

footer {
  border-top: 1px solid #27272a;
  margin-top: 70px;
  padding: 30px 0;
  color: #71717a;
  font-size: 14px;
}

@media (max-width: 750px) {

  .grid {
    grid-template-columns: 1fr;
  }

  .search {
    flex-direction: column;
  }

  h1 {
    letter-spacing: -2px;
  }

}

</style>

</head>

<body>

<header>

  <div class="container">

    <div class="logo">
      Wallet<span>Radar</span>
    </div>

  </div>

</header>

<main>

<section class="hero">

  <div class="container">

    <div class="badge">
      🔎 Hardware wallet price radar
    </div>

    <h1>
      Find the right wallet at the right price.
    </h1>

    <p>
      Compare hardware wallet prices, discover good deals
      and get alerted when your preferred wallet drops
      to your target price.
    </p>

    <div class="search">

      <input
        type="text"
        placeholder="Search hardware wallets..."
        aria-label="Search hardware wallets"
      >

      <button>
        Search
      </button>

    </div>

  </div>

</section>

<section>

  <div class="container">

    <div class="section-title">
      🔥 Popular wallets
    </div>

    <div class="grid">
      ${cards}
    </div>

    <div class="alert">

      <h2>
        Never miss a price drop.
      </h2>

      <p>
        Set your target price and WalletRadar will notify you
        when the wallet becomes available at your price.
      </p>

      <div class="search">

        <input
          type="email"
          placeholder="Your email address"
        >

        <button>
          Set price alert
        </button>

      </div>

    </div>

  </div>

</section>

</main>

<footer>

  <div class="container">
    © 2026 WalletRadar · Price information is for demonstration purposes.
  </div>

</footer>

</body>

</html>`;
}


const server = http.createServer(async (req, res) => {

  /*
   * Temporary Trezor API test endpoint.
   */
  if (req.url === "/api/trezor-test") {
    await trezorApiTest(res);
    return;
  }

  if (req.url === "/" || req.url === "/index.html") {

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8"
    });

    res.end(page());

    return;
  }

  res.writeHead(404, {
    "Content-Type": "text/plain; charset=utf-8"
  });

  res.end("Not found");
});


server.listen(PORT, "0.0.0.0", () => {

  console.log(
    `WalletRadar running on port ${PORT}`
  );

});
