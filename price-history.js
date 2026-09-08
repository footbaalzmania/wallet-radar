const fs = require("fs");
const path = require("path");

/*
  Price history collector.

  Sources:
  - Alza: refreshed by server.js every 6 hours.
  - Heureka: refreshed here every 6 hours.

  Official Trezor prices remain separate from market prices.
*/

const productsPath = path.join(__dirname, "products.json");
const INTERVAL_MS = 6 * 60 * 60 * 1000;

const HEUREKA_PRODUCTS = {
  "trezor-safe-3": {
    name: "Trezor Safe 3",
    url: "https://hardwarove-penezenky-a-trezory.heureka.cz/trezor-safe-3-stellar-silver/",
  },
  "trezor-safe-5": {
    name: "Trezor Safe 5",
    url: "https://hardwarove-penezenky-a-trezory.heureka.cz/trezor-safe-5-black-graphite/",
  },
  "trezor-safe-7": {
    name: "Trezor Safe 7",
    url: "https://hardwarove-penezenky-a-trezory.heureka.cz/trezor-safe-7-charcoal-black/",
  },
};

function loadProducts() {
  try {
    return JSON.parse(fs.readFileSync(productsPath, "utf8"));
  } catch (err) {
    console.error("Price history: failed to load products.json:", err.message);
    return null;
  }
}

function saveProducts(products) {
  try {
    fs.writeFileSync(
      productsPath,
      JSON.stringify(products, null, 2) + "\n",
      "utf8"
    );
    return true;
  } catch (err) {
    console.error("Price history: failed to save products.json:", err.message);
    return false;
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function timestamp() {
  return new Date().toISOString();
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

function extractHeurekaPrice(text) {
  const match = String(text || "").match(
    /\bod\s+([\d .]{3,12})\s*Kč\b/i
  );

  if (!match) return null;

  const price = Number(String(match[1]).replace(/[ .]/g, ""));
  return Number.isFinite(price) && price > 0 ? price : null;
}

async function fetchHeurekaPrice(config) {
  const response = await fetch(config.url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; CryptoWalletRadar/1.0; +https://cryptowalletradar.com)",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Heureka returned HTTP ${response.status}`);
  }

  const html = await response.text();
  return extractHeurekaPrice(stripHtml(html));
}

async function updateHeurekaOffers(products) {
  let changed = false;

  for (const [slug, config] of Object.entries(HEUREKA_PRODUCTS)) {
    const product = products.find((item) => item.slug === slug);
    if (!product) continue;

    try {
      const price = await fetchHeurekaPrice(config);

      if (!Number.isFinite(price)) {
        console.log(`Heureka: ${config.name} price not found`);
        continue;
      }

      if (!Array.isArray(product.offers)) {
        product.offers = [];
      }

      let offer = product.offers.find(
        (item) => String(item.store || "").toLowerCase() === "heureka"
      );

      if (!offer) {
        offer = {
          store: "Heureka",
          price,
          currency: "CZK",
          priceSource: "automatic",
          affiliateUrl: null,
          url: config.url,
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
        if (offer.url !== config.url) {
          offer.url = config.url;
          changed = true;
        }
      }

      console.log(`Heureka: ${config.name} = ${price} CZK`);
    } catch (err) {
      console.error(`Heureka: ${config.name} update failed:`, err.message);
    }
  }

  return changed;
}

function collectPriceHistory(products) {
  const date = today();
  const now = timestamp();
  let changed = false;

  for (const product of products) {
    if (!Array.isArray(product.offers) || !product.offers.length) continue;

    if (!Array.isArray(product.priceHistory)) {
      product.priceHistory = [];
    }

    for (const offer of product.offers) {
      const price = Number(offer?.price);
      if (!Number.isFinite(price) || price <= 0) continue;

      const store = String(offer.store || "Market");
      const currency = offer.currency || product.currency || "CZK";

      const sameStoreToday = product.priceHistory.find(
        (entry) =>
          entry &&
          entry.date === date &&
          String(entry.store || "").toLowerCase() === store.toLowerCase()
      );

      if (sameStoreToday && Number(sameStoreToday.price) === price) {
        continue;
      }

      product.priceHistory.push({
        date,
        timestamp: now,
        price,
        currency,
        store,
        priceSource: offer.priceSource || "automatic",
      });

      changed = true;
    }

    product.priceHistory.sort((a, b) =>
      String(a.timestamp || a.date).localeCompare(
        String(b.timestamp || b.date)
      )
    );
  }

  return changed;
}

async function runCollector() {
  const products = loadProducts();
  if (!Array.isArray(products)) return;

  let changed = await updateHeurekaOffers(products);
  changed = collectPriceHistory(products) || changed;

  if (changed && saveProducts(products)) {
    console.log(`Price history: observation saved for ${today()}`);
  } else if (!changed) {
    console.log(`Price history: no new observations for ${today()}`);
  }
}

setTimeout(runCollector, 8000);
setInterval(runCollector, INTERVAL_MS);
