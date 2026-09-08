const Module = require('module');
const fs = require('fs');
const original = Module._extensions['.js'];

Module._extensions['.js'] = function(module, filename) {
  if (!filename.endsWith('/server.js')) return original(module, filename);

  let source = fs.readFileSync(filename, 'utf8');
  const EUR_RATE_FALLBACK = 24.8;

  const marketHelpers = `
function marketPriceEur(offer) {
  if (!offer) return null;
  const originalCurrency = String(offer.originalCurrency || '').toUpperCase();
  const currency = String(offer.currency || '').toUpperCase();
  if (originalCurrency === 'EUR' && Number.isFinite(Number(offer.originalPrice))) return Number(offer.originalPrice);
  if (currency === 'EUR' && Number.isFinite(Number(offer.price))) return Number(offer.price);
  const rate = Number(offer.exchangeRate) || EUR_RATE_FALLBACK;
  if (Number.isFinite(Number(offer.priceCzk))) return Number(offer.priceCzk) / rate;
  if (currency === 'CZK' && Number.isFinite(Number(offer.price))) return Number(offer.price) / rate;
  return Number.isFinite(Number(offer.price)) ? Number(offer.price) : null;
}

function getOpenBoxOffer(product) {
  if (!product || !Array.isArray(product.offers)) return null;
  return product.offers
    .filter((offer) => {
      const store = String(offer.store || '').toLowerCase();
      return store === 'idealo open box' || offer.condition === 'open-box';
    })
    .filter((offer) => Number.isFinite(marketPriceEur(offer)))
    .sort((a, b) => marketPriceEur(a) - marketPriceEur(b))[0] || null;
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
      const store = String(offer.store || '').toLowerCase();
      return store !== 'idealo open box' && offer.condition !== 'open-box';
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
      const currency = String(item.currency || product.currency || "CZK").toUpperCase();
      let price = Number(item.price);
      const rate = Number(item.exchangeRate) || EUR_RATE_FALLBACK;
      if (currency === "EUR") price = Number(item.originalPrice ?? item.price);
      else if (Number.isFinite(Number(item.priceCzk))) price = Number(item.priceCzk) / rate;
      else if (currency === "CZK") price = price / rate;
      return { ...item, price, currency: "EUR" };
    })
    .filter((item) => Number.isFinite(item.price) && item.price > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}`]
  ];

  for (const [oldText, newText] of replacements) {
    if (source.includes(oldText)) source = source.replace(oldText, newText);
    else console.warn('WalletRadar patch: target not found');
  }

  // Replace the complete wallet card renderer so the EUR display and Idealo block
  // are independent of the original server renderer.
  const renderStart = source.indexOf('function renderWalletCard(product) {');
  const renderEnd = source.indexOf('\nfunction renderHome() {', renderStart);
  if (renderStart !== -1 && renderEnd !== -1) {
    const newRenderer = `function renderWalletCard(product) {
  const officialPrice = getOfficialPrice(product);
  const marketPrice = getLowestMarketPrice(product);
  const score = getDealScore(product);
  const status = getDealStatus(score);
  const bestOffer = getBestOffer(product);
  const eur = (value) => Number.isFinite(Number(value)) ? formatPrice(Number(value), 'EUR') : '—';

  const image = product.image ? \`
    <a href="/go/\${escapeHtml(product.slug)}" class="wallet-image" aria-label="Buy \${escapeHtml(product.name)} at Trezor">
      <img src="\${escapeHtml(product.image)}" alt="\${escapeHtml(product.name)}" loading="lazy">
    </a>\` : '';

  const idealoOffers = (Array.isArray(product.offers) ? product.offers : [])
    .filter((offer) => {
      const store = String(offer.store || '').toLowerCase();
      return (store === 'idealo' || store === 'idealo open box' || store.startsWith('idealo ')) && Number.isFinite(marketPriceEur(offer));
    })
    .sort((a, b) => marketPriceEur(a) - marketPriceEur(b));

  const newOffer = idealoOffers.find((offer) => {
    const store = String(offer.store || '').toLowerCase();
    return store === 'idealo' && offer.condition !== 'open-box';
  }) || null;
  const openBoxOffer = idealoOffers.find((offer) => {
    const store = String(offer.store || '').toLowerCase();
    return store === 'idealo open box' || offer.condition === 'open-box';
  }) || null;

  const idealoRows = [newOffer, openBoxOffer].filter(Boolean).map((offer) => {
    const store = String(offer.store || '').toLowerCase();
    const openBox = store === 'idealo open box' || offer.condition === 'open-box';
    const price = marketPriceEur(offer);
    const url = offer.url || offer.affiliateUrl || 'https://www.idealo.de/';
    return \`<a href="\${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 11px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;text-decoration:none;color:inherit;">
      <span style="display:flex;flex-direction:column;min-width:0;"><span style="font-size:12px;color:#6b7280;">\${openBox ? 'Idealo · Open-box' : 'Idealo · New'}</span><strong style="font-size:15px;color:#111827;">\${eur(price)}</strong></span>
      <span style="padding:7px 10px;border-radius:9px;background:#16a34a;color:#fff;font-size:12px;font-weight:900;white-space:nowrap;">View offer ↗</span>
    </a>\`;
  }).join('');

  const idealoCard = idealoRows ? \`
    <div class="idealo-prices" style="margin-top:16px;padding:14px;border:1px solid #d7f2df;border-radius:16px;background:linear-gradient(135deg,#f3fff7,#ffffff);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:11px;">
        <div><div style="font-size:12px;font-weight:900;color:#111827;letter-spacing:.08em;text-transform:uppercase;">Idealo Prices</div><div style="font-size:11px;color:#15803d;margin-top:3px;">Best offers from idealo.de · EUR</div></div>
        <span style="font-size:11px;font-weight:900;color:#111827;">idealo</span>
      </div>
      <div style="display:grid;gap:8px;">\${idealoRows}</div>
    </div>\` : '';

  const scoreHtml = score === null
    ? '<span class="deal-badge">Building price history</span>'
    : '<span class="deal-badge">' + escapeHtml(status) + '</span><span class="deal-score">' + score + '/100</span>';
  const bestOfferText = bestOffer ? 'Best market offer: ' + eur(bestOffer.price) : 'Market offers are being added';

  return \`
    <article class="wallet-card">
      \${image}
      <div class="wallet-content">
        <div class="wallet-brand">\${escapeHtml(product.brand)}</div>
        <div class="wallet-name">\${escapeHtml(product.name)}</div>
        <div class="price-block">
          <div class="official-label">Official Trezor price</div>
          <div class="official-price">\${Number.isFinite(officialPrice) ? eur(officialPrice) : '—'}</div>
          <div class="market-price">Market price: <strong>\${Number.isFinite(marketPrice) ? eur(marketPrice) : 'Not tracked yet'}</strong></div>
        </div>
        <div class="deal-row">\${scoreHtml}</div>
        <div class="note">\${escapeHtml(bestOfferText)}</div>
        \${idealoCard}
        <div class="wallet-actions">
          <a href="/go/\${escapeHtml(product.slug)}" class="buy-button">Buy at Trezor</a>
          <a href="/product/\${escapeHtml(product.slug)}" class="secondary-button">View price history</a>
        </div>
      </div>
    </article>
  \`;
}
`;
    source = source.slice(0, renderStart) + newRenderer + source.slice(renderEnd + 1);
  } else {
    console.error('WalletRadar patch: renderWalletCard boundaries not found');
  }

  const requestMarker = '    try {\n      const requestUrl = new URL(';
  if (source.includes(requestMarker)) {
    source = source.replace(requestMarker, `    try {\n      try {\n        const freshProducts = JSON.parse(fs.readFileSync(productsPath, "utf8"));\n        if (Array.isArray(freshProducts)) products = freshProducts;\n      } catch (refreshErr) {\n        console.error("Live products refresh failed:", refreshErr.message);\n      }\n\n      const requestUrl = new URL(`);
  }

  return module._compile(source, filename);
};
