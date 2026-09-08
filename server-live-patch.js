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
    .sort((a, b) => marketPriceEur(a) - marketPriceEur(b));
}

function marketPriceEur(offer) {
  if (!offer) return null;

  const originalCurrency = String(offer.originalCurrency || '').toUpperCase();
  const currency = String(offer.currency || '').toUpperCase();

  if (originalCurrency === 'EUR' && Number.isFinite(Number(offer.originalPrice))) {
    return Number(offer.originalPrice);
  }
  if (currency === 'EUR' && Number.isFinite(Number(offer.price))) {
    return Number(offer.price);
  }
  if (Number.isFinite(Number(offer.priceCzk))) {
    return Number(offer.priceCzk) / 24.8;
  }
  if (currency === 'CZK' && Number.isFinite(Number(offer.price))) {
    return Number(offer.price) / 24.8;
  }
  return Number.isFinite(Number(offer.price)) ? Number(offer.price) : null;
}

function getOpenBoxOffer(product) {
  if (!product || !Array.isArray(product.offers)) return null;

  const offers = product.offers.filter((offer) => {
    const store = String(offer.store || '').toLowerCase();
    return store === 'idealo open box' || offer.condition === 'open-box';
  });

  offers.sort((a, b) => marketPriceEur(a) - marketPriceEur(b));
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
  return marketPriceEur(offers[0]);
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
  return "EUR";
}`
    ],
    [
`function getOfficialPriceCurrency(product) {
  return product?.officialPriceCurrency || product?.currency || "CZK";
}`,
`function getOfficialPriceCurrency(product) {
  return "EUR";
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
  const priceEur = marketPriceEur(offer);
  const openBox = getOpenBoxOffer(product);
  const openBoxPriceEur = openBox ? marketPriceEur(openBox) : null;

  return {
    ...offer,
    price: priceEur,
    currency: "EUR",
    store: openBox && Number.isFinite(openBoxPriceEur)
      ? (offer.store || "market") + " · open-box " + openBoxPriceEur.toFixed(2) + " EUR"
      : (offer.store || "market")
  };
}`
    ],
    [
`    try {
      const requestUrl = new URL(`,
`    try {
      // Reload persisted price data before every request so asynchronous collectors
      // such as Idealo are visible without restarting the Node process.
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

  const historyFunction = `
function getPriceHistory(product) {
  if (!product || !Array.isArray(product.priceHistory)) return [];

  return product.priceHistory
    .filter((item) => item && Number.isFinite(Number(item.price)) && item.date)
    .map((item) => {
      const currency = String(item.currency || product.currency || "CZK").toUpperCase();
      let price = Number(item.price);
      if (currency === "EUR") price = Number(item.originalPrice ?? item.price);
      else if (Number.isFinite(Number(item.priceCzk))) price = Number(item.priceCzk) / 24.8;
      else if (currency === "CZK") price = price / 24.8;
      return { ...item, price, currency: "EUR" };
    })
    .filter((item) => Number.isFinite(item.price) && item.price > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
`;

  source = source.replace(/function getPriceHistory\(product\) \{[\s\S]*?\n\}\n\nfunction getDealScore/, historyFunction + '\nfunction getDealScore');

  const marketOffersFunction = `
function renderMarketOffers(product) {
  const allOffers = Array.isArray(product?.offers) ? product.offers : [];

  const isIdealo = (offer) => {
    const store = String(offer?.store || '').trim().toLowerCase();
    return store === 'idealo' || store === 'idealo open box' || store.startsWith('idealo ');
  };

  const priceValue = (offer) => {
    const originalCurrency = String(offer?.originalCurrency || '').toUpperCase();
    if (originalCurrency === 'EUR' && Number.isFinite(Number(offer?.originalPrice))) return Number(offer.originalPrice);
    const currency = String(offer?.currency || '').toUpperCase();
    if (currency === 'EUR' && Number.isFinite(Number(offer?.price))) return Number(offer.price);
    if (Number.isFinite(Number(offer?.priceCzk))) return Number(offer.priceCzk) / 24.8;
    if (currency === 'CZK' && Number.isFinite(Number(offer?.price))) return Number(offer.price) / 24.8;
    return Number.isFinite(Number(offer?.price)) ? Number(offer.price) : null;
  };

  const idealoOffers = allOffers
    .filter((offer) => isIdealo(offer) && priceValue(offer) !== null)
    .sort((a, b) => priceValue(a) - priceValue(b));

  if (!idealoOffers.length) return '';

  const standard = idealoOffers.find((offer) => {
    const store = String(offer?.store || '').trim().toLowerCase();
    return store === 'idealo' && offer?.condition !== 'open-box';
  }) || idealoOffers.find((offer) => offer?.condition !== 'open-box') || null;

  const openBox = idealoOffers.find((offer) => {
    const store = String(offer?.store || '').trim().toLowerCase();
    return store === 'idealo open box' || offer?.condition === 'open-box';
  }) || null;

  const offers = [standard, openBox].filter(Boolean);
  if (!offers.length) return '';

  return '<div class="market-offers" style="margin-top:16px;padding:14px;border:1px solid #d7f2df;border-radius:16px;background:linear-gradient(135deg,#f3fff7,#ffffff);">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:11px;">' +
      '<div><div style="font-size:12px;font-weight:900;color:#111827;letter-spacing:.08em;text-transform:uppercase;">Idealo Prices</div>' +
      '<div style="font-size:11px;color:#15803d;margin-top:3px;">Best offers from idealo.de · EUR</div></div>' +
      '<span style="font-size:11px;font-weight:900;color:#111827;">idealo</span>' +
    '</div>' +
    '<div style="display:grid;gap:8px;">' +
    offers.map((offer) => {
      const store = String(offer?.store || '').trim().toLowerCase();
      const isOpenBox = store === 'idealo open box' || offer?.condition === 'open-box';
      const price = priceValue(offer);
      const label = isOpenBox ? 'Idealo · Open-box' : 'Idealo · New';
      const url = offer?.url || offer?.affiliateUrl || 'https://www.idealo.de/';

      return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 11px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;text-decoration:none;color:inherit;">' +
        '<span style="display:flex;flex-direction:column;min-width:0;"><span style="font-size:12px;color:#6b7280;">' + escapeHtml(label) + '</span><strong style="font-size:15px;color:#111827;">' + formatPrice(price, 'EUR') + '</strong></span>' +
        '<span style="padding:7px 10px;border-radius:9px;background:#16a34a;color:#fff;font-size:12px;font-weight:900;white-space:nowrap;">View offer ↗</span></a>';
    }).join('') +
    '</div></div>';
}
`;

  if (source.includes('function renderWalletCard(product) {') && !source.includes('function renderMarketOffers(product) {')) {
    source = source.replace('function renderWalletCard(product) {', marketOffersFunction + '\nfunction renderWalletCard(product) {');
  }

  if (!source.includes('${renderMarketOffers(product)}')) {
    source = source.replace(
      '        <div class="wallet-actions">',
      '        ${renderMarketOffers(product)}\n\n        <div class="wallet-actions">'
    );
  }

  return module._compile(source, filename);
};
