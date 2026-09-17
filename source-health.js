const fs = require('fs');
const path = require('path');

const healthPath = path.join(__dirname, 'source-health.json');

const DEFAULT_HEALTH = {
  status: 'unknown',
  lastAttempt: null,
  lastSuccess: null,
  lastError: null,
  productsUpdated: 0,
};

function loadHealth() {
  try {
    const raw = JSON.parse(fs.readFileSync(healthPath, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

let health = loadHealth();

function ensure(sourceId) {
  if (!health[sourceId]) health[sourceId] = { ...DEFAULT_HEALTH };
  return health[sourceId];
}

function save() {
  fs.writeFileSync(healthPath, JSON.stringify(health, null, 2) + '\n', 'utf8');
}

function begin(sourceId) {
  const item = ensure(sourceId);
  item.lastAttempt = new Date().toISOString();
  item.lastError = null;
  item.status = 'checking';
  save();
}

function success(sourceId, productsUpdated = 0) {
  const item = ensure(sourceId);
  item.status = 'ok';
  item.lastSuccess = new Date().toISOString();
  item.lastError = null;
  item.productsUpdated = Number(productsUpdated) || 0;
  save();
}

function failure(sourceId, status, error) {
  const item = ensure(sourceId);
  item.status = status || 'error';
  item.lastError = String(error || 'Unknown error');
  save();
}

function snapshot() {
  return JSON.parse(JSON.stringify(health));
}

module.exports = { begin, success, failure, snapshot, save };
