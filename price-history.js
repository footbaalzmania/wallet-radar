const fs = require("fs");
const path = require("path");

/*
  Price history collector.

  Sources:
  - Alza: refreshed by server.js every 6 hours.
  - Heureka: refreshed here every 6 hours.
  - Amazon.de: refreshed here every 6 hours where Amazon exposes a readable price.

  Currency handling:
  - Every offer keeps its original price + currency.
  - EUR offers also store the ECB EUR/CZK reference rate and a CZK equivalent.
  - Historical observations therefore remain comparable even when FX moves.
*/

const productsPath = path.join(__dirname, "products.json");
const INTERVAL_MS = 6 * 60 * 60 * 1000;
const ECB_EUR_CZK_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

const HEUREKA_PRODUCTS = {
  "trezor-safe-3": { name: "Trezor Safe 3", url: "https://hardwarove-penezenky-a-trezory.heureka.cz/trezor-safe-3-stellar-silver/" },
  "trezor-safe-5": { name: "Trezor Safe 5", url: "https://hardwarove-penezenky-a-trezory.heureka.cz/trezor-safe-5-black-graphite/" },
  "trezor-safe-7": { name: "Trezor Safe 7", url: "https://hardwarove-penezenky-a-trezory.heureka.cz/trezor-safe-7-charcoal-black/" },
};

const AMAZON_PRODUCTS = {
  "trezor-safe-3": { name: "Trezor Safe 3", searchUrl: "https://www.amazon.de/s?k=Trezor+Safe+3" },
  "trezor-safe-5": { name: "Trezor Safe 5", searchUrl: "https://www.amazon.de/s?k=Trezor+Safe+5" },
  "trezor-safe-7": { name: "Trezor Safe 7", searchUrl: "https://www.amazon.de/s?k=Trezor+Safe+7" },
};

function loadProducts() {
  try { return JSON.parse(fs.readFileSync(productsPath, "utf8")); }
  catch (err) { console.error("Price history: failed to load products.json:", err.message); return null; }
}

function saveProducts(products) {
  try { fs.writeFileSync(productsPath, JSON.stringify(products, null, 2) + "\n", "utf8"); return true; }
  catch (err) { console.error("Price history: failed to save products.json:", err.message); return false; }
}

function today() { return new Date().toISOString().slice(0, 10); }
function timestamp() { return new Date().toISOString(); }

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'").replace(/&#x27;/gi, "'").replace(/\s+/g, " ").trim();
}

