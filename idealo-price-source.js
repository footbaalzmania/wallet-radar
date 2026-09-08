const fs = require("fs");
const path = require("path");

const productsPath = path.join(__dirname, "products.json");
const READER_BASE = String(process.env.PRICE_READER_BASE_URL || "https://r.jina.ai/").replace(/\/+$/, "") + "/";
const INTERVAL_MS = 6 * 60 * 60 * 1000;

const PRODUCTS = {
  "trezor-safe-3": {
    name: "Trezor Safe 3",
    url: "https://www.idealo.de/preisvergleich/OffersOfProduct/205145125_-safe-3-trezor.html",
  },
  "trezor-safe-5": {
    name: "Trezor Safe 5",
    url: "https://www.idealo.de/preisvergleich/OffersOfProduct/206151813_-safe-5-trezor.html",
  },
  "trezor-safe-7": {
    name: "Trezor Safe 7",
    url: "https://www.idealo.de/preisvergleich/OffersOfProduct/209319953_-trezor-safe-7-trezor.html",
  },
};

function loadProducts() {
  try { return JSON.parse(fs.readFileSync(productsPath, "utf8")); }
  catch (err) { console.error("Idealo: failed to load products.json:", err.message); return null; }
}

function saveProducts(products) {
  try {
    fs.writeFileSync(productsPath, JSON.stringify(products, null, 2) + "\n", "utf8");
    return true;
  } catch (err) {
    console.error("Idealo: failed to save products.json:", err.message);
    return false;
  }
}

function extractLowestPrice(text) {
  const source = String(text || "").replace(/[\u00a0\u202f]/g, " ");
  const matches = [...source.matchAll(/(?:ab|günstigster\s+preis)\s*([0-9]{1,3}(?:[.,][0-9]{2})?)\s*€/gi)];
  const prices = matches
    .map((m) => Number(String(m[1]).replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n >= 20 && n <= 500);
  return prices.length ? Math.min(...prices) : null;
}

async function fetchReader(url) {
  const response = await fetch(READER_BASE + url, {
    headers: {
      "User-Agent": "CryptoWalletRadar/1.0",
      Accept: "text/plain,text/html;q=0.9,*/*;q=0.8",
    },
  });
  if (!response.ok) throw new Error(`Reader returned HTTP ${response.status}`);
  return response.text();
}

async function updateIdealo() {
  const products = loadProducts();
  if (!Array.isArray(products)) return;

  // Keep the latest ECB rate already stored by the normal collector.
  let changed = false;

  for (const [slug, config] of Object.entries(PRODUCTS)) {
    const product = products.find((item) => item.slug === slug);
    if (!product) continue;

    try {
      const text = await fetchReader(config.url);
      const price = extractLowestPrice(text);
      if (!Number.isFinite(price)) {
        console.log(`Idealo: ${config.name} price not found`);
        continue;
      }

      if (!Array.isArray(product.offers)) product.offers = [];
      let offer = product.offers.find((item) => String(item.store || "").toLowerCase() === "idealo");

      if (!offer) {
        offer = {
          store: "Idealo",
          price,
          currency: "EUR",
          priceSource: "automatic",
          affiliateUrl: null,
          url: config.url,
        };
        product.offers.push(offer);
        changed = true;
      } else {
        if (Number(offer.price) !== price) { offer.price = price; changed = true; }
        if (offer.currency !== "EUR") { offer.currency = "EUR"; changed = true; }
        if (offer.priceSource !== "automatic") { offer.priceSource = "automatic"; changed = true; }
        if (offer.url !== config.url) { offer.url = config.url; changed = true; }
      }

      console.log(`Idealo: ${config.name} = ${price.toFixed(2)} EUR`);
    } catch (err) {
      console.error(`Idealo: ${config.name} update failed:`, err.message);
    }
  }

  if (changed && saveProducts(products)) {
    console.log("Idealo price update saved to products.json");
  } else if (!changed) {
    console.log("Idealo price update: no changes");
  }
}

setTimeout(updateIdealo, 10000);
setInterval(updateIdealo, INTERVAL_MS);
