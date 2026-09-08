const AMAZON_PREFIX = "https://r.jina.ai/https://www.amazon.de/s?k=";
const originalFetch = globalThis.fetch;

const PRODUCTS = [
  ["Trezor Safe 3", "Trezor+Safe+3"],
  ["Trezor Safe 5", "Trezor+Safe+5"],
  ["Trezor Safe 7", "Trezor+Safe+7"],
];

function productNameForUrl(url) {
  for (const [name, query] of PRODUCTS) {
    if (url.includes(query)) return name;
  }
  return null;
}

function extractAmazonPrice(text) {
  const source = String(text || "").replace(/[\u00a0\u202f]/g, " ");
  const candidates = [...source.matchAll(/([0-9]{1,3}(?:[.,][0-9]{2}))\s*€/g)]
    .map((m) => Number(String(m[1]).replace(/\./g, "").replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n >= 30 && n <= 500);

  return candidates.length ? candidates[0] : null;
}

if (typeof originalFetch === "function") {
  globalThis.fetch = async function patchedFetch(input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const productName = productNameForUrl(url);

    if (productName && url.startsWith(AMAZON_PREFIX)) {
      const response = await originalFetch(input, init);
      if (!response.ok) return response;

      const text = await response.text();
      const price = extractAmazonPrice(text);

      if (Number.isFinite(price)) {
        const normalized = `${productName} ${price.toFixed(2).replace(".", ",")} €\n\n${text}`;
        console.log(`Amazon reader normalized: ${productName} = ${price.toFixed(2)} EUR`);
        return new Response(normalized, {
          status: response.status,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }

      console.log(`Amazon reader normalization: ${productName} price not found in reader body`);
      return new Response(text, {
        status: response.status,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    return originalFetch(input, init);
  };
}
