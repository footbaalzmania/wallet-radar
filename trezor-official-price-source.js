const fs = require("fs");
const path = require("path");

const productsPath = path.join(__dirname, "products.json");
const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 25_000;

const TREZOR_PRODUCTS = {
  "trezor-safe-3": { name: "Trezor Safe 3", url: "https://trezor.io/cs/trezor-safe-3" },
  "trezor-safe-5": { name: "Trezor Safe 5", url: "https://trezor.io/cs/trezor-safe-5" },
  "trezor-safe-7": { name: "Trezor Safe 7", url: "https://trezor.io/cs/trezor-safe-7" },
};

function loadProducts() {
  try {
    const data = JSON.parse(fs.readFileSync(productsPath, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("Trezor official: failed to load products.json:", err.message);
    return [];
  }
}

function saveProducts(products) {
  try {
    fs.writeFileSync(productsPath, JSON.stringify(products, null, 2) + "\n", "utf8");
    return true;
  } catch (err) {
    console.error("Trezor official: failed to save products.json:", err.message);
    return false;
  }
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPrices(text) {
  const normalized = cleanText(text);
  const matches = [];
  const re = /(\d{1,3}(?:[ .]\d{3})+|\d{3,5})\s*(?:Kč|CZK|,-)/gi;
  let match;

  while ((match = re.exec(normalized))) {
    const price = Number(match[1].replace(/[ .]/g, ""));
    if (Number.isFinite(price) && price >= 500 && price <= 20_000) {
      matches.push({ price, index: match.index });
    }
  }

  return matches;
}

function findPriceNearProduct(text, productName) {
  const normalized = cleanText(text);
  const lower = normalized.toLowerCase();
  const needle = productName.toLowerCase();
  const prices = extractPrices(normalized);

  let from = lower.indexOf(needle);
  while (from !== -1) {
    const candidate = prices.find((item) => item.index >= from && item.index <= from + 1800);
    if (candidate) return candidate.price;
    from = lower.indexOf(needle, from + needle.length);
  }

  return null;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CryptoWalletRadar/1.0; +https://cryptowalletradar.com)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTrezorProductText(url) {
  try {
    return await fetchText(url);
  } catch (directErr) {
    console.warn(`Trezor official: direct fetch failed (${directErr.message}), trying reader`);
    return await fetchText(`https://r.jina.ai/${url}`);
  }
}

async function updateOfficialPrices() {
  const products = loadProducts();
  if (!products.length) return;

  let changed = false;

  for (const [slug, config] of Object.entries(TREZOR_PRODUCTS)) {
    const product = products.find((item) => item.slug === slug);
    if (!product) continue;

    try {
      const raw = await fetchTrezorProductText(config.url);
      const price = findPriceNearProduct(raw, config.name);

      if (!Number.isFinite(price)) {
        console.warn(`Trezor official: ${config.name} price not found`);
        continue;
      }

      if (Number(product.officialPrice) !== price || product.officialPriceCurrency !== "CZK") {
        product.officialPrice = price;
        product.officialPriceCurrency = "CZK";
        changed = true;
      }

      product.officialPriceSource = "trezor.io";
      product.officialPriceUpdatedAt = new Date().toISOString();
      console.log(`Trezor official: ${config.name} = ${price} CZK`);
    } catch (err) {
      console.error(`Trezor official: ${config.name} update failed:`, err.message);
    }
  }

  if (changed) {
    saveProducts(products);
    console.log("Trezor official: prices saved");
  } else {
    console.log("Trezor official: no price changes");
  }
}

setTimeout(updateOfficialPrices, 12_000);
updateOfficialPrices();
setInterval(updateOfficialPrices, UPDATE_INTERVAL_MS);
