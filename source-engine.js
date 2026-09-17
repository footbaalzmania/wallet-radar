const DEFAULT_EUR_CZK = 24.8;

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function currencyOf(value) {
  return String(value || '').trim().toUpperCase();
}

function priceInEur(offer) {
  if (!offer) return null;

  const originalCurrency = currencyOf(offer.originalCurrency);
  const currency = currencyOf(offer.currency);
  const originalPrice = numberOrNull(offer.originalPrice);
  const price = numberOrNull(offer.price);
  const priceCzk = numberOrNull(offer.priceCzk);
  const rate = numberOrNull(offer.exchangeRate) || DEFAULT_EUR_CZK;

  if (originalCurrency === 'EUR' && originalPrice !== null) return originalPrice;
  if (currency === 'EUR' && price !== null) return price;
  if (priceCzk !== null) return priceCzk / rate;
  if (currency === 'CZK' && price !== null) return price / rate;
  return price;
}

function normalizeOffer(offer, sourceRegistry) {
  if (!offer) return null;
  const sourceId = offer.sourceId || null;
  const source = sourceRegistry?.getSource?.(sourceId);
  const eur = priceInEur(offer);

  return {
    ...offer,
    sourceId,
    sourceType: offer.sourceType || source?.type || null,
    sourceName: offer.sourceName || source?.name || offer.store || null,
    normalizedPriceEur: eur,
    normalizedCurrency: eur === null ? null : 'EUR',
    status: offer.status || 'ok',
  };
}

function isOpenBox(offer) {
  const sourceId = String(offer?.sourceId || '').toLowerCase();
  const store = String(offer?.store || '').toLowerCase();
  return sourceId === 'idealo' && (offer?.condition === 'open-box' || store === 'idealo open box');
}

function getMarketOffers(product, sourceRegistry) {
  if (!product || !Array.isArray(product.offers)) return [];
  return product.offers
    .map((offer) => normalizeOffer(offer, sourceRegistry))
    .filter((offer) => offer && !isOpenBox(offer) && Number.isFinite(offer.normalizedPriceEur))
    .sort((a, b) => a.normalizedPriceEur - b.normalizedPriceEur);
}

function getBestOffer(product, sourceRegistry) {
  return getMarketOffers(product, sourceRegistry)[0] || null;
}

function getOfficialPrice(product) {
  if (!product) return null;
  const eur = numberOrNull(product.officialPriceEur);
  if (eur !== null && eur > 0) return eur;
  const price = numberOrNull(product.officialPrice);
  const currency = currencyOf(product.officialPriceCurrency || product.currency);
  if (price === null) return null;
  if (currency === 'CZK') return price / DEFAULT_EUR_CZK;
  return price;
}

function getOfficialPriceCurrency() {
  return 'EUR';
}

function getMarketCurrency() {
  return 'EUR';
}

function getPriceHistory(product) {
  if (!product || !Array.isArray(product.priceHistory)) return [];
  return product.priceHistory
    .filter((item) => item && item.date)
    .map((item) => {
      const price = priceInEur(item);
      return { ...item, price, currency: 'EUR' };
    })
    .filter((item) => Number.isFinite(item.price) && item.price > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function getLowestMarketPrice(product, sourceRegistry) {
  const offer = getBestOffer(product, sourceRegistry);
  return offer ? offer.normalizedPriceEur : null;
}

function getOpenBoxOffer(product, sourceRegistry) {
  if (!product || !Array.isArray(product.offers)) return null;
  return product.offers
    .map((offer) => normalizeOffer(offer, sourceRegistry))
    .filter((offer) => offer && isOpenBox(offer) && Number.isFinite(offer.normalizedPriceEur))
    .sort((a, b) => a.normalizedPriceEur - b.normalizedPriceEur)[0] || null;
}

function collectResult({ sourceId, productSlug, price, currency, url, condition = 'new', status = 'ok', error = null }) {
  return { sourceId, productSlug, price: numberOrNull(price), currency: currencyOf(currency), url: url || null, condition, status, error, fetchedAt: new Date().toISOString() };
}

function mergeOffer(product, result, sourceRegistry) {
  if (!product || !result || result.status !== 'ok' || result.price === null) return false;
  if (!Array.isArray(product.offers)) product.offers = [];
  const existing = product.offers.find((offer) => offer.sourceId === result.sourceId && (offer.condition || 'new') === result.condition);
  const next = {
    sourceId: result.sourceId,
    store: sourceRegistry?.getSource?.(result.sourceId)?.name || result.sourceId,
    price: result.price,
    currency: result.currency,
    condition: result.condition,
    url: result.url,
    priceSource: 'collector',
    fetchedAt: result.fetchedAt,
    status: 'ok',
  };
  if (existing) Object.assign(existing, next);
  else product.offers.push(next);
  return true;
}

module.exports = {
  DEFAULT_EUR_CZK,
  numberOrNull,
  priceInEur,
  normalizeOffer,
  getMarketOffers,
  getBestOffer,
  getOfficialPrice,
  getOfficialPriceCurrency,
  getMarketCurrency,
  getPriceHistory,
  getLowestMarketPrice,
  getOpenBoxOffer,
  collectResult,
  mergeOffer,
};
