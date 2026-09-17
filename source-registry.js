const fs = require('fs');
const path = require('path');

const sourcesPath = path.join(__dirname, 'sources.json');

function loadSources() {
  const raw = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
  if (!Array.isArray(raw)) throw new Error('sources.json must contain an array');

  const seen = new Set();
  for (const source of raw) {
    if (!source || !source.id) throw new Error('Every source must have an id');
    if (seen.has(source.id)) throw new Error(`Duplicate source id: ${source.id}`);
    seen.add(source.id);
  }

  return raw;
}

const sources = loadSources();
const byId = new Map(sources.map((source) => [source.id, source]));

function getSource(id) {
  return byId.get(id) || null;
}

function isEnabled(id) {
  const source = getSource(id);
  return Boolean(source && source.enabled);
}

function normalizeOffer(offer) {
  if (!offer) return offer;
  const sourceId = offer.sourceId || null;
  const source = getSource(sourceId);
  return {
    ...offer,
    sourceId,
    sourceType: offer.sourceType || source?.type || null,
    sourceName: offer.sourceName || source?.name || offer.store || null,
  };
}

function normalizeProduct(product) {
  if (!product) return product;
  return {
    ...product,
    officialSourceId: product.officialSourceId || null,
    offers: Array.isArray(product.offers) ? product.offers.map(normalizeOffer) : [],
  };
}

module.exports = {
  sources,
  getSource,
  isEnabled,
  normalizeOffer,
  normalizeProduct,
};
