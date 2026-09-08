const fs = require("fs");
const path = require("path");

const productsPath = path.join(__dirname, "products.json");
const READER_BASE = String(process.env.PRICE_READER_BASE_URL || "https://r.jina.ai/").replace(/\/+$/, "") + "/";
const INTERVAL_MS = 6 * 60 * 60 * 1000;
const ECB_EUR_CZK_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

const PRODUCTS = {
  "trezor-safe-3": { name: "Trezor Safe 3", url: "https://www.idealo.de/preisvergleich/OffersOfProduct/205145125_-safe-3-trezor.html", min: 40, max: 150 },
  "trezor-safe-5": { name: "Trezor Safe 5", url: "https://www.idealo.de/preisvergleich/OffersOfProduct/206151813_-safe-5-trezor.html", min: 80, max: 220 },
  "trezor-safe-7": { name: "Trezor Safe 7", url: "https://www.idealo.de/preisvergleich/OffersOfProduct/209319953_-trezor-safe-7-trezor.html", min: 150, max: 400 },
};

function loadProducts() {
  try { return JSON.parse(fs.readFileSync(productsPath, "utf8")); }
  catch (err) { console.error("Idealo: failed to load products.json:", err.message); return null; }
}
function saveProducts(products) {
  try { fs.writeFileSync(productsPath, JSON.stringify(products, null, 2) + "\n", "utf8"); return true; }
  catch (err) { console.error("Idealo: failed to save products.json:", err.message); return false; }
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
  const source = String(text || "").replace(/[\u00a0\u202f]/g, " ").replace(/\r/g, "");
  const section = findProductSection(source, config);
  if (!section) return { standard: null, openBox: null };

  const priceRegex = /([0-9]{1,4}(?:[.,][0-9]{2})?)\s*€/g;
  let standardCandidates = [];
  let openBoxCandidates = [];

  // Prefer actual offer blocks. Jina's flattened Idealo page can put an
  // open-box price into the product summary, so "Varianten ab" is not used
  // as the primary source. Instead, find product-name occurrences and inspect
  // the nearby text for the offer price and the open-box marker.
  const escapedName = config.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const productNameRegex = new RegExp(escapedName, "gi");
  for (const match of section.matchAll(productNameRegex)) {
    const start = match.index;
    const block = section.slice(start, Math.min(section.length, start + 1200));
    const isOpenBox = /geöffnete?r?\s+Verpackung/i.test(block.slice(0, 700));
    const prices = [...block.matchAll(priceRegex)]
      .map((m) => parsePrice(m[1]))
      .filter((p) => validPrice(p, config));
    if (!prices.length) continue;
    const price = prices[0];
    if (isOpenBox) openBoxCandidates.push(price);
    else standardCandidates.push(price);
  }

  // Fallback for pages whose offer titles were flattened away.
  if (!standardCandidates.length || !openBoxCandidates.length) {
    const allPrices = [...section.matchAll(priceRegex)]
      .map((m) => parsePrice(m[1]))
      .filter((p) => validPrice(p, config));
    const openBoxMatch = /geöffnete?r?\s+Verpackung/i.exec(section);
    if (openBoxMatch && !openBoxCandidates.length) {
      const before = section.slice(Math.max(0, openBoxMatch.index - 700), openBoxMatch.index);
      const beforePrices = [...before.matchAll(priceRegex)]
        .map((m) => parsePrice(m[1]))
        .filter((p) => validPrice(p, config));
      if (beforePrices.length) openBoxCandidates.push(beforePrices[beforePrices.length - 1]);
    }
    if (!standardCandidates.length) {
      const openBox = openBoxCandidates.length ? openBoxCandidates[0] : null;
      const candidates = allPrices.filter((p) => p !== openBox);
      if (candidates.length) standardCandidates.push(Math.min(...candidates));
    }
  }

  const openBox = openBoxCandidates.length ? Math.min(...openBoxCandidates) : null;
  let standard = standardCandidates.length ? Math.min(...standardCandidates) : null;

  // Never allow an identified open-box price to become the standard price.
  if (Number.isFinite(openBox) && standard === openBox) {
    const candidates = standardCandidates.filter((p) => p !== openBox);
    standard = candidates.length ? Math.min(...candidates) : null;
  }

  // Last fallback: the normal summary, but only if it is not the open-box price.
  if (!Number.isFinite(standard)) {
    const summary = section.match(/\b(?:\d+\s+)?Varianten\s+ab\s+([0-9]{1,4}(?:[.,][0-9]{2})?)\s*€/i);
    const summaryPrice = summary ? parsePrice(summary[1]) : null;
    if (validPrice(summaryPrice, config) && summaryPrice !== openBox) standard = summaryPrice;
  }

  return {
    standard: validPrice(standard, config) ? standard : null,
    openBox: validPrice(openBox, config) ? openBox : null,
  };
}

