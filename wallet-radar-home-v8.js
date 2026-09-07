const http = require("http");

/*
  CryptoWalletRadar homepage v8.
  Keeps v7's visual language, but moves the Deal Radar out of the hero so
  the real Trezor offers appear immediately after the intro/CTA.

  v7 already buffers the homepage in __cwrChunks. We reuse that buffer and
  let v7 perform its normal homepage transformation first; this layer only
  adds a small post-layout move + styling.
*/
const previousEnd = http.ServerResponse.prototype.end;

const moveRadarScript = `
<script id="cwr-home-v8-script">
(function(){
  function moveRadar(){
    var radar=document.querySelector('.hero-card.cwr-radar-card');
    var wallets=document.querySelector('#wallets');
    if(!radar||!wallets||document.querySelector('.cwr-radar-lower')) return;

    var section=document.createElement('section');
    section.className='cwr-radar-lower';
    section.innerHTML='<div class="container"><div class="cwr-radar-lower-heading"><span>DEAL RADAR</span><h2>Know when a wallet is worth buying.</h2><p>Price history and market comparison turn today\'s price into one simple buying signal.</p></div></div>';
    section.querySelector('.container').appendChild(radar);
    wallets.parentNode.insertBefore(section,wallets.nextSibling);

    var heroGrid=radar.closest('.hero-grid');
    if(heroGrid) heroGrid.style.gridTemplateColumns='1fr';
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',moveRadar);
  else moveRadar();
})();
</script>`;

const css = `
<style id="cwr-home-v8">
/* v8: the real wallet offers come directly after the hero */
.hero .hero-grid{grid-template-columns:1fr!important;gap:0!important;align-items:start!important}
.hero .hero-copy{max-width:820px!important}
.hero .hero-card.cwr-radar-card{display:none!important}
.hero{padding-bottom:38px!important}

.cwr-radar-lower{
  padding:42px 0 58px!important;
  background:#f8fbf9!important;
  border-top:1px solid #edf2ee!important;
}
.cwr-radar-lower-heading{margin:0 auto 18px!important;max-width:760px!important}
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
  display:block!important;
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

http.ServerResponse.prototype.end = function (chunk, encoding, callback) {
  if (!this.__cwrBuffering || !this.__cwrChunks) {
    return previousEnd.call(this, chunk, encoding, callback);
  }

  if (typeof encoding === "function") {
    callback = encoding;
    encoding = undefined;
  }

  // v7 owns the response buffer. Replace its current chunks with the same
  // HTML plus our small v8 layout hook, then hand it back to v7's end().
  if (chunk) {
    this.__cwrChunks.push(Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(String(chunk), encoding || "utf8"));
  }

  const source = Buffer.concat(this.__cwrChunks).toString("utf8");
  if (!source.includes('<section class="hero">') || !source.includes('cwr-radar-card')) {
    return previousEnd.call(this, chunk, encoding, callback);
  }

  const hooked = source.replace("</body>", css + moveRadarScript + "</body>");
  this.__cwrChunks = [Buffer.from(hooked, "utf8")];
  this.__cwrBuffering = true;

  return previousEnd.call(this, null, "utf8", callback);
};