async function fetchEurCzkRate() {
  try {
    const response = await fetch(ECB_EUR_CZK_URL, { headers: { "User-Agent": "Mozilla/5.0 (compatible; CryptoWalletRadar/1.0; +https://cryptowalletradar.com)", Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8" } });
    if (!response.ok) throw new Error(`ECB returned HTTP ${response.status}`);
    const xml = await response.text();
    const match = xml.match(/currency='CZK'\s+rate='([0-9.]+)'/i);
    const rate = match ? Number(match[1]) : null;
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("EUR/CZK rate not found in ECB response");
    return rate;
  } catch (err) { console.error("FX: EUR/CZK update failed:", err.message); return null; }
}

function convertToCzk(price, currency, eurCzkRate) {
  const value = Number(price);
  const code = String(currency || "CZK").toUpperCase();
  if (!Number.isFinite(value) || value <= 0) return null;
  if (code === "CZK") return value;
  if (code === "EUR" && Number.isFinite(eurCzkRate)) return Math.round(value * eurCzkRate * 100) / 100;
  return null;
}

function extractHeurekaPrice(text) {
  const match = String(text || "").match(/\bod\s+([\d .]{3,12})\s*Kč\b/i);
  if (!match) return null;
  const price = Number(String(match[1]).replace(/[ .]/g, ""));
  return Number.isFinite(price) && price > 0 ? price : null;
}

async function fetchHeurekaPrice(config) {
  const response = await fetch(config.url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; CryptoWalletRadar/1.0; +https://cryptowalletradar.com)", Accept: "text/html,application/xhtml+xml", "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8" } });
  if (!response.ok) throw new Error(`Heureka returned HTTP ${response.status}`);
  return extractHeurekaPrice(stripHtml(await response.text()));
}

async function updateHeurekaOffers(products) {
  let changed = false;
  for (const [slug, config] of Object.entries(HEUREKA_PRODUCTS)) {
    const product = products.find((item) => item.slug === slug);
    if (!product) continue;
    try {
      const price = await fetchHeurekaPrice(config);
      if (!Number.isFinite(price)) { console.log(`Heureka: ${config.name} price not found`); continue; }
      if (!Array.isArray(product.offers)) product.offers = [];
      let offer = product.offers.find((item) => String(item.store || "").toLowerCase() === "heureka");
      if (!offer) {
        offer = { store: "Heureka", price, currency: "CZK", priceSource: "automatic", affiliateUrl: null, url: config.url };
        product.offers.push(offer); changed = true;
      } else {
        if (Number(offer.price) !== price) { offer.price = price; changed = true; }
        if (offer.priceSource !== "automatic") { offer.priceSource = "automatic"; changed = true; }
        if (offer.url !== config.url) { offer.url = config.url; changed = true; }
        if (offer.currency !== "CZK") { offer.currency = "CZK"; changed = true; }
      }
      console.log(`Heureka: ${config.name} = ${price} CZK`);
    } catch (err) { console.error(`Heureka: ${config.name} update failed:`, err.message); }
  }
  return changed;
}

function extractAmazonPrice(text, productName) {
  const escaped = productName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(escaped + "[\\s\\S]{0,500}?([0-9]{1,3}(?:[.,][0-9]{2})?)\\s*€", "i"),
    new RegExp("([0-9]{1,3}(?:[.,][0-9]{2})?)\\s*€[\\s\\S]{0,500}?" + escaped, "i"),
  ];
  for (const pattern of patterns) {
    const match = String(text || "").match(pattern);
    if (!match) continue;
    const price = Number(String(match[1]).replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(price) && price > 0) return price;
  }
  return null;
}

async function fetchAmazonPrice(config) {
  const response = await fetch(config.searchUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; CryptoWalletRadar/1.0; +https://cryptowalletradar.com)", Accept: "text/html,application/xhtml+xml", "Accept-Language": "de-DE,de;q=0.9,en;q=0.8" } });
  if (!response.ok) throw new Error(`Amazon returned HTTP ${response.status}`);
  return extractAmazonPrice(stripHtml(await response.text()), config.name);
}

async function updateAmazonOffers(products, eurCzkRate) {
  let changed = false;
  for (const [slug, config] of Object.entries(AMAZON_PRODUCTS)) {
    const product = products.find((item) => item.slug === slug);
    if (!product) continue;
    try {
      const price = await fetchAmazonPrice(config);
      if (!Number.isFinite(price)) { console.log(`Amazon.de: ${config.name} price not found`); continue; }
      if (!Array.isArray(product.offers)) product.offers = [];
      let offer = product.offers.find((item) => String(item.store || "").toLowerCase() === "amazon.de");
      if (!offer) {
        offer = { store: "Amazon.de", price, currency: "EUR", priceSource: "automatic", affiliateUrl: null, url: config.searchUrl };
        product.offers.push(offer); changed = true;
      } else {
        if (Number(offer.price) !== price || String(offer.currency || "").toUpperCase() !== "EUR") { offer.price = price; offer.currency = "EUR"; changed = true; }
        if (offer.priceSource !== "automatic") { offer.priceSource = "automatic"; changed = true; }
        if (offer.url !== config.searchUrl) { offer.url = config.searchUrl; changed = true; }
      }
      const czk = convertToCzk(price, "EUR", eurCzkRate);
      if (offer.priceCzk !== czk) { offer.priceCzk = Number.isFinite(czk) ? czk : null; changed = true; }
      if (offer.exchangeRate !== eurCzkRate) { offer.exchangeRate = Number.isFinite(eurCzkRate) ? eurCzkRate : null; changed = true; }
      console.log(`Amazon.de: ${config.name} = ${price.toFixed(2)} EUR` + (Number.isFinite(czk) ? ` (~${Math.round(czk)} CZK)` : ""));
    } catch (err) { console.error(`Amazon.de: ${config.name} update failed:`, err.message); }
  }
  return changed;
}

function restoreRuntimeNormalizedValues(products) {
  let changed = false;
  for (const product of products) {
    for (const offer of Array.isArray(product.offers) ? product.offers : []) {
      if (String(offer.originalCurrency || "").toUpperCase() === "EUR" && Number.isFinite(Number(offer.originalPrice))) {
        offer.price = Number(offer.originalPrice);
        offer.currency = "EUR";
        changed = true;
      }
    }
    for (const entry of Array.isArray(product.priceHistory) ? product.priceHistory : []) {
      if (String(entry.originalCurrency || "").toUpperCase() === "EUR" && Number.isFinite(Number(entry.originalPrice))) {
        entry.price = Number(entry.originalPrice);
        entry.currency = "EUR";
        changed = true;
      }
    }
  }
  return changed;
}

function collectPriceHistory(products, eurCzkRate) {
  const date = today();
  const now = timestamp();
  let changed = false;
  for (const product of products) {
    if (!Array.isArray(product.offers) || !product.offers.length) continue;
    if (!Array.isArray(product.priceHistory)) product.priceHistory = [];
    for (const offer of product.offers) {
      const price = Number(offer?.price);
      if (!Number.isFinite(price) || price <= 0) continue;
      const store = String(offer.store || "Market");
      const currency = String(offer.currency || product.currency || "CZK").toUpperCase();
      const priceCzk = convertToCzk(price, currency, eurCzkRate);
      const sameStoreToday = product.priceHistory.find((entry) => entry && entry.date === date && String(entry.store || "").toLowerCase() === store.toLowerCase());
      if (sameStoreToday && Number(sameStoreToday.price) === price && String(sameStoreToday.currency || currency).toUpperCase() === currency) {
        if (Number.isFinite(priceCzk) && sameStoreToday.priceCzk !== priceCzk) { sameStoreToday.priceCzk = priceCzk; sameStoreToday.exchangeRate = currency === "EUR" ? eurCzkRate : null; changed = true; }
        continue;
      }
      product.priceHistory.push({ date, timestamp: now, price, currency, priceCzk: Number.isFinite(priceCzk) ? priceCzk : null, exchangeRate: currency === "EUR" ? eurCzkRate : null, store, priceSource: offer.priceSource || "automatic" });
      changed = true;
    }
    product.priceHistory.sort((a, b) => String(a.timestamp || a.date).localeCompare(String(b.timestamp || b.date)));
  }
  return changed;
}

function normalizeLegacyHistory(products) {
  let changed = false;
  for (const product of products) {
    if (!Array.isArray(product.priceHistory)) continue;
    for (const entry of product.priceHistory) {
      if (!entry || !Number.isFinite(Number(entry.price))) continue;
      if (!entry.currency) { entry.currency = "CZK"; changed = true; }
      if (!entry.store) { entry.store = "Alza"; changed = true; }
      if (!entry.priceCzk && entry.currency === "CZK") { entry.priceCzk = Number(entry.price); changed = true; }
      if (!entry.timestamp && entry.date) { entry.timestamp = `${entry.date}T00:00:00.000Z`; changed = true; }
    }
  }
  return changed;
}

async function runCollector() {
  const products = loadProducts();
  if (!Array.isArray(products)) return;
  let changed = restoreRuntimeNormalizedValues(products);
  changed = normalizeLegacyHistory(products) || changed;
  const eurCzkRate = await fetchEurCzkRate();
  changed = (await updateHeurekaOffers(products)) || changed;
  changed = (await updateAmazonOffers(products, eurCzkRate)) || changed;
  changed = collectPriceHistory(products, eurCzkRate) || changed;
  if (changed && saveProducts(products)) console.log(`Price history: saved ${today()}` + (Number.isFinite(eurCzkRate) ? ` | EUR/CZK ${eurCzkRate}` : ""));
  else if (!changed) console.log(`Price history: no new observations for ${today()}`);
}

setTimeout(runCollector, 8000);
setInterval(runCollector, INTERVAL_MS);