async function fetchReader(url) {
  const response = await fetch(READER_BASE + url, { headers: { "User-Agent": "CryptoWalletRadar/1.0", Accept: "text/plain,text/html;q=0.9,*/*;q=0.8" } });
  if (!response.ok) throw new Error(`Reader returned HTTP ${response.status}`);
  return response.text();
}
async function fetchEurCzkRate() {
  try {
    const response = await fetch(ECB_EUR_CZK_URL, { headers: { "User-Agent": "CryptoWalletRadar/1.0", Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8" } });
    if (!response.ok) throw new Error(`ECB returned HTTP ${response.status}`);
    const xml = await response.text();
    const match = xml.match(/currency='CZK'\s+rate='([0-9.]+)'/i);
    const rate = match ? Number(match[1]) : null;
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("EUR/CZK rate not found");
    return rate;
  } catch (err) { console.error("Idealo: EUR/CZK update failed:", err.message); return null; }
}
function upsertOffer(product, store, price, priceCzk, config, url, condition = "new") {
  if (!Number.isFinite(price)) return false;
  if (!Array.isArray(product.offers)) product.offers = [];
  let offer = product.offers.find((item) => String(item.store || "").toLowerCase() === store.toLowerCase());
  if (!offer) {
    product.offers.push({ store, price, currency: "EUR", priceCzk: Number.isFinite(priceCzk) ? priceCzk : null, exchangeRate: Number.isFinite(priceCzk) ? priceCzk / price : null, condition, priceSource: "automatic", affiliateUrl: null, url });
    return true;
  }
  let changed = false;
  if (Number(offer.price) !== price) { offer.price = price; changed = true; }
  if (offer.currency !== "EUR") { offer.currency = "EUR"; changed = true; }
  if (Number(offer.priceCzk) !== Number(priceCzk)) { offer.priceCzk = Number.isFinite(priceCzk) ? priceCzk : null; changed = true; }
  if (offer.exchangeRate !== (Number.isFinite(priceCzk) ? priceCzk / price : null)) { offer.exchangeRate = Number.isFinite(priceCzk) ? priceCzk / price : null; changed = true; }
  if (offer.condition !== condition) { offer.condition = condition; changed = true; }
  if (offer.priceSource !== "automatic") { offer.priceSource = "automatic"; changed = true; }
  if (offer.url !== url) { offer.url = url; changed = true; }
  return changed;
}
async function updateIdealo() {
  const products = loadProducts();
  if (!Array.isArray(products)) return;
  const eurCzkRate = await fetchEurCzkRate();
  let changed = false;
  for (const [slug, config] of Object.entries(PRODUCTS)) {
    const product = products.find((item) => item.slug === slug);
    if (!product) continue;
    try {
      const text = await fetchReader(config.url);
      const prices = extractIdealoPrices(text, config);
      const standardCzk = Number.isFinite(eurCzkRate) && Number.isFinite(prices.standard) ? Math.round(prices.standard * eurCzkRate * 100) / 100 : null;
      const openBoxCzk = Number.isFinite(eurCzkRate) && Number.isFinite(prices.openBox) ? Math.round(prices.openBox * eurCzkRate * 100) / 100 : null;
      if (!Number.isFinite(prices.standard)) console.log(`Idealo: ${config.name} standard price not found`);
      else { changed = upsertOffer(product, "Idealo", prices.standard, standardCzk, config, config.url, "new") || changed; console.log(`Idealo: ${config.name} standard = ${prices.standard.toFixed(2)} EUR` + (Number.isFinite(standardCzk) ? ` (~${Math.round(standardCzk)} CZK)` : "")); }
      if (Number.isFinite(prices.openBox)) { changed = upsertOffer(product, "Idealo Open Box", prices.openBox, openBoxCzk, config, config.url, "open-box") || changed; console.log(`Idealo: ${config.name} open box = ${prices.openBox.toFixed(2)} EUR` + (Number.isFinite(openBoxCzk) ? ` (~${Math.round(openBoxCzk)} CZK)` : "")); }
    } catch (err) { console.error(`Idealo: ${config.name} update failed:`, err.message); }
  }
  if (changed && saveProducts(products)) console.log("Idealo price update saved to products.json");
  else if (!changed) console.log("Idealo price update: no changes");
}
setTimeout(updateIdealo, 10000);
setInterval(updateIdealo, INTERVAL_MS);
