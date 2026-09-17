const Module = require('module');
const fs = require('fs');
const original = Module._extensions['.js'];
const ui = require('./wallet-radar-ui.js');
const sourceEngine = require('./source-engine.js');
const sourceRegistry = require('./source-registry.js');

Module._extensions['.js'] = function(module, filename) {
  if (!filename.endsWith('/server.js')) return original(module, filename);

  let source = fs.readFileSync(filename, 'utf8');

  if (!source.includes("const sourceRegistry = require('./source-registry.js');")) {
    source = "const sourceRegistry = require('./source-registry.js');\n" + source;
  }
  if (!source.includes("const sourceEngine = require('./source-engine.js');")) {
    source = "const sourceEngine = require('./source-engine.js');\n" + source;
  }

  const replacements = [
    [`function getMarketOffers(product) {
  if (!product || !Array.isArray(product.offers)) {
    return [];
  }

  return product.offers
    .filter((offer) => Number.isFinite(Number(offer.price)))
    .sort((a, b) => Number(a.price) - Number(b.price));
}`,
`function getMarketOffers(product) {
  return sourceEngine.getMarketOffers(product, sourceRegistry);
}`],
    [`function getLowestMarketPrice(product) {
  const offers = getMarketOffers(product);

  if (!offers.length) {
    return null;
  }

  return Number(offers[0].price);
}`,
`function getLowestMarketPrice(product) {
  return sourceEngine.getLowestMarketPrice(product, sourceRegistry);
}`],
    [`function getMarketCurrency(product) {
  const offers = getMarketOffers(product);

  if (offers.length && offers[0].currency) {
    return offers[0].currency;
  }

  return product?.currency || "CZK";
}`,
`function getMarketCurrency(product) {
  return sourceEngine.getMarketCurrency(product);
}`],
    [`function getOfficialPrice(product) {
  if (!product) {
    return null;
  }

  const price = Number(product.officialPrice);

  return Number.isFinite(price) ? price : null;
}`,
`function getOfficialPrice(product) {
  return sourceEngine.getOfficialPrice(product);
}`],
    [`function getOfficialPriceCurrency(product) {
  return product?.officialPriceCurrency || product?.currency || "CZK";
}`,
`function getOfficialPriceCurrency(product) {
  return sourceEngine.getOfficialPriceCurrency(product);
}`],
    [`function getBestOffer(product) {
  const offers = getMarketOffers(product);

  if (!offers.length) {
    return null;
  }

  return offers[0];
}`,
`function getBestOffer(product) {
  return sourceEngine.getBestOffer(product, sourceRegistry);
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
  return sourceEngine.getPriceHistory(product);
}`]
  ];

  for (const [oldText, newText] of replacements) {
    if (source.includes(oldText)) source = source.replace(oldText, newText);
    else console.warn('WalletRadar Source Engine patch: target not found');
  }

  source = ui.replaceWalletRenderer(source);

  const requestMarker = '    try {\n      const requestUrl = new URL(';
  if (source.includes(requestMarker)) {
    source = source.replace(requestMarker, `    try {\n      try {\n        const freshProducts = JSON.parse(fs.readFileSync(productsPath, "utf8"));\n        if (Array.isArray(freshProducts)) products = freshProducts.map(sourceRegistry.normalizeProduct);\n      } catch (refreshErr) {\n        console.error("Live products refresh failed:", refreshErr.message);\n      }\n\n      const requestUrl = new URL(`);
  }

  return module._compile(source, filename);
};
