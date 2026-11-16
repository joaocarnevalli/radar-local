const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Money = require('../money.js');
const Store = require('../data-store.js');
let disk, tail, quota;
const point = (amount, seconds = 0) => ({ amount, currency: 'BRL', checkedAt: new Date(1700000000000 + seconds * 1000).toISOString(), source: 'preço visível', confidence: 'high' });
const fixture = () => Store.normalize({ folders: [], products: [{ id: 'p', name: 'Produto', target: 50 }], items: [{ id: 'i', productId: 'p', url: 'https://example.com/product', name: 'Produto', price: point(100), history: [point(100)] }] });
beforeEach(() => {
  disk = { radarLocalData: fixture(), radarLocalSettings: { priceAlertsEnabled: false } }; tail = Promise.resolve(); quota = 10485760;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request(name, fn) { const task = tail.then(fn); tail = task.catch(() => {}); return task; } } } });
  globalThis.chrome = { storage: { local: {
    get QUOTA_BYTES() { return quota; },
    async get(key) { const keys = key == null ? Object.keys(disk) : Array.isArray(key) ? key : [key]; return structuredClone(Object.fromEntries(keys.filter(k => k in disk).map(k => [k, disk[k]]))); },
    async set(values) { await new Promise(resolve => setImmediate(resolve)); Object.assign(disk, structuredClone(values)); },
    async getBytesInUse(keys) { const values = await this.get(keys); return Buffer.byteLength(JSON.stringify(values)); }
  } } };
});

test('money: BRL thousands, decimals, USD and malformed/percent/installment inputs', () => {
  for (const [input, expected] of [['R$ 1.899', 1899], ['1.899,90', 1899.9], ['1,899.90', 1899.9], ['R$ 36,00', 36], ['R$ 1.234.567,89', 1234567.89]]) assert.equal(Money.parse(input)?.amount, expected, input);
  for (const input of ['36% OFF', '12x R$ 30,00', 'R$ 10,00 R$ 20,00', 'abc123', '-12', '1,2,3', '1.23.45', '']) assert.equal(Money.parse(input), null, input);
  assert.equal(Money.parse('US$ 99.90').currency, 'USD');
});
test('legacy data migrates without discarding saved prices/history', () => {
  const old = { folders: [], items: [{ id: 'old', name: 'Antigo', url: 'https://example.com/old', price: point(99), history: [point(100), point(99, 1)] }] };
  const normalized = Store.normalize(old);
  assert.equal(normalized.products[0].name, 'Antigo');
  assert.equal(normalized.items[0].history.length, 2);
  assert.deepEqual(Store.normalize(normalized), normalized);
});
test('unsafe URLs, credentials, broken prices and duplicate IDs are rejected', () => {
  for (const url of ['javascript:alert(1)', 'file:///C:/Windows', 'data:text/html,test', 'https://user:password@example.com/']) {
    const raw = fixture(); raw.items[0].url = url; assert.throws(() => Store.normalize(raw));
  }
  const raw = fixture(); raw.items[0].price.amount = Infinity; assert.throws(() => Store.normalize(raw));
  const repeated = fixture(); repeated.items.push(structuredClone(repeated.items[0])); assert.throws(() => Store.normalize(repeated));
});
test('two stale windows editing different fields preserve both updates', async () => {
  const a = await Store.read(), b = await Store.read();
  const nextA = structuredClone(a), nextB = structuredClone(b);
  nextA.items[0].offerLabel = 'Minha loja'; nextB.items[0].selector = '.price-current';
  await Promise.all([Store.commit(Store.changes(a, nextA)), Store.commit(Store.changes(b, nextB))]);
  assert.equal(disk.radarLocalData.items[0].offerLabel, 'Minha loja');
  assert.equal(disk.radarLocalData.items[0].selector, '.price-current');
});
test('stale price edit cannot overwrite a more recent accepted price', async () => {
  const base = await Store.read(), next = structuredClone(base); next.items[0].price = point(80, 1);
  await Store.update(data => { data.items[0].price = point(70, 2); });
  await assert.rejects(Store.commit(Store.changes(base, next)), /outra janela/);
  assert.equal(disk.radarLocalData.items[0].price.amount, 70);
});
test('concurrent history appends survive and deleted offers are not resurrected', async () => {
  const base = await Store.read(), a = structuredClone(base), b = structuredClone(base);
  a.items[0].history.push(point(80, 1)); b.items[0].history.push(point(70, 2));
  await Promise.all([Store.commit(Store.changes(base, a)), Store.commit(Store.changes(base, b))]);
  assert.equal(disk.radarLocalData.items[0].history.length, 3);
  const before = await Store.read(), stale = structuredClone(before); stale.items[0].selector = '#late';
  await Store.update(data => { data.items = []; });
  await assert.rejects(Store.commit(Store.changes(before, stale)));
  assert.equal(disk.radarLocalData.items.length, 0);
});
test('quota failure preserves data and settings atomically', async () => {
  const before = await Store.read(), original = structuredClone(disk); quota = 100;
  const next = structuredClone(before); next.items[0].price = point(80);
  await assert.rejects(Store.replace(before, next, { priceAlertsEnabled: true }), /Armazenamento/);
  assert.deepEqual(disk, original);
});
test('clearing product target clears all offers after normalization', async () => {
  await Store.update(data => { data.products[0].target = null; });
  assert.equal(disk.radarLocalData.items[0].target, null);
});
test('independent settings updates do not overwrite each other', async () => {
  const base = { priceAlertsEnabled: false, priceAlertVolume: 35 };
  await Promise.all([Store.saveSettings(base, { ...base, priceAlertsEnabled: true }), Store.saveSettings(base, { ...base, priceAlertVolume: 50 })]);
  assert.equal(disk.radarLocalSettings.priceAlertsEnabled, true); assert.equal(disk.radarLocalSettings.priceAlertVolume, 50);
});
test('low-confidence readings and currency changes always require review', () => {
  const context = vm.createContext({ RadarMoney: Money });
  vm.runInContext(fs.readFileSync(require.resolve('../price-extractor.js'), 'utf8'), context);
  assert.ok(context.priceReviewReason(point(100), { amount: 90, confidence: 'low' }, { priceAnomalyGuardEnabled: false }));
  assert.ok(context.priceReviewReason(point(100), { amount: 100, currency: 'USD', confidence: 'high' }));
  assert.equal(context.priceReviewReason(point(100), { amount: 90, currency: 'BRL', confidence: 'high' }), '');
});

