const Module = require('module');
const fs = require('fs');
const original = Module._extensions['.js'];
const ui = require('./wallet-radar-ui.js');
const sourceEngine = require('./source-engine.js');
const sourceRegistry = require('./source-registry.js');

Module._extensions['.js'] = function(module, filename) {
  if (!filename.endsWith('/server.js')) return original(module, filename);

  let source = fs.readFileSync(filename, 'utf8');
  const runtimePrefix = [
    "const sourceRegistry = require('./source-registry.js');",
    "const sourceEngine = require('./source-engine.js');",
    "const marketPriceEur = sourceEngine.priceInEur;"
  ].join('\n') + '\n';

  source = source.replace(/^const sourceRegistry = require\('\.\/source-registry\.js'\);\n?/m, '');
  source = source.replace(/^const sourceEngine = require\('\.\/source-engine\.js'\);\n?/m, '');
  source = source.replace(/^const marketPriceEur = sourceEngine\.priceInEur;\n?/m, '');
  source = runtimePrefix + source;

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
    [`function getCurrentPrice(product) {
  const marketPrice = getLowestMarketPrice(product);

  if (Number.isFinite(marketPrice)) {
    return marketPrice;
  }

  if (Number.isFinite(Number(product?.officialPrice))) {
    return Number(product.officialPrice);
  }

  return null;
}`,
`function getCurrentPrice(product) {
  return sourceEngine.getCurrentPrice(product, sourceRegistry);
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
}`],
    [`function getDealScore(product) {
  const current = getCurrentPrice(product);
  const history = getPriceHistory(product);

  if (!Number.isFinite(current) || current <= 0) {
    return null;
  }

  /*
    Deal Score should be based on real historical observations,
    not just the current price duplicated into the history.
    We wait for at least 7 observations before showing a score.
  */
  const historicalPrices = history
    .map((item) => Number(item.price))
    .filter((price) => Number.isFinite(price) && price > 0);

  if (historicalPrices.length < 7) {
    return null;
  }

  /*
    Score the current price by its position against historical prices.

    100 = current price is at or below all tracked historical prices.
    50  = roughly middle of the historical range.
    0   = current price is at or above all tracked historical prices.

    Using the historical distribution rather than only min/max makes the
    score less sensitive to one unusual outlier.
  */
  const betterOrEqualCount = historicalPrices.filter(
    (price) => price >= current
  ).length;

  const score =
    (betterOrEqualCount / historicalPrices.length) * 100;

  return Math.max(0, Math.min(100, Math.round(score)));
}`,
`function getDealScore(product) {
  return sourceEngine.getDealScore(product, sourceRegistry);
}`],
    [`function getDealStatus(score) {
  if (score === null) {
    return "Building price history";
  }

  if (score >= 80) {
    return "Excellent deal";
  }

  if (score >= 60) {
    return "Good deal";
  }

  if (score >= 40) {
    return "Fair price";
  }

  return "High price";
}`,
`function getDealStatus(score) {
  return sourceEngine.getDealStatus(score);
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
    [`function getPriceDifference(product) {
  const official = getOfficialPrice(product);
  const market = getLowestMarketPrice(product);

  if (
    !Number.isFinite(official) ||
    !Number.isFinite(market) ||
    official <= 0
  ) {
    return null;
  }

  return market - official;
}`,
`function getPriceDifference(product) {
  return sourceEngine.getPriceDifference(product, sourceRegistry);
}`],
    [`function getPriceDifferencePercent(product) {
  const official = getOfficialPrice(product);
  const market = getLowestMarketPrice(product);

  if (
    !Number.isFinite(official) ||
    !Number.isFinite(market) ||
    official <= 0
  ) {
    return null;
  }

  return ((market - official) / official) * 100;
}`,
`function getPriceDifferencePercent(product) {
  return sourceEngine.getPriceDifferencePercent(product, sourceRegistry);
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
