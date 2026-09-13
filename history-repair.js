const fs = require("fs");
const path = require("path");

// Final startup/6-hour pass for price history. Some price collectors run on
// slightly different startup offsets, so this pass snapshots all offers after
// Idealo and Trezor official have had time to populate products.json.
const productsPath = path.join(__dirname, "products.json");
const INTERVAL_MS = 6 * 60 * 60 * 1000;
const ECB_EUR_CZK_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

function loadProducts() {
  try { return JSON.parse(fs.readFileSync(productsPath, "utf8")); }
  catch (err) { console.error("History repair: failed to load products.json:", err.message); return null; }
}

function saveProducts(products) {
  try { fs.writeFileSync(productsPath, JSON.stringify(products, null, 2) + "\n", "utf8"); return true; }
  catch (err) { console.error("History repair: failed to save products.json:", err.message); return false; }
}

async function fetchEurCzkRate() {
  try {
    const response = await fetch(ECB_EUR_CZK_URL, { headers: { "User-Agent": "CryptoWalletRadar/1.0", Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8" } });
    if (!response.ok) throw new Error(`ECB returned HTTP ${response.status}`);
    const xml = await response.text();
    const match = xml.match(/currency='CZK'\s+rate='([0-9.]+)'/i);
    const rate = match ? Number(match[1]) : null;
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  } catch (err) {
    console.error("History repair: EUR/CZK update failed:", err.message);
    return null;
  }
}

function toCzk(price, currency, rate) {
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (String(currency || "").toUpperCase() === "CZK") return value;
  if (String(currency || "").toUpperCase() === "EUR" && Number.isFinite(rate)) return Math.round(value * rate * 100) / 100;
  return null;
}

async function repairHistory() {
  const products = loadProducts();
  if (!Array.isArray(products)) return;
  const rate = await fetchEurCzkRate();
  const date = new Date().toISOString().slice(0, 10);
  const timestamp = new Date().toISOString();
  let changed = false;

  for (const product of products) {
    if (!Array.isArray(product.offers) || !product.offers.length) continue;
    if (!Array.isArray(product.priceHistory)) product.priceHistory = [];

    for (const offer of product.offers) {
      const price = Number(offer?.price);
      if (!Number.isFinite(price) || price <= 0) continue;
      const store = String(offer.store || "Market");
      const currency = String(offer.currency || product.currency || "CZK").toUpperCase();
      const exists = product.priceHistory.some((entry) => entry && entry.date === date && String(entry.store || "").toLowerCase() === store.toLowerCase());
      if (exists) continue;

      const priceCzk = toCzk(price, currency, rate);
      product.priceHistory.push({
        date,
        timestamp,
        price,
        currency,
        priceCzk,
        exchangeRate: currency === "EUR" ? rate : null,
        store,
        priceSource: offer.priceSource || "automatic",
      });
      changed = true;
      console.log(`History repair: ${product.name || product.slug} / ${store} = ${price} ${currency}`);
    }

    product.priceHistory.sort((a, b) => String(a.timestamp || a.date).localeCompare(String(b.timestamp || b.date)));
  }

  if (changed && saveProducts(products)) console.log(`History repair: saved ${date}`);
  else if (!changed) console.log(`History repair: no missing observations for ${date}`);
}

setTimeout(repairHistory, 30_000);
setInterval(repairHistory, INTERVAL_MS);
