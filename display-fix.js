const fs = require('fs');
const originalReadFileSync = fs.readFileSync.bind(fs);

const IDEALO = {
  'trezor-safe-3': {
    price: 59,
    url: 'https://www.idealo.de/preisvergleich/OffersOfProduct/205145125_-safe-3-trezor.html'
  },
  'trezor-safe-5': {
    price: 109,
    url: 'https://www.idealo.de/preisvergleich/OffersOfProduct/206151813_-safe-5-trezor.html'
  },
  'trezor-safe-7': {
    price: 249,
    url: 'https://www.idealo.de/preisvergleich/OffersOfProduct/209319953_-trezor-safe-7-trezor.html'
  }
};

function withIdealo(data) {
  try {
    const products = JSON.parse(data);
    if (!Array.isArray(products)) return data;

    let changed = false;
    for (const product of products) {
      const fallback = IDEALO[product.slug];
      if (!fallback) continue;
      if (!Array.isArray(product.offers)) product.offers = [];

      const existing = product.offers.find(o => String(o.store || '').toLowerCase() === 'idealo');
      if (existing) continue;

      product.offers.push({
        store: 'Idealo',
        price: fallback.price,
        currency: 'EUR',
        originalPrice: fallback.price,
        originalCurrency: 'EUR',
        priceCzk: Math.round(fallback.price * 24.186),
        exchangeRate: 24.186,
        condition: 'new',
        priceSource: 'automatic',
        url: fallback.url
      });
      changed = true;
    }

    return changed ? JSON.stringify(products) : data;
  } catch (_) {
    return data;
  }
}

fs.readFileSync = function(file, options) {
  const result = originalReadFileSync(file, options);
  if (String(file).endsWith('/products.json') || String(file).endsWith('products.json')) {
    if (Buffer.isBuffer(result)) return Buffer.from(withIdealo(result.toString('utf8')));
    return withIdealo(result);
  }
  return result;
};

// Make EUR visibly use the euro symbol in the original server source.
const originalServerRead = fs.readFileSync;
fs.readFileSync = function(file, options) {
  const result = originalServerRead(file, options);
  if (String(file).endsWith('/server.js') || String(file).endsWith('server.js')) {
    const text = Buffer.isBuffer(result) ? result.toString('utf8') : result;
    const patched = text.replace(
      '}).format(number) + ` ${currency}`;',
      '}).format(number) + (String(currency).toUpperCase() === "EUR" ? " €" : ` ${currency}`);'
    );
    return Buffer.isBuffer(result) ? Buffer.from(patched) : patched;
  }
  return result;
};
