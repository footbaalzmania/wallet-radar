const fs = require("fs");
const path = require("path");

/*
  Runtime currency normalization.

  server.js currently compares offer.price numerically. This module runs
  before server.js, so EUR offers/history are normalized to CZK for the
  existing comparison and Deal Score logic while preserving the original
  EUR values for the presentation layer.
*/

const productsPath = path.join(__dirname, "products.json");

function normalize() {
  try {
    const products = JSON.parse(fs.readFileSync(productsPath, "utf8"));
    let changed = false;

    for (const product of products) {
      for (const offer of Array.isArray(product.offers) ? product.offers : []) {
        const currency = String(offer.currency || product.currency || "CZK").toUpperCase();
        const priceCzk = Number(offer.priceCzk);

        if (currency === "EUR" && Number.isFinite(priceCzk) && priceCzk > 0) {
          if (offer.originalPrice === undefined) {
            offer.originalPrice = Number(offer.price);
            changed = true;
          }
          if (!offer.originalCurrency) {
            offer.originalCurrency = "EUR";
            changed = true;
          }
          if (Number(offer.price) !== priceCzk || currency !== "CZK") {
            offer.price = priceCzk;
            offer.currency = "CZK";
            changed = true;
          }
        }
      }

      for (const entry of Array.isArray(product.priceHistory) ? product.priceHistory : []) {
        const currency = String(entry.currency || "CZK").toUpperCase();
        const priceCzk = Number(entry.priceCzk);

        if (currency === "EUR" && Number.isFinite(priceCzk) && priceCzk > 0) {
          if (entry.originalPrice === undefined) {
            entry.originalPrice = Number(entry.price);
            changed = true;
          }
          if (!entry.originalCurrency) {
            entry.originalCurrency = "EUR";
            changed = true;
          }
          if (Number(entry.price) !== priceCzk || currency !== "CZK") {
            entry.price = priceCzk;
            entry.currency = "CZK";
            changed = true;
          }
        }
      }
    }

    if (changed) {
      fs.writeFileSync(productsPath, JSON.stringify(products, null, 2) + "\n", "utf8");
    }
  } catch (err) {
    console.error("Currency runtime normalization failed:", err.message);
  }
}

normalize();
