const ALZA_URL = "https://m.alza.cz/hardware-penezenky-a-trezory/18862141.htm";
const READER_BASE = String(process.env.PRICE_READER_BASE_URL || "https://r.jina.ai/").replace(/\/+$/, "") + "/";
const HEUREKA_PREFIX = "https://hardwarove-penezenky-a-trezory.heureka.cz/";

const originalFetch = globalThis.fetch;

function heurekaProductName(url) {
  if (url.includes("trezor-safe-3")) return "Trezor Safe 3";
  if (url.includes("trezor-safe-5")) return "Trezor Safe 5";
  if (url.includes("trezor-safe-7")) return "Trezor Safe 7";
  return null;
}

function normalizeHeurekaReaderText(text, url) {
  const name = heurekaProductName(url);
  if (!name) return text;

  const source = String(text || "").replace(/[\u00a0\u202f]/g, " ");

  // Jina returns readable Markdown rather than the original HTML. Depending
  // on the page variant, the word "od" may be separated from the price, so
  // create a simple parser-friendly line from the first realistic CZK price.
  const candidates = [...source.matchAll(/(?:od\s+)?([1-9]\d{0,2}(?:[ .]\d{3})|\d{4,5})\s*Kč/gi)]
    .map((m) => Number(String(m[1]).replace(/[ .]/g, "")))
    .filter((n) => Number.isFinite(n) && n >= 500 && n <= 10000);

  if (!candidates.length) return text;

  const price = Math.min(...candidates);
  console.log(`Heureka reader normalized: ${name} = ${price} CZK`);
  return `${name} od ${price} Kč\n\n${source}`;
}

if (typeof originalFetch === "function") {
  globalThis.fetch = async function patchedFetch(input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";

    // Alza blocks Railway/datacenter IPs with HTTP 403. Route only this
    // specific category request through Jina Reader; all other fetches keep
    // their original behavior.
    if (url === ALZA_URL) {
      const readerUrl = READER_BASE + url;
      try {
        const response = await originalFetch(readerUrl, {
          headers: {
            "User-Agent": "CryptoWalletRadar/1.0",
            "Accept": "text/plain,text/html;q=0.9,*/*;q=0.8",
          },
        });
        if (response.ok) {
          const text = await response.text();
          console.log(`Alza reader fallback: HTTP ${response.status}, ${text.length} chars`);
          return new Response(text, {
            status: 200,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }
        console.log(`Alza reader fallback returned HTTP ${response.status}; trying direct source`);
      } catch (err) {
        console.log(`Alza reader fallback failed (${err.message}); trying direct source`);
      }
    }

    // Normalize Heureka's reader output before price-history.js sees it.
    if (url.startsWith(READER_BASE + HEUREKA_PREFIX)) {
      try {
        const response = await originalFetch(input, init);
        if (response.ok) {
          const text = await response.text();
          const normalized = normalizeHeurekaReaderText(text, url);
          return new Response(normalized, {
            status: response.status,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }
        return response;
      } catch (err) {
        console.log(`Heureka reader interception failed (${err.message}); falling through`);
      }
    }

    return originalFetch(input, init);
  };
}
