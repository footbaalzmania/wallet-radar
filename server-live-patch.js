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
    .filter((offer) => Number.isFinite(Number(offer.price)))
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

  return {
    ...offer,
    price: priceCzk,
    currency: "CZK",
    store: offer.store || "market"
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

  const offerHelper = [
    'function renderMarketOffers(product) {',
    '  const offers = getMarketOffers(product).slice(0, 3);',
    '  if (!offers.length) return "";',
    '  const rows = offers.map((offer) => {',
    '    const price = Number.isFinite(Number(offer.priceCzk)) ? Number(offer.priceCzk) : Number(offer.price);',
    '    const currency = Number.isFinite(Number(offer.priceCzk)) ? "CZK" : (offer.currency || "CZK");',
    '    const isOpenBox = offer.condition === "open-box" || String(offer.store || "").toLowerCase() === "idealo open box";',
    '    const label = String(offer.store || "Market") + (isOpenBox ? " · open-box" : "");',
    '    const href = offer.affiliateUrl || offer.url || "#";',
    '    return "<a href=\\"" + escapeHtml(href) + "\\" target=\\"_blank\\" rel=\\"noopener noreferrer\\" style=\\"display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;text-decoration:none;color:inherit;background:#fff;\\"><span style=\\"font-size:13px;font-weight:700;\\">" + escapeHtml(label) + "</span><strong style=\\"white-space:nowrap;font-size:14px;\\">" + formatPrice(price, currency) + " ↗</strong></a>";',
    '  }).join("");',
    '  return "<div class=\\"market-offers\\"><div class=\\"market-offers-title\\">Nejlepší nabídky</div>" + rows + "</div>";',
    '}',
    ''
  ].join("\\n");

  source = source.replace(
    '\\nfunction renderWalletCard(product) {',
    '\\n' + offerHelper + '\\nfunction renderWalletCard(product) {'
  );

  source = source.replace(
    '        <div class="wallet-actions">',
    '        ${renderMarketOffers(product)}\\n\\n        <div class="wallet-actions">'
  );

  source = source.replace(
    '</style>',
    '.market-offers{margin-top:14px;padding-top:14px;border-top:1px solid #e5e7eb}.market-offers-title{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;margin-bottom:8px}.market-offers{display:grid;gap:7px}.market-offers>a{transition:transform .12s ease,box-shadow .12s ease}.market-offers>a:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.06)}\\n</style>'
  );

  return module._compile(source, filename);
};
