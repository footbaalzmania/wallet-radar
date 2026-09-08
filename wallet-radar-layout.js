const http = require("http");

/*
  WalletRadar layout-only layer.
  Moves the existing Deal Radar hero card below the Trezor wallet offer grid.
  No pricing, data, affiliate or server logic is changed.
*/
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
      if (depth === 0) {
        return {
          html: html.slice(start, token.lastIndex),
          end: token.lastIndex,
        };
      }
    } else if (!value.endsWith("/>") && !value.startsWith("<!")) {
      depth += 1;
    }
  }

  return null;
}

http.ServerResponse.prototype.end = function (chunk, encoding, callback) {
  if (chunk) {
    const contentType = String(this.getHeader("content-type") || "");
    const looksLikeHtml =
      contentType.includes("text/html") ||
      (typeof chunk === "string" && chunk.includes("<!DOCTYPE html>"));

    if (looksLikeHtml) {
      let html = Buffer.isBuffer(chunk)
        ? chunk.toString(encoding || "utf8")
        : String(chunk);

      const heroCardStart = html.indexOf('<div class="hero-card">');
      const walletsStart = html.indexOf('<div class="wallet-grid">');

      if (heroCardStart >= 0 && walletsStart >= 0 && heroCardStart < walletsStart) {
        const heroCard = extractElement(html, heroCardStart);

        if (heroCard) {
          html = html.slice(0, heroCardStart) + html.slice(heroCard.end);

          const updatedWalletsStart = html.indexOf('<div class="wallet-grid">');
          const updatedWalletGrid = extractElement(html, updatedWalletsStart);

          if (updatedWalletGrid) {
            const radarCard = heroCard.html
              .replace(
                'class="hero-card"',
                'class="hero-card wallets-deal-radar"'
              )
              .replace(/\\sCZK\\b/g, " €");

            const insertion = `\n\n          ${radarCard}`;
            const insertionPoint = updatedWalletGrid.end;

            html =
              html.slice(0, insertionPoint) +
              insertion +
              html.slice(insertionPoint);
          }
        }
      }

      const css = `
<style id="wallet-radar-layout">
  /* The Deal Radar now belongs to the wallet-offer area, not the hero. */
  .hero .hero-grid {
    grid-template-columns: 1fr !important;
  }

  .wallets-deal-radar {
    margin-top: 28px !important;
  }

  @media (max-width: 640px) {
    .wallets-deal-radar {
      margin-top: 22px !important;
    }
  }
</style>`;

      html = html.replace("</head>", css + "</head>");
      chunk = Buffer.isBuffer(chunk) ? Buffer.from(html) : html;
    }
  }

  return previousEnd.call(this, chunk, encoding, callback);
};
