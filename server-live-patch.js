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

  const helper = `
function renderMarketOffers(product) {
  const offers = getMarketOffers(product)
    .filter((offer) => offer && Number.isFinite(Number(offer.price)))
    .slice(0, 3);

  if (!offers.length) return "";

  const rows = offers.map((offer) => {
    const price = Number.isFinite(Number(offer.priceCzk)) ? Number(offer.priceCzk) : Number(offer.price);
    const currency = Number.isFinite(Number(offer.priceCzk)) ? "CZK" : (offer.currency || "CZK");
    const condition = offer.condition === "open-box" || String(offer.store || "").toLowerCase() === "idealo open box" ? " · open-box" : "";
    const href = offer.url || offer.affiliateUrl || "#";
    return '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer" style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 10px;border:1px solid #e5e7eb;border-radius:9px;background:#fff;font-size:13px;">' +
      '<span style="font-weight:750;">' + escapeHtml(offer.store || "Market") + escapeHtml(condition) + '</span>' +
      '<strong style="white-space:nowrap;">' + formatPrice(price, currency) + ' ↗</strong>' +
      '</a>';
  }).join("");

  return '<div style="margin-top:16px;padding-top:14px;border-top:1px solid #e5e7eb;">' +
    '<div style="font-size:12px;font-weight:800;color:#6b7280;margin-bottom:9px;text-transform:uppercase;letter-spacing:.05em;">Best market offers</div>' +
    '<div style="display:grid;gap:7px;">' + rows + '</div>' +
    '</div>';
}
`;

  source = source.replace(
    '\nfunction renderWalletCard(product) {',
    '\n' + helper + '\nfunction renderWalletCard(product) {'
  );

  source = source.replace(
    '        <div class="wallet-actions">',
    '        ${renderMarketOffers(product)}\n\n        <div class="wallet-actions">'
  );

  return module._compile(source, filename);
};
