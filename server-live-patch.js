const Module = require('module');
const fs = require('fs');
const original = Module._extensions['.js'];

Module._extensions['.js'] = function(module, filename) {
  if (!filename.endsWith('/server.js')) return original(module, filename);

  let source = fs.readFileSync(filename, 'utf8');

  const replacements = [
    [
`function getMarketOffers(product) {
  if (!product || !Array.isArray(product.offers)) {
    return [];
  }

  return product.offers
    .filter((offer) => Number.isFinite(Number(offer.price)))
    .sort((a, b) => Number(a.price) - Number(b.price));
}`,
`function getMarketOffers(product) {
  if (!product || !Array.isArray(product.offers)) return [];

  return product.offers
    .filter((offer) => {
      if (!Number.isFinite(Number(offer.price))) return false;
      const store = String(offer.store || '').toLowerCase();
      return store !== 'idealo open box' && offer.condition !== 'open-box';
    })
    .sort((a, b) => {
      const ap = Number.isFinite(Number(a.priceCzk)) ? Number(a.priceCzk) : Number(a.price);
      const bp = Number.isFinite(Number(b.priceCzk)) ? Number(b.priceCzk) : Number(b.price);
      return ap - bp;
    });
}

function getOpenBoxOffer(product) {
  if (!product || !Array.isArray(product.offers)) return null;

  const offers = product.offers.filter((offer) => {
    const store = String(offer.store || '').toLowerCase();
    return store === 'idealo open box' || offer.condition === 'open-box';
  });

  offers.sort((a, b) => {
    const ap = Number.isFinite(Number(a.priceCzk)) ? Number(a.priceCzk) : Number(a.price);
    const bp = Number.isFinite(Number(b.priceCzk)) ? Number(b.priceCzk) : Number(b.price);
    return ap - bp;
  });

  return offers[0] || null;
}`
    ],
    [
`function getLowestMarketPrice(product) {
  const offers = getMarketOffers(product);

  if (!offers.length) {
    return null;
  }

  return Number(offers[0].price);
}`,
`function getLowestMarketPrice(product) {
  const offers = getMarketOffers(product);

  if (!offers.length) return null;

  const offer = offers[0];
  return Number.isFinite(Number(offer.priceCzk))
    ? Number(offer.priceCzk)
    : Number(offer.price);
}`
    ],
    [
`function getMarketCurrency(product) {
  const offers = getMarketOffers(product);

  if (offers.length && offers[0].currency) {
    return offers[0].currency;
  }

  return product?.currency || "CZK";
}`,
`function getMarketCurrency(product) {
  return "CZK";
}`
    ],
    [
`function getBestOffer(product) {
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
  const priceCzk = Number.isFinite(Number(offer.priceCzk)) ? Number(offer.priceCzk) : Number(offer.price);
  const openBox = getOpenBoxOffer(product);

  return {
    ...offer,
    price: priceCzk,
    currency: "CZK",
    store: openBox
      ? (offer.store || "market") + " · open-box " + (Number.isFinite(Number(openBox.priceCzk)) ? Math.round(Number(openBox.priceCzk)) : Number(openBox.price)) + " CZK"
      : (offer.store || "market")
  };
}`
    ],
    [
`    try {
      const requestUrl = new URL(`,
`    try {
      // Reload the persisted price data before every request. The price collectors
      // run asynchronously after startup, so the original in-memory snapshot can
      // otherwise become stale and hide newly collected Idealo/Heureka/Amazon data.
      try {
        const freshProducts = JSON.parse(fs.readFileSync(productsPath, "utf8"));
        if (Array.isArray(freshProducts)) products = freshProducts;
      } catch (refreshErr) {
        console.error("Live products refresh failed:", refreshErr.message);
      }

      const requestUrl = new URL(`
    ]
  ];

  for (const [oldText, newText] of replacements) {
    if (!source.includes(oldText)) {
      console.warn('WalletRadar patch: target not found');
    } else {
      source = source.replace(oldText, newText);
    }
  }

  return module._compile(source, filename);
};
