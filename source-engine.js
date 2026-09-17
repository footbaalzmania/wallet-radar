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

function isEnabledSource(offer, sourceRegistry) {
  const sourceId = offer?.sourceId;
  return !sourceId || !sourceRegistry?.getSource || sourceRegistry.isEnabled(sourceId);
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
    .filter((offer) => offer && isEnabledSource(offer, sourceRegistry) && !isOpenBox(offer) && Number.isFinite(offer.normalizedPriceEur))
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

function getOfficialPriceCurrency() { return 'EUR'; }
function getMarketCurrency() { return 'EUR'; }

function getPriceHistory(product) {
  if (!product || !Array.isArray(product.priceHistory)) return [];
  return product.priceHistory
    .filter((item) => item && item.date)
    .map((item) => ({ ...item, price: priceInEur(item), currency: 'EUR' }))
    .filter((item) => Number.isFinite(item.price) && item.price > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function getLowestMarketPrice(product, sourceRegistry) {
  const offer = getBestOffer(product, sourceRegistry);
  return offer ? offer.normalizedPriceEur : null;
}

function getCurrentPrice(product, sourceRegistry) {
  const market = getLowestMarketPrice(product, sourceRegistry);
  return Number.isFinite(market) ? market : getOfficialPrice(product);
}

function getDealScore(product, sourceRegistry) {
  const current = getCurrentPrice(product, sourceRegistry);
  const history = getPriceHistory(product);
  if (!Number.isFinite(current) || current <= 0 || history.length < 7) return null;
  const historicalPrices = history.map((item) => Number(item.price)).filter((price) => Number.isFinite(price) && price > 0);
  if (historicalPrices.length < 7) return null;
  const betterOrEqualCount = historicalPrices.filter((price) => price >= current).length;
  return Math.max(0, Math.min(100, Math.round((betterOrEqualCount / historicalPrices.length) * 100)));
}

function getDealStatus(score) {
  if (score === null) return 'Building price history';
  if (score >= 80) return 'Excellent deal';
  if (score >= 60) return 'Good deal';
  if (score >= 40) return 'Fair price';
  return 'High price';
}

function getPriceDifference(product, sourceRegistry) {
  const official = getOfficialPrice(product);
  const market = getLowestMarketPrice(product, sourceRegistry);
  if (!Number.isFinite(official) || !Number.isFinite(market) || official <= 0) return null;
  return market - official;
}

function getPriceDifferencePercent(product, sourceRegistry) {
  const official = getOfficialPrice(product);
  const market = getLowestMarketPrice(product, sourceRegistry);
  if (!Number.isFinite(official) || !Number.isFinite(market) || official <= 0) return null;
  return ((market - official) / official) * 100;
}

function getOpenBoxOffer(product, sourceRegistry) {
  if (!product || !Array.isArray(product.offers)) return null;
  return product.offers
    .map((offer) => normalizeOffer(offer, sourceRegistry))
    .filter((offer) => offer && isEnabledSource(offer, sourceRegistry) && isOpenBox(offer) && Number.isFinite(offer.normalizedPriceEur))
    .sort((a, b) => a.normalizedPriceEur - b.normalizedPriceEur)[0] || null;
}

function collectResult({ sourceId, productSlug, price, currency, url, condition = 'new', status = 'ok', error = null }) {
  return { sourceId, productSlug, price: numberOrNull(price), currency: currencyOf(currency), url: url || null, condition, status, error, fetchedAt: new Date().toISOString() };
}

function mergeOffer(product, result, sourceRegistry) {
  if (!product || !result || result.status !== 'ok' || result.price === null) return false;
  if (!Array.isArray(product.offers)) product.offers = [];
  const existing = product.offers.find((offer) => offer.sourceId === result.sourceId && (offer.condition || 'new') === result.condition);
  const source = sourceRegistry?.getSource?.(result.sourceId);
  const next = { sourceId: result.sourceId, store: source?.name || result.sourceId, price: result.price, currency: result.currency, condition: result.condition, url: result.url, priceSource: 'collector', fetchedAt: result.fetchedAt, status: 'ok' };
  if (existing) Object.assign(existing, next); else product.offers.push(next);
  return true;
}

module.exports = {
  DEFAULT_EUR_CZK, numberOrNull, priceInEur, normalizeOffer, getMarketOffers, getBestOffer,
  getOfficialPrice, getOfficialPriceCurrency, getMarketCurrency, getPriceHistory, getLowestMarketPrice,
  getCurrentPrice, getDealScore, getDealStatus, getPriceDifference, getPriceDifferencePercent,
  getOpenBoxOffer, collectResult, mergeOffer,
};
