const ALZA_URL = "https://m.alza.cz/hardware-penezenky-a-trezory/18862141.htm";
const READER_BASE = String(process.env.PRICE_READER_BASE_URL || "https://r.jina.ai/").replace(/\/+$/, "") + "/";

const originalFetch = globalThis.fetch;

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

    return originalFetch(input, init);
  };
}
