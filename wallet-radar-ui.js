const http = require('http');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function replaceWalletRenderer(source) {
  const start = source.indexOf('function renderWalletCard(product) {');
  const end = source.indexOf('\nfunction renderHome() {', start);
  if (start === -1 || end === -1) return source;

  const renderer = `function renderWalletCard(product) {
  const officialPrice = getOfficialPrice(product);
  const marketPrice = getLowestMarketPrice(product);
  const officialCurrency = getOfficialPriceCurrency(product);
  const marketCurrency = getMarketCurrency(product);
  const score = getDealScore(product);
  const status = getDealStatus(score);
  const bestOffer = getBestOffer(product);
  const difference = getPriceDifference(product);
  const differencePercent = getPriceDifferencePercent(product);

  const money = (value, currency) => Number.isFinite(Number(value))
    ? formatPrice(Number(value), currency || 'EUR')
    : '—';

  const image = product.image ? \`
    <a href="/go/\${escapeHtml(product.slug)}" class="wallet-image" aria-label="Buy \${escapeHtml(product.name)}">
      <img src="\${escapeHtml(product.image)}" alt="\${escapeHtml(product.name)}" loading="lazy">
    </a>\` : '';

  const statusClass = score === null ? 'is-building' : score >= 80 ? 'is-excellent' : score >= 60 ? 'is-good' : score >= 40 ? 'is-fair' : 'is-high';
  const scoreLabel = score === null ? 'Building history' : score + '/100';
  const differenceText = Number.isFinite(difference)
    ? (difference > 0 ? '+' : '') + money(difference, marketCurrency)
    : '—';
  const differencePctText = Number.isFinite(differencePercent)
    ? (differencePercent > 0 ? '+' : '') + differencePercent.toFixed(1) + '%'
    : '—';

  const offers = (Array.isArray(product.offers) ? product.offers : [])
    .filter((offer) => Number.isFinite(Number(offer.price)))
    .map((offer) => ({ offer, price: typeof marketPriceEur === 'function' ? marketPriceEur(offer) : Number(offer.price) }))
    .filter((item) => Number.isFinite(item.price))
    .sort((a, b) => a.price - b.price);

  const offerRows = offers.slice(0, 4).map(({ offer, price }) => {
    const label = escapeHtml(offer.store || 'Market');
    const currency = String(offer.originalCurrency || offer.currency || 'EUR').toUpperCase();
    const displayPrice = currency === 'EUR' && typeof marketPriceEur === 'function' ? money(price, 'EUR') : money(offer.price, currency);
    const url = offer.url || offer.affiliateUrl || '#';
    return \`<a class="wr-offer-row" href="\${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><span><strong>\${label}</strong><small>\${offer.condition === 'open-box' ? 'Open-box' : 'New'}</small></span><b>\${displayPrice}</b><span class="wr-offer-arrow">↗</span></a>\`;
  }).join('');

  const marketSection = offerRows ? \`
    <div class="wr-market-list"><div class="wr-subtitle">Tracked market</div>\${offerRows}</div>
  \` : '<div class="wr-empty">Market offers are being added automatically.</div>';

  return \`
    <article class="wallet-card">
      \${image}
      <div class="wallet-content">
        <div class="wallet-brand">\${escapeHtml(product.brand || '')}</div>
        <div class="wallet-name">\${escapeHtml(product.name || '')}</div>

        <div class="wr-price-main">
          <span>Official price</span>
          <strong>\${money(officialPrice, officialCurrency)}</strong>
          <small>Market from \${Number.isFinite(marketPrice) ? money(marketPrice, marketCurrency) : '—'}</small>
        </div>

        <section class="wr-deal-radar \${statusClass}" aria-label="Deal Radar">
          <div class="wr-radar-head">
            <div><span class="wr-radar-kicker">Deal Radar</span><strong>\${scoreLabel}</strong></div>
            <span class="wr-radar-status">\${escapeHtml(status)}</span>
          </div>
          <div class="wr-radar-grid">
            <div><small>Official</small><b>\${money(officialPrice, officialCurrency)}</b></div>
            <div><small>Best market</small><b>\${Number.isFinite(marketPrice) ? money(marketPrice, marketCurrency) : '—'}</b></div>
            <div><small>Difference</small><b>\${differenceText}</b></div>
            <div><small>Vs. official</small><b>\${differencePctText}</b></div>
          </div>
        </section>

        \${marketSection}

        <div class="wallet-actions">
          <a href="/go/\${escapeHtml(product.slug)}" class="buy-button">Buy at official store</a>
          <a href="/product/\${escapeHtml(product.slug)}" class="secondary-button">Price history</a>
        </div>
      </div>
    </article>
  \`;
}
`;

  return source.slice(0, start) + renderer + source.slice(end + 1);
}

