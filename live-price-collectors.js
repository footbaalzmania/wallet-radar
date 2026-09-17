const fs = require('fs');
const path = require('path');
const health = require('./source-health.js');

const productsPath = path.join(__dirname, 'products.json');
const INTERVAL_MS = 6 * 60 * 60 * 1000;
const USER_AGENT = 'CryptoWalletRadar/1.0 (+https://cryptowalletradar.com)';

const COLLECTORS = [
  {
    sourceId: 'ledger-official',
    name: 'Ledger Official Store',
    products: [
      { slug: 'ledger-nano-s-plus', url: 'https://shop.ledger.com/products/ledger-nano-s-plus', marker: 'Ledger Nano S Plus' },
      { slug: 'ledger-nano-x', url: 'https://shop.ledger.com/products/ledger-nano-x', marker: 'Ledger Nano X' },
      { slug: 'ledger-flex', url: 'https://shop.ledger.com/pages/ledger-flex', marker: 'Ledger Flex' },
    ],
  },
  {
    sourceId: 'bitbox-official',
    name: 'BitBox Official Store',
    products: [
      { slug: 'bitbox02-multi', url: 'https://shop.bitbox.swiss/en/products/bitbox02-80/', marker: 'BitBox02' },
    ],
  },
];

function loadProducts() {
  return JSON.parse(fs.readFileSync(productsPath, 'utf8'));
}

function saveProducts(products) {
  fs.writeFileSync(productsPath, JSON.stringify(products, null, 2) + '\n', 'utf8');
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
}

function parseJsonLd(html) {
  const values = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    try {
      values.push(JSON.parse(match[1]));
    } catch {}
  }
  return values;
}

function walkJson(value, callback) {
  if (!value || typeof value !== 'object') return;
  callback(value);
  if (Array.isArray(value)) {
    for (const item of value) walkJson(item, callback);
  } else {
    for (const item of Object.values(value)) walkJson(item, callback);
  }
}

function eurOfferPrice(node) {
  const offers = node && node.offers;
  if (!offers) return null;
  const list = Array.isArray(offers) ? offers : [offers];
  for (const offer of list) {
    const currency = String(offer?.priceCurrency || '').toUpperCase();
    const price = Number(offer?.price);
    if (currency === 'EUR' && Number.isFinite(price) && price > 10 && price < 1000) return price;
  }
  return null;
}

function extractTargetedJsonLdPrice(html, marker) {
  const markerLower = marker.toLowerCase();
  for (const root of parseJsonLd(html)) {
    let targeted = null;
    walkJson(root, (node) => {
      if (targeted !== null) return;
      const name = String(node?.name || '').toLowerCase();
      if (!name.includes(markerLower)) return;
      const price = eurOfferPrice(node);
      if (price !== null) targeted = price;
    });
    if (targeted !== null) return targeted;
  }
  return null;
}

function extractNearbyTextPrice(html, marker, baselinePrice) {
  const text = decodeHtml(clean(html));
  const lower = text.toLowerCase();
  const markerIndex = lower.indexOf(marker.toLowerCase());
  if (markerIndex < 0) return null;

  // Never scan the whole page: accessory/recommendation prices elsewhere on a
  // store page are not valid prices for the requested product.
  const window = text.slice(Math.max(0, markerIndex - 1200), markerIndex + 2200);
  const matches = [...window.matchAll(/(?:€\s*|EUR\s*)([0-9]{1,4}(?:[.,][0-9]{1,2})?)/gi)];
  const prices = matches
    .map((m) => Number(String(m[1]).replace(',', '.')))
    .filter((n) => Number.isFinite(n) && n > 10 && n < 1000);

  if (!prices.length) return null;

  // Safety gate: a generic €25 accessory was the exact failure mode we hit.
  // Only accept a text fallback if it is plausibly close to the existing
  // catalog price. Otherwise report no-price and keep the trusted catalog value.
  if (Number.isFinite(baselinePrice) && baselinePrice > 0) {
    const plausible = prices.find((price) => price >= baselinePrice * 0.5 && price <= baselinePrice * 1.5);
    if (plausible !== undefined) return plausible;
    return null;
  }

  return prices[0];
}

function extractPrice(html, marker, baselinePrice) {
  const structured = extractTargetedJsonLdPrice(html, marker);
  if (structured !== null) return structured;
  return extractNearbyTextPrice(html, marker, baselinePrice);
}

async function fetchPrice(item, product) {
  const response = await fetch(item.url, {
    redirect: 'follow',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/json',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  const html = await response.text();
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.code = response.status === 403 || response.status === 429 ? 'blocked' : 'error';
    throw error;
  }

  const baselinePrice = Number(product.officialPriceEur || product.officialPrice);
  const price = extractPrice(html, item.marker, baselinePrice);
  if (!Number.isFinite(price)) {
    const error = new Error('Official page loaded but no trustworthy EUR product price was found');
    error.code = 'no-price';
    throw error;
  }

  return price;
}

function updateProduct(product, sourceId, price, url) {
  let changed = false;
  if (Number(product.officialPriceEur) !== price) {
    product.officialPriceEur = price;
    product.officialPrice = price;
    product.officialPriceCurrency = 'EUR';
    product.currency = 'EUR';
    changed = true;
  }

  product.officialSourceId = sourceId;
  if (!Array.isArray(product.priceHistory)) product.priceHistory = [];
  const today = new Date().toISOString().slice(0, 10);
  const last = product.priceHistory[product.priceHistory.length - 1];
  if (!last || last.date !== today || Number(last.price) !== price || last.sourceId !== sourceId) {
    product.priceHistory.push({
      date: today,
      price,
      currency: 'EUR',
      sourceId,
      store: sourceId === 'ledger-official' ? 'Ledger Official Store' : 'BitBox Official Store',
      priceSource: 'collector',
      url,
    });
    changed = true;
  }

  product.lastUpdated = today;
  return changed;
}

async function runCollector(collector) {
  health.begin(collector.sourceId);
  let products;
  try {
    products = loadProducts();
  } catch (error) {
    health.failure(collector.sourceId, 'error', error.message);
    return;
  }

  let updated = 0;
  let attempted = 0;
  const failures = [];

  for (const item of collector.products) {
    const product = products.find((entry) => entry.slug === item.slug);
    if (!product) continue;
    attempted += 1;
    try {
      const price = await fetchPrice(item, product);
      if (updateProduct(product, collector.sourceId, price, item.url)) updated += 1;
      console.log(`${collector.name}: ${product.name} = ${price} EUR`);
    } catch (error) {
      failures.push(`${product.name}: ${error.message}`);
      console.warn(`${collector.name}: ${product.name} unavailable (${error.code || 'error'})`);
    }
  }

  if (updated > 0) saveProducts(products);

  if (failures.length === 0) {
    health.success(collector.sourceId, updated);
  } else if (updated > 0) {
    health.success(collector.sourceId, updated, 'partial', failures.join('; '));
  } else {
    const blocked = failures.some((item) => /HTTP (403|429)/i.test(item));
    health.failure(collector.sourceId, blocked ? 'blocked' : 'no-price', failures.join('; '), updated);
  }

  console.log(`${collector.name}: ${attempted - failures.length}/${attempted} prices collected; ${updated} updates`);
}

async function runAll() {
  for (const collector of COLLECTORS) {
    await runCollector(collector);
  }
}

runAll().catch((error) => console.error('Live collector run failed:', error.message));
setInterval(() => {
  runAll().catch((error) => console.error('Live collector cycle failed:', error.message));
}, INTERVAL_MS);

module.exports = { runAll };
