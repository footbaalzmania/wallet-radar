const fs = require("fs");
const path = require("path");

/*
  Price history collector.

  The server already refreshes market prices from Alza. This layer makes
  sure every tracked market offer gets a durable daily observation in
  products.json, without changing pricing, scoring or affiliate logic.

  A new point is stored when:
  - the store/price has not been recorded yet today, or
  - the price changed since the last observation.

  The collector runs at startup and every 6 hours.
*/

const productsPath = path.join(__dirname, "products.json");
const INTERVAL_MS = 6 * 60 * 60 * 1000;

function loadProducts() {
  try {
    return JSON.parse(fs.readFileSync(productsPath, "utf8"));
  } catch (err) {
    console.error("Price history: failed to load products.json:", err.message);
    return null;
  }
}

function saveProducts(products) {
  try {
    fs.writeFileSync(
      productsPath,
      JSON.stringify(products, null, 2) + "\n",
      "utf8"
    );
    return true;
  } catch (err) {
    console.error("Price history: failed to save products.json:", err.message);
    return false;
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function collectPriceHistory() {
  const products = loadProducts();
  if (!Array.isArray(products)) return;

  const date = today();
  let changed = false;

  for (const product of products) {
    if (!Array.isArray(product.offers) || !product.offers.length) continue;

    if (!Array.isArray(product.priceHistory)) {
      product.priceHistory = [];
    }

    for (const offer of product.offers) {
      const price = Number(offer?.price);
      if (!Number.isFinite(price) || price <= 0) continue;

      const store = String(offer.store || "Market");
      const currency = offer.currency || product.currency || "CZK";

      const sameStoreToday = product.priceHistory.find(
        (entry) =>
          entry &&
          entry.date === date &&
          String(entry.store || "").toLowerCase() === store.toLowerCase()
      );

      if (sameStoreToday && Number(sameStoreToday.price) === price) {
        continue;
      }

      product.priceHistory.push({
        date,
        price,
        currency,
        store,
        priceSource: offer.priceSource || "automatic",
      });

      changed = true;
    }

    product.priceHistory.sort((a, b) =>
      String(a.date).localeCompare(String(b.date))
    );
  }

  if (changed && saveProducts(products)) {
    console.log(`Price history: observation saved for ${date}`);
  } else if (!changed) {
    console.log(`Price history: no new observations for ${date}`);
  }
}

setTimeout(collectPriceHistory, 7000);
setInterval(collectPriceHistory, INTERVAL_MS);