function installStyles() {
  const originalEnd = http.ServerResponse.prototype.end;
  if (originalEnd.__walletRadarUi) return;

  function end(chunk, encoding, callback) {
    if (chunk) {
      const type = String(this.getHeader('content-type') || '').toLowerCase();
      const htmlResponse = type.includes('text/html') || (typeof chunk === 'string' && chunk.includes('<!DOCTYPE html>'));
      if (htmlResponse) {
        let html = Buffer.isBuffer(chunk) ? chunk.toString(encoding || 'utf8') : String(chunk);
        const styles = `<style id="wallet-radar-ui">\n:root{--wr-ink:#0f172a;--wr-muted:#64748b;--wr-border:#e2e8f0;--wr-green:#16a34a}\n.wr-price-main{margin-top:16px;padding:16px;border:1px solid var(--wr-border);border-radius:14px;background:#fff}.wr-price-main span,.wr-price-main small{display:block;color:var(--wr-muted);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}.wr-price-main strong{display:block;margin:5px 0;font-size:32px;line-height:1;letter-spacing:-.04em;color:var(--wr-ink)}.wr-price-main small{text-transform:none;letter-spacing:0;font-size:12px;font-weight:600}.wr-deal-radar{margin-top:12px;padding:14px;border:1px solid #dbe8df;border-radius:15px;background:linear-gradient(180deg,#fbfffc,#f5faf7)}.wr-radar-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.wr-radar-head div{display:flex;flex-direction:column;gap:3px}.wr-radar-kicker{font-size:10px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:var(--wr-muted)}.wr-radar-head strong{font-size:19px;color:var(--wr-ink)}.wr-radar-status{font-size:11px;font-weight:900;color:#15803d;text-align:right}.wr-radar-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:11px}.wr-radar-grid>div{padding:9px 10px;border:1px solid #e5ece7;border-radius:10px;background:#fff}.wr-radar-grid small{display:block;color:var(--wr-muted);font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.wr-radar-grid b{display:block;margin-top:3px;font-size:13px;color:var(--wr-ink)}.wr-deal-radar.is-excellent,.wr-deal-radar.is-good{border-color:#cfe8d6}.wr-deal-radar.is-fair{border-color:#eadfbe;background:linear-gradient(180deg,#fffdf8,#fcf9f0)}.wr-deal-radar.is-high{border-color:#ead6d6;background:linear-gradient(180deg,#fffafa,#fdf6f6)}.wr-deal-radar.is-fair .wr-radar-status{color:#a16207}.wr-deal-radar.is-high .wr-radar-status{color:#b91c1c}.wr-market-list{margin-top:13px}.wr-subtitle{margin-bottom:7px;color:var(--wr-muted);font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.wr-offer-row{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:10px;padding:10px 11px;margin-top:6px;border:1px solid var(--wr-border);border-radius:11px;background:#fff;text-decoration:none;color:inherit}.wr-offer-row span:first-child{min-width:0}.wr-offer-row strong,.wr-offer-row small{display:block}.wr-offer-row strong{font-size:12px;color:var(--wr-ink)}.wr-offer-row small{margin-top:2px;font-size:10px;color:var(--wr-muted)}.wr-offer-row b{font-size:13px;color:var(--wr-ink);white-space:nowrap}.wr-offer-arrow{font-size:14px;color:var(--wr-green)}.wr-empty{margin-top:13px;padding:11px;border:1px dashed var(--wr-border);border-radius:11px;color:var(--wr-muted);font-size:11px}@media(max-width:640px){.wr-price-main strong{font-size:29px}.wr-radar-grid{gap:6px}.wr-radar-grid>div{padding:8px}.wr-offer-row{grid-template-columns:1fr auto auto}}\n</style>`;
        if (!html.includes('id="wallet-radar-ui"')) html = html.replace('</head>', styles + '</head>');
        html = html.replace(/href=(["'])\/go\/[^"']+\1(?! target=)/g, '$& target="_blank" rel="noopener noreferrer"');
        chunk = Buffer.isBuffer(chunk) ? Buffer.from(html) : html;
      }
    }
    return originalEnd.call(this, chunk, encoding, callback);
  }
  end.__walletRadarUi = true;
  http.ServerResponse.prototype.end = end;
}

installStyles();

module.exports = { replaceWalletRenderer };
