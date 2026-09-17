const Module = require('module');
const fs = require('fs');
const original = Module._extensions['.js'];
const ui = require('./wallet-radar-ui.js');
const sourceRegistry = require('./source-registry.js');

Module._extensions['.js'] = function(module, filename) {
  if (!filename.endsWith('/server.js')) return original(module, filename);

  let source = fs.readFileSync(filename, 'utf8');

  // sourceRegistry is used inside the compiled server.js scope too.
  if (!source.includes("const sourceRegistry = require('./source-registry.js');")) {
    source = "const sourceRegistry = require('./source-registry.js');\n" + source;
  }

  const marketHelpers = `
function marketPriceEur(offer) {
  if (!offer) return null;
  const originalCurrency = String(offer.originalCurrency || '').toUpperCase();
  const currency = String(offer.currency || '').toUpperCase();
  if (originalCurrency === 'EUR' && Number.isFinite(Number(offer.originalPrice))) return Number(offer.originalPrice);
  if (currency === 'EUR' && Number.isFinite(Number(offer.price))) return Number(offer.price);
  const rate = Number(offer.exchangeRate) || 24.8;
  if (Number.isFinite(Number(offer.priceCzk))) return Number(offer.priceCzk) / rate;
  if (currency === 'CZK' && Number.isFinite(Number(offer.price))) return Number(offer.price) / rate;
  return Number.isFinite(Number(offer.price)) ? Number(offer.price) : null;
}

function getOpenBoxOffer(product) {
  if (!product || !Array.isArray(product.offers)) return null;
  return product.offers
    .filter((offer) => {
      const sourceId = String(offer.sourceId || '').toLowerCase();
      const store = String(offer.store || '').toLowerCase();
      return sourceId === 'idealo' && (offer.condition === 'open-box' || store === 'idealo open box');
    })
    .filter((offer) => Number.isFinite(marketPriceEur(offer)))
    .sort((a, b) => marketPriceEur(a) - marketPriceEur(b))[0] || null;
}

function historyPriceEur(item, product) {
  if (!item) return null;
  const sourceId = String(item.sourceId || '').toLowerCase();
  const store = String(item.store || '').toLowerCase();
  const originalCurrency = String(item.originalCurrency || '').toUpperCase();
  const currency = String(item.currency || '').toUpperCase();
  const rate = Number(item.exchangeRate) || 24.8;
  if (originalCurrency === 'EUR' && Number.isFinite(Number(item.originalPrice))) return Number(item.originalPrice);
  if (currency === 'EUR' && Number.isFinite(Number(item.price))) return Number(item.price);
  const isCzkStore = sourceId === 'alza' || sourceId === 'heureka' || sourceId === 'czc' || store === 'alza' || store === 'heureka' || store === 'czc';
  if (isCzkStore && Number.isFinite(Number(item.price))) return Number(item.price) / rate;
  if (Number.isFinite(Number(item.priceCzk)) && Number.isFinite(rate)) return Number(item.priceCzk) / rate;
  if (currency === 'CZK' && Number.isFinite(Number(item.price))) return Number(item.price) / rate;
  return Number.isFinite(Number(item.price)) ? Number(item.price) : null;
}
`;

  const replacements = [
    [`function getMarketOffers(product) {
  if (!product || !Array.isArray(product.offers)) {
    return [];
  }

  return product.offers
    .filter((offer) => Number.isFinite(Number(offer.price)))
    .sort((a, b) => Number(a.price) - Number(b.price));
}`,
marketHelpers + `
function getMarketOffers(product) {
  if (!product || !Array.isArray(product.offers)) return [];
  return product.offers
    .filter((offer) => {
      if (!Number.isFinite(Number(offer.price))) return false;
      const sourceId = String(offer.sourceId || '').toLowerCase();
      const store = String(offer.store || '').toLowerCase();
      return sourceId !== 'idealo' || (offer.condition !== 'open-box' && store !== 'idealo open box');
    })
    .sort((a, b) => marketPriceEur(a) - marketPriceEur(b));
}`],
    [`function getLowestMarketPrice(product) {
  const offers = getMarketOffers(product);

  if (!offers.length) {
    return null;
  }

  return Number(offers[0].price);
}`,
`function getLowestMarketPrice(product) {
  const offers = getMarketOffers(product);
  return offers.length ? marketPriceEur(offers[0]) : null;
}`],
    [`function getMarketCurrency(product) {
  const offers = getMarketOffers(product);

  if (offers.length && offers[0].currency) {
    return offers[0].currency;
  }

  return product?.currency || "CZK";
}`,
`function getMarketCurrency(product) {
  return "EUR";
}`],
    [`function getOfficialPrice(product) {
  if (!product) {
    return null;
  }

  const price = Number(product.officialPrice);

  return Number.isFinite(price) ? price : null;
}`,
`function getOfficialPrice(product) {
  if (!product) return null;
  const eur = Number(product.officialPriceEur);
  if (Number.isFinite(eur) && eur > 0) return eur;
  const price = Number(product.officialPrice);
  return Number.isFinite(price) ? price : null;
}`],
    [`function getOfficialPriceCurrency(product) {
  return product?.officialPriceCurrency || product?.currency || "CZK";
}`,
`function getOfficialPriceCurrency(product) {
  return "EUR";
}`],
    [`function getBestOffer(product) {
  const offers = getMarketOffers(product);

  if (!offers.length) {
    return null;
  }

  return offers[0];
}`,
`function getBestOffer(product) {
  const offers = getMarketOffers(product);
  if (!offers.length) return null;
  const offer = offers[0];
  return { ...offer, price: marketPriceEur(offer), currency: "EUR" };
}`],
    [`function getPriceHistory(product) {
  if (!product || !Array.isArray(product.priceHistory)) {
    return [];
  }

  return product.priceHistory
    .filter(
      (item) =>
        item &&
        Number.isFinite(Number(item.price)) &&
        item.date
    )
    .sort((a, b) =>
      String(a.date).localeCompare(String(b.date))
    );
}`,
`function getPriceHistory(product) {
  if (!product || !Array.isArray(product.priceHistory)) return [];
  return product.priceHistory
    .filter((item) => item && Number.isFinite(Number(item.price)) && item.date)
    .map((item) => {
      const price = historyPriceEur(item, product);
      return { ...item, price, currency: "EUR" };
    })
    .filter((item) => Number.isFinite(item.price) && item.price > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}`]
  ];

  for (const [oldText, newText] of replacements) {
    if (source.includes(oldText)) source = source.replace(oldText, newText);
    else console.warn('WalletRadar data patch: target not found');
  }

  source = ui.replaceWalletRenderer(source);

  const requestMarker = '    try {\n      const requestUrl = new URL(';
  if (source.includes(requestMarker)) {
    source = source.replace(requestMarker, `    try {\n      try {\n        const freshProducts = JSON.parse(fs.readFileSync(productsPath, "utf8"));\n        if (Array.isArray(freshProducts)) products = freshProducts.map(sourceRegistry.normalizeProduct);\n      } catch (refreshErr) {\n        console.error("Live products refresh failed:", refreshErr.message);\n      }\n\n      const requestUrl = new URL(`);
  }

  return module._compile(source, filename);
};
