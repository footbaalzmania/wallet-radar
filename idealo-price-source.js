const fs = require("fs");
const path = require("path");

const productsPath = path.join(__dirname, "products.json");
const READER_BASE = String(process.env.PRICE_READER_BASE_URL || "https://r.jina.ai/").replace(/\/+$/, "") + "/";
const INTERVAL_MS = 6 * 60 * 60 * 1000;

const PRODUCTS = {
  "trezor-safe-3": {
    name: "Trezor Safe 3",
    url: "https://www.idealo.de/preisvergleich/OffersOfProduct/205145125_-safe-3-trezor.html",
    min: 40,
    max: 150,
  },
  "trezor-safe-5": {
    name: "Trezor Safe 5",
    url: "https://www.idealo.de/preisvergleich/OffersOfProduct/206151813_-safe-5-trezor.html",
    min: 80,
    max: 220,
  },
  "trezor-safe-7": {
    name: "Trezor Safe 7",
    url: "https://www.idealo.de/preisvergleich/OffersOfProduct/209319953_-trezor-safe-7-trezor.html",
    min: 150,
    max: 400,
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

function extractProductPrice(text, config) {
  const source = String(text || "")
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/\r/g, "");

  const productIndex = source.toLowerCase().indexOf(config.name.toLowerCase());
  if (productIndex < 0) return null;

  // The reliable Idealo product-summary format is:
  //   ## 3 Varianten ab 119,00 €
  // Keep the search very close to the product heading and only accept the
  // first summary price. This avoids later offer prices from being selected.
  const section = source.slice(productIndex, productIndex + 500);
  const match = section.match(/(?:^|\n)#+\s*[^\n]*\bab\s+([0-9]{1,3}(?:[.,][0-9]{2})?)\s*€/i);
  if (!match) return null;

  const price = Number(String(match[1]).replace(",", "."));
  if (!Number.isFinite(price) || price < config.min || price > config.max) return null;
  return price;
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

  let changed = false;

  for (const [slug, config] of Object.entries(PRODUCTS)) {
    const product = products.find((item) => item.slug === slug);
    if (!product) continue;

    try {
      const text = await fetchReader(config.url);
      const price = extractProductPrice(text, config);
      if (!Number.isFinite(price)) {
        console.log(`Idealo: ${config.name} valid minimum price not found`);
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