test('currency mismatch or unidentified currency cannot trigger a discount alert', () => {
  const context = vm.createContext({ RadarMoney: Money });
  vm.runInContext(fs.readFileSync(require.resolve('../price-extractor.js'), 'utf8'), context);
  const item = fixture().items[0];
  for (const currency of ['USD', '']) assert.equal(context.evaluatePriceAlert(item, { amount: 10, currency }, { priceAlertNewLowEnabled: true }), null);
  assert.equal(context.evaluatePriceAlert(item, { amount: 10, currency: 'BRL' }).kind, 'target');
});

test('deleting a product also removes offers added concurrently', async () => {
  const base = await Store.read(), next = structuredClone(base);
  next.products = []; next.items = [];
  await Store.update(data => { data.items.push({ ...structuredClone(data.items[0]), id: 'other', url: 'https://example.com/other' }); });
  await Store.commit(Store.changes(base, next));
  assert.equal(disk.radarLocalData.products.length, 0);
  assert.equal(disk.radarLocalData.items.length, 0);
});

test('corrupt data recovery validates replacements and detects intervening edits', async () => {
  const broken = { folders: 'broken', items: [] }; disk.radarLocalData = broken;
  await assert.rejects(Store.replace(broken, { folders: [], items: [{ id: 'bad', url: 'javascript:1' }] }, null, true));
  assert.deepEqual(disk.radarLocalData, broken);
  await Store.replace(broken, fixture(), null, true);
  await assert.rejects(Store.replace(broken, fixture(), null, true), /mudaram/);
  assert.equal(disk.radarLocalData.items.length, 1);
});

test('new duplicate URLs conflict without rejecting legitimate legacy duplicates', async () => {
  const base = await Store.read(), next = structuredClone(base);
  next.items.push({ ...structuredClone(next.items[0]), id: 'duplicate' });
  assert.equal(Store.normalize(next).items.length, 2);
  await assert.rejects(Store.commit(Store.changes(base, next)), /já foi adicionada/);
  assert.equal(disk.radarLocalData.items.length, 1);
});

test('precision is stable and malformed product collections are rejected', () => {
  assert.equal(Money.parse(1.999).amount, 2);
  const raw = fixture(); raw.items[0].price.amount = 0.001;
  assert.throws(() => Store.normalize(raw));
  assert.throws(() => Store.normalize({ ...fixture(), products: 'invalid' }));
});
