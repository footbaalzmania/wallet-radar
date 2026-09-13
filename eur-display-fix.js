const http = require('http');

/*
  Final presentation correction for the Deal Radar client renderer.
  trezor-api-fix.js injects a browser-side renderer whose formatMoney()
  function labels its values as CZK. This module is loaded immediately
  after the base response layer so it runs after that renderer has produced
  its HTML, without touching stored pricing data.
*/
const previousEnd = http.ServerResponse.prototype.end;

http.ServerResponse.prototype.end = function (chunk, encoding, callback) {
  if (chunk) {
    const contentType = String(this.getHeader('content-type') || '').toLowerCase();
    const looksLikeHtml =
      contentType.includes('text/html') ||
      (typeof chunk === 'string' && chunk.includes('<!DOCTYPE html>'));

    if (looksLikeHtml) {
      let html = Buffer.isBuffer(chunk)
        ? chunk.toString(encoding || 'utf8')
        : String(chunk);

      // Exact renderer string used by Deal Radar.
      // Only the displayed currency label changes; price values/data stay intact.
      const before = html;
      html = html.replace(
        "}).format(value) + ' CZK';",
        "}).format(value) + ' €';"
      );

      if (html !== before) {
        console.log('EUR display fix: Deal Radar currency label corrected');
      }

      chunk = Buffer.isBuffer(chunk) ? Buffer.from(html) : html;
    }
  }

  return previousEnd.call(this, chunk, encoding, callback);
};
