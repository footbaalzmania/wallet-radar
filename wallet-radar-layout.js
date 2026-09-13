const http = require("http");

/*
  Final presentation layer for the public site.
  Some product pages are streamed with res.write(), so changing only
  ServerResponse.end() is not sufficient. Buffer HTML responses and apply
  the EUR display normalization to the complete rendered document.
*/
const previousWrite = http.ServerResponse.prototype.write;
const previousEnd = http.ServerResponse.prototype.end;

function extractElement(html, start) {
  const openEnd = html.indexOf(">", start);
  if (openEnd < 0) return null;
  const openTag = html.slice(start, openEnd + 1);
  const tagMatch = openTag.match(/^<([a-z0-9-]+)/i);
  if (!tagMatch) return null;
  const tag = tagMatch[1];
  const token = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
  token.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = token.exec(html))) {
    const value = match[0];
    if (value.startsWith("</")) {
      depth -= 1;
      if (depth === 0) return { html: html.slice(start, token.lastIndex), end: token.lastIndex };
    } else if (!value.endsWith("/>") && !value.startsWith("<!")) {
      depth += 1;
    }
  }
  return null;
}

function transformHtml(html) {
  let out = String(html);

  /* Move the hero Deal Radar below the wallet cards on the home page. */
  const heroCardStart = out.indexOf('<div class="hero-card">');
  const walletsStart = out.indexOf('<div class="wallet-grid">');
  if (heroCardStart >= 0 && walletsStart >= 0 && heroCardStart < walletsStart) {
    const heroCard = extractElement(out, heroCardStart);
    if (heroCard) {
      out = out.slice(0, heroCardStart) + out.slice(heroCard.end);
      const updatedWalletsStart = out.indexOf('<div class="wallet-grid">');
      const updatedWalletGrid = extractElement(out, updatedWalletsStart);
      if (updatedWalletGrid) {
        const radarCard = heroCard.html.replace(
          'class="hero-card"',
          'class="hero-card wallets-deal-radar"'
        );
        const insertion = `\n\n          ${radarCard}`;
        out = out.slice(0, updatedWalletGrid.end) + insertion + out.slice(updatedWalletGrid.end);
      }
    }
  }

  const css = `
<style id="wallet-radar-layout">
  .hero .hero-grid { grid-template-columns: 1fr !important; }
  .wallets-deal-radar { margin-top: 28px !important; }
  @media (max-width: 640px) { .wallets-deal-radar { margin-top: 22px !important; } }
</style>`;
  if (out.includes("</head>")) out = out.replace("</head>", css + "</head>");

  /*
    CRITICAL: the public pricing UI is EUR-only.
    This is deliberately applied to the complete HTML document, including
    product pages whose Deal Radar is rendered by a different function.
  */
  out = out.replace(/\bCZK\b/g, "€");

  return out;
}

http.ServerResponse.prototype.write = function (chunk, encoding, callback) {
  const contentType = String(this.getHeader("content-type") || "");
  const isHtml = contentType.includes("text/html") ||
    (typeof chunk === "string" && chunk.includes("<!DOCTYPE html>"));

  if (!this.__walletRadarHtmlBuffer && isHtml) {
    this.__walletRadarHtmlBuffer = [];
    this.__walletRadarHtmlEncoding = encoding;
  }

  if (this.__walletRadarHtmlBuffer) {
    this.__walletRadarHtmlBuffer.push(
      Buffer.isBuffer(chunk) ? chunk.toString(encoding || "utf8") : String(chunk)
    );
    if (typeof callback === "function") callback();
    return true;
  }

  return previousWrite.call(this, chunk, encoding, callback);
};

http.ServerResponse.prototype.end = function (chunk, encoding, callback) {
  if (this.__walletRadarHtmlBuffer) {
    if (chunk) {
      this.__walletRadarHtmlBuffer.push(
        Buffer.isBuffer(chunk) ? chunk.toString(encoding || "utf8") : String(chunk)
      );
    }
    const html = transformHtml(this.__walletRadarHtmlBuffer.join(""));
    delete this.__walletRadarHtmlBuffer;
    return previousEnd.call(this, Buffer.from(html, "utf8"), "utf8", callback);
  }

  if (chunk) {
    const contentType = String(this.getHeader("content-type") || "");
    const looksLikeHtml = contentType.includes("text/html") ||
      (typeof chunk === "string" && chunk.includes("<!DOCTYPE html>"));
    if (looksLikeHtml) {
      const html = transformHtml(
        Buffer.isBuffer(chunk) ? chunk.toString(encoding || "utf8") : String(chunk)
      );
      chunk = Buffer.isBuffer(chunk) ? Buffer.from(html, "utf8") : html;
      encoding = Buffer.isBuffer(chunk) ? "utf8" : encoding;
    }
  }

  return previousEnd.call(this, chunk, encoding, callback);
};
