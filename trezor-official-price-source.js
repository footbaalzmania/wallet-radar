const fs = require("fs");
const path = require("path");

const productsPath = path.join(__dirname, "products.json");
const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 25_000;
const STORE_URL = "https://trezor.io/cs/store";

const TREZOR_PRODUCTS = {
  "trezor-safe-3": { name: "Trezor Safe 3" },
  "trezor-safe-5": { name: "Trezor Safe 5" },
  "trezor-safe-7": { name: "Trezor Safe 7" },
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

function extractMoney(text) {
  const normalized = cleanText(text);
  const matches = [];
  const re = /(€|EUR|Kč|CZK)\s*(\d{1,3}(?:[ .]\d{3})*(?:[,.]\d{1,2})?|\d{3,5})|(\d{1,3}(?:[ .]\d{3})*(?:[,.]\d{1,2})?|\d{3,5})\s*(€|EUR|Kč|CZK)/gi;
  let match;

  while ((match = re.exec(normalized))) {
    const currency = (match[1] || match[5] || "").toUpperCase();
    const raw = match[2] || match[4] || "";
    const price = Number(raw.replace(/[ .]/g, "").replace(",", "."));
    if (!Number.isFinite(price)) continue;

    if ((currency === "EUR" || currency === "€") && price >= 20 && price <= 1000) {
      matches.push({ price, currency: "EUR", index: match.index });
    } else if ((currency === "CZK" || currency === "KČ") && price >= 500 && price <= 20_000) {
      matches.push({ price, currency: "CZK", index: match.index });
    }
  }

  return matches;
}

function findPriceNearProduct(text, productName) {
  const normalized = cleanText(text);
  const lower = normalized.toLowerCase();
  const needle = productName.toLowerCase();
  const prices = extractMoney(normalized);

  let from = lower.indexOf(needle);
  while (from !== -1) {
    const candidate = prices.find((item) => item.index >= from && item.index <= from + 2500);
    if (candidate) return candidate;
    from = lower.indexOf(needle, from + needle.length);
  }

  return null;
}

function findRawPriceNearProduct(text, productName) {
  const lower = String(text || "").toLowerCase();
  const needle = productName.toLowerCase();
  let from = lower.indexOf(needle);

  while (from !== -1) {
    const window = String(text).slice(from, from + 12000);
    const patterns = [
      /"price"\s*:\s*"?(\d+(?:[.,]\d+)?)"?/i,
      /"amount"\s*:\s*"?(\d+(?:[.,]\d+)?)"?/i,
      /(\d+(?:[.,]\d+)?)\s*(?:EUR|€)/i,
      /(?:EUR|€)\s*(\d+(?:[.,]\d+)?)/i,
      /(\d{3,5})\s*(?:CZK|Kč)/i,
    ];

    for (const pattern of patterns) {
      const match = window.match(pattern);
      if (!match) continue;
      const price = Number(match[1].replace(",", "."));
      if (!Number.isFinite(price)) continue;
      if (window.match(/(?:EUR|€)/i) && price >= 20 && price <= 1000) return { price, currency: "EUR" };
      if (price >= 500 && price <= 20_000) return { price, currency: "CZK" };
    }

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

async function fetchReader(url) {
  return fetchText(`https://r.jina.ai/${url}`);
}

async function fetchBest(url) {
  try {
    const direct = await fetchText(url);
    if (direct && direct.length > 1000) return direct;
  } catch (err) {
    console.warn(`Trezor official: direct fetch failed (${err.message})`);
  }
  return fetchReader(url);
}

async function updateOfficialPrices() {
  const products = loadProducts();
  if (!products.length) return;

  let changed = false;
  let sourceText = "";

  try {
    sourceText = await fetchBest(STORE_URL);
    console.log(`Trezor official: store source loaded (${sourceText.length} chars)`);
  } catch (err) {
    console.error("Trezor official: store fetch failed:", err.message);
  }

  for (const [slug, config] of Object.entries(TREZOR_PRODUCTS)) {
    const product = products.find((item) => item.slug === slug);
    if (!product) continue;

    try {
      let result = sourceText ? findRawPriceNearProduct(sourceText, config.name) : null;
      if (!result && sourceText) result = findPriceNearProduct(sourceText, config.name);

      if (!result) {
        const raw = await fetchBest(`https://trezor.io/cs/${slug}`);
        result = findRawPriceNearProduct(raw, config.name) || findPriceNearProduct(raw, config.name);
      }

      if (!result) {
        console.warn(`Trezor official: ${config.name} price not found`);
        continue;
      }

      product.officialPrice = result.price;
      product.officialPriceCurrency = result.currency;
      product.officialPriceSource = "trezor.io";
      product.officialPriceUpdatedAt = new Date().toISOString();
      changed = true;
      console.log(`Trezor official: ${config.name} = ${result.price} ${result.currency}`);
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
