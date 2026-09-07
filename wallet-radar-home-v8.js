const http = require("http");

/*
  CryptoWalletRadar homepage v8.
  Keeps v7's visual language, but moves the Deal Radar out of the hero so
  the real Trezor offers appear immediately after the intro/CTA.
*/
const previousEnd = http.ServerResponse.prototype.end;

function findMatchingBlock(html, start, openTag, closeTag) {
  let depth = 0;
  let pos = start;
  while (pos < html.length) {
    const nextOpen = html.indexOf(openTag, pos);
    const nextClose = html.indexOf(closeTag, pos);
    if (nextClose === -1) return -1;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      pos = nextOpen + openTag.length;
    } else {
      depth -= 1;
      pos = nextClose + closeTag.length;
      if (depth === 0) return pos;
    }
  }
  return -1;
}

function extractDiv(html, marker) {
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const openStart = html.lastIndexOf("<div", start);
  const end = findMatchingBlock(html, openStart, "<div", "</div>");
  if (openStart === -1 || end === -1) return null;
  return { start: openStart, end, block: html.slice(openStart, end) };
}

function extractSection(html, marker) {
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const openStart = html.lastIndexOf("<section", start);
  const end = findMatchingBlock(html, openStart, "<section", "</section>");
  if (openStart === -1 || end === -1) return null;
  return { start: openStart, end, block: html.slice(openStart, end) };
}

function transformHomepage(html) {
  if (!html.includes('<section class="hero">') || !html.includes("cwr-radar-card")) return html;

  const radar = extractDiv(html, 'class="hero-card cwr-radar-card"');
  const wallets = extractSection(html, '<section id="wallets"');
  if (!radar || !wallets || radar.start > wallets.start) return html;

  const radarBlock = radar.block;
  html = html.slice(0, radar.start) + html.slice(radar.end);

  const walletsAfterRemoval = extractSection(html, '<section id="wallets"');
  if (!walletsAfterRemoval) return html;

  const lowerRadar = `
<section class="cwr-radar-lower">
  <div class="container">
    <div class="cwr-radar-lower-heading">
      <span>DEAL RADAR</span>
      <h2>Know when a wallet is worth buying.</h2>
      <p>Price history and market comparison turn today's price into one simple buying signal.</p>
    </div>
    ${radarBlock}
  </div>
</section>`;

  html = html.slice(0, walletsAfterRemoval.end) + lowerRadar + html.slice(walletsAfterRemoval.end);

  const css = `
<style id="cwr-home-v8">
/* v8: offers first, Deal Radar lower down */
.hero .hero-grid{grid-template-columns:1fr!important;gap:0!important;align-items:start!important}
.hero .hero-copy{max-width:820px!important}
.hero{padding-bottom:38px!important}
.hero-actions{margin-bottom:0!important}
.cwr-radar-lower{
  padding:42px 0 58px!important;
  background:#f8fbf9!important;
  border-top:1px solid #edf2ee!important;
}
.cwr-radar-lower-heading{margin-bottom:18px!important;max-width:700px!important}
.cwr-radar-lower-heading>span{
  display:inline-block!important;
  color:#18733c!important;
  font-size:10px!important;
  font-weight:900!important;
  letter-spacing:.13em!important;
}
.cwr-radar-lower-heading h2{
  margin:7px 0 5px!important;
  color:#0b1220!important;
  font-size:30px!important;
  line-height:1.08!important;
  letter-spacing:-.045em!important;
}
.cwr-radar-lower-heading p{
  margin:0!important;
  color:#667085!important;
  font-size:14px!important;
  line-height:1.55!important;
}
.cwr-radar-lower .hero-card.cwr-radar-card{
  width:min(100%,760px)!important;
  min-height:0!important;
  margin:0 auto!important;
  border-radius:20px!important;
}
.cwr-radar-lower .cwr-radar-content{padding:22px!important}
.cwr-radar-lower .cwr-radar-main{grid-template-columns:170px 1fr!important;gap:24px!important;margin-top:18px!important}
.cwr-radar-lower .cwr-radar-ring{width:168px!important;height:168px!important}
.cwr-radar-lower .cwr-radar-number{font-size:50px!important}
.cwr-radar-lower .cwr-radar-chart{height:92px!important}
.cwr-radar-lower .cwr-radar-title{font-size:25px!important}

@media(max-width:900px){
  .hero .hero-copy{max-width:760px!important}
  .cwr-radar-lower .hero-card.cwr-radar-card{max-width:760px!important}
}
@media(max-width:620px){
  .hero{padding-top:34px!important;padding-bottom:30px!important}
  .hero .hero-copy{max-width:none!important}
  .cwr-radar-lower{padding:34px 0 46px!important}
  .cwr-radar-lower-heading h2{font-size:26px!important}
  .cwr-radar-lower .cwr-radar-main{grid-template-columns:1fr!important;justify-items:center!important;gap:14px!important}
  .cwr-radar-lower .cwr-radar-verdict{width:100%!important;box-sizing:border-box!important}
  .cwr-radar-lower .cwr-radar-content{padding:18px!important}
}
</style>`;

  return html.replace("</head>", css + "</head>");
}

http.ServerResponse.prototype.end = function (chunk, encoding, callback) {
  if (this.__cwrV8Done) return previousEnd.call(this, chunk, encoding, callback);
  this.__cwrV8Done = true;

  let body = "";
  if (this.__cwrV7Body) body = this.__cwrV7Body;
  if (chunk) body += Buffer.isBuffer(chunk) ? chunk.toString(encoding) : String(chunk);

  if (body.includes('<section class="hero">') && body.includes("cwr-radar-card")) {
    body = transformHomepage(body);
    return previousEnd.call(this, body, "utf8", callback);
  }

  return previousEnd.call(this, chunk, encoding, callback);
};

// v7 buffers the response in __cwrV7Body. This hook therefore only needs to
// replace end(), and does not touch the server's pricing or affiliate logic.
