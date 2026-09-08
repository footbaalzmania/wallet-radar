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

function parsePrice(value) {
  const price = Number(String(value).replace(",", "."));
  return Number.isFinite(price) ? price : null;
}

function validPrice(value, config) {
  return Number.isFinite(value) && value >= config.min && value <= config.max;
}

function findProductSection(source, config) {
  const escapedName = config.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const heading = new RegExp(`#\\s*(?:Trezor\\s+)?${escapedName}\\b`, "i").exec(source);
  if (!heading) return null;

  const start = heading.index;
  const top10 = source.toLowerCase().indexOf("top 10 produkte", start + heading[0].length);
  const end = top10 >= 0 ? top10 : Math.min(source.length, start + 8000);
  return source.slice(start, end);
}

function extractIdealoPrices(text, config) {
  const source = String(text || "")
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/\r/g, "");

  const section = findProductSection(source, config);
  if (!section) return { standard: null, openBox: null };

  // Main product-summary price: e.g. "3 Varianten ab 119,00 €".
  const summary = section.match(/\bab\s+([0-9]{1,4}(?:[.,][0-9]{2})?)\s*€/i);
  const standard = summary ? parsePrice(summary[1]) : null;

  // Idealo may also expose an offer such as
  // "Neuware mit geöffneter Verpackung". The price belongs to that offer
  // and must not replace the standard new-product price.
  let openBox = null;
  const openBoxMatch = /geöffnete?r?\s+verpackung/i.exec(section);
  if (openBoxMatch) {
    const before = section.slice(Math.max(0, openBoxMatch.index - 500), openBoxMatch.index);
    const prices = [...before.matchAll(/([0-9]{1,4}(?:[.,][0-9]{2})?)\s*€/g)]
      .map((match) => parsePrice(match[1]))
      .filter((price) => validPrice(price, config));
    if (prices.length) openBox = prices[prices.length - 1];
  }

  return {
    standard: validPrice(standard, config) ? standard : null,
    openBox: validPrice(openBox, config) ? openBox : null,
  };
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

function upsertOffer(product, store, price, config, url) {
  if (!Number.isFinite(price)) return false;
  if (!Array.isArray(product.offers)) product.offers = [];

  let offer = product.offers.find((item) => String(item.store || "").toLowerCase() === store.toLowerCase());
  if (!offer) {
    product.offers.push({
      store,
      price,
      currency: "EUR",
      priceSource: "automatic",
      affiliateUrl: null,
      url,
    });
    return true;
  }

  let changed = false;
  if (Number(offer.price) !== price) { offer.price = price; changed = true; }
  if (offer.currency !== "EUR") { offer.currency = "EUR"; changed = true; }
  if (offer.priceSource !== "automatic") { offer.priceSource = "automatic"; changed = true; }
  if (offer.url !== url) { offer.url = url; changed = true; }
  return changed;
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
      const prices = extractIdealoPrices(text, config);

      if (!Number.isFinite(prices.standard)) {
        console.log(`Idealo: ${config.name} standard price not found`);
      } else {
        changed = upsertOffer(product, "Idealo", prices.standard, config, config.url) || changed;
        console.log(`Idealo: ${config.name} standard = ${prices.standard.toFixed(2)} EUR`);
      }

      if (Number.isFinite(prices.openBox)) {
        changed = upsertOffer(product, "Idealo Open Box", prices.openBox, config, config.url) || changed;
        console.log(`Idealo: ${config.name} open box = ${prices.openBox.toFixed(2)} EUR`);
      }
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
