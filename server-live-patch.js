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

  const marketOffersFunction = `
function renderMarketOffers(product) {
  const standard = getMarketOffers(product).find((offer) => String(offer.store || '').toLowerCase() === 'idealo') || null;
  const openBox = getOpenBoxOffer(product);
  const offers = [standard, openBox].filter(Boolean);
  if (!offers.length) return '';

  return '<div class="market-offers" style="margin-top:16px;padding:14px;border:1px solid #d7f2df;border-radius:16px;background:linear-gradient(135deg,#f3fff7,#ffffff);">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:11px;">' +
      '<div><div style="font-size:12px;font-weight:900;color:#111827;letter-spacing:.08em;text-transform:uppercase;">Idealo Prices</div>' +
      '<div style="font-size:11px;color:#15803d;margin-top:3px;">Best offers from idealo.de</div></div>' +
      '<span style="font-size:11px;font-weight:900;color:#111827;">idealo</span>' +
    '</div>' +
    '<div style="display:grid;gap:8px;">' +
    offers.map((offer) => {
      const isOpenBox = String(offer.store || '').toLowerCase() === 'idealo open box' || offer.condition === 'open-box';
      const price = Number.isFinite(Number(offer.priceCzk)) ? Number(offer.priceCzk) : Number(offer.price);
      const currency = Number.isFinite(Number(offer.priceCzk)) ? 'CZK' : (offer.currency || 'CZK');
      const label = isOpenBox ? 'Idealo · Open-box' : 'Idealo · New';
      return '<a href="' + escapeHtml(offer.url || offer.affiliateUrl || '#') + '" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 11px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;text-decoration:none;color:inherit;">' +
        '<span style="display:flex;flex-direction:column;min-width:0;"><span style="font-size:12px;color:#6b7280;">' + escapeHtml(label) + '</span><strong style="font-size:15px;color:#111827;">' + formatPrice(price, currency) + '</strong></span>' +
        '<span style="padding:7px 10px;border-radius:9px;background:#16a34a;color:#fff;font-size:12px;font-weight:900;white-space:nowrap;">View offer ↗</span></a>';
    }).join('') +
    '</div></div>';
}
`;

  if (source.includes('function renderWalletCard(product) {') && !source.includes('function renderMarketOffers(product) {')) {
    source = source.replace('function renderWalletCard(product) {', marketOffersFunction + '\nfunction renderWalletCard(product) {');
  }

  source = source.replace(
    '        <div class="wallet-actions">',
    '        ' + '${renderMarketOffers(product)}' + '\n\n        <div class="wallet-actions">'
  );

  return module._compile(source, filename);
};
