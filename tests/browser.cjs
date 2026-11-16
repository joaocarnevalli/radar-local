const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const binary = process.env.RADAR_BROWSER || ['C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
if (!binary) throw new Error('Set RADAR_BROWSER to a Chromium browser executable.');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, timeout = 30000) { const end = Date.now() + timeout; while (Date.now() < end) { const value = await fn(); if (value) return value; await sleep(100); } throw new Error('Timed out waiting for fixture'); }
class CDP {
  constructor(socket) { this.socket = socket; this.id = 0; this.calls = new Map(); this.errors = []; this.sessions = new Map(); socket.onmessage = event => { const data = JSON.parse(event.data); if (data.id) { const call = this.calls.get(data.id); if (!call) return; this.calls.delete(data.id); clearTimeout(call.timer); if (data.error) call.reject(new Error(JSON.stringify(data.error))); else call.resolve(data.result); } else if (data.method === 'Runtime.exceptionThrown') this.errors.push(data.params.exceptionDetails); else void this.event(data).catch(error=>this.errors.push({text:error.message})); }; }
  send(method, params = {}, sessionId) { return new Promise((resolve, reject) => { const id = ++this.id; const timer = setTimeout(() => {this.calls.delete(id);reject(new Error('CDP timeout: '+method))},10000); this.calls.set(id, { resolve, reject, timer }); this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); }
  async event(data) {
    if(data.method==='Target.attachedToTarget') {
      const {sessionId,targetInfo}=data.params;
      if(targetInfo.type==='page') {
        await this.send('Runtime.enable',{},sessionId);
        await this.send('Fetch.enable',{patterns:[{urlPattern:'https://radar.test/*'}]},sessionId);
        this.sessions.set(targetInfo.targetId,sessionId);

      }
      await this.send('Runtime.runIfWaitingForDebugger',{},sessionId);
      if(targetInfo.url.startsWith('https://radar.test/')) await this.send('Page.navigate',{url:targetInfo.url},sessionId);
    }
    if(data.method==='Fetch.requestPaused') await this.send('Fetch.fulfillRequest',{requestId:data.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html; charset=utf-8'}],body:Buffer.from(fixture(data.params.request.url)).toString('base64')},data.sessionId);
  }
  async attach(id) { return until(()=>this.sessions.get(id)); }
  async evaluate(session, expression) { const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, session); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; }
  async page(url) { const { targetId } = await this.send('Target.createTarget', { url }); const session = await this.attach(targetId); await until(() => this.evaluate(session, 'document.readyState === "complete" && location.href === ' + JSON.stringify(url)).catch(() => false)); return { targetId, session }; }
}

fs.mkdirSync(path.join(root, '.test-artifacts'), {recursive:true});
const workspace = fs.mkdtempSync(path.join(root, '.test-artifacts', 'radar-review-'));
const extension = path.join(workspace, 'extension'), profile = path.join(workspace, 'profile');
fs.mkdirSync(extension); fs.mkdirSync(profile);
for (const name of fs.readdirSync(root)) if (/\.(?:js|html|css|json)$/.test(name)) fs.copyFileSync(path.join(root, name), path.join(extension, name));
fs.cpSync(path.join(root, 'icons'), path.join(extension, 'icons'), { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json')));
manifest.host_permissions = ['https://radar.test/*'];
fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
fs.writeFileSync(path.join(extension, 'test-driver.html'), '<!doctype html><html><head><title>Isolated test driver</title></head><body><script src="money.js"></script><script src="data-store.js"></script></body></html>');
let observedPrice = 1899.90;
function fixture(url) {
  const route = new URL(url).pathname;
  let body = '<main><div class="product-info"><h1>Cadeira Premium</h1><s>R$ 2.990,90</s><span class="price-current">R$ ' + observedPrice.toFixed(2).replace('.', ',') + '</span><b>36% OFF</b></div></main>';
  if (route === '/empty') body = '<main><h1>Sem preço</h1><p>Loja indisponível</p></main>';
  if (route === '/text') body = '<main><h1>Cadeira Premium</h1><p>R$ 1800,00</p></main>';
  if (route === '/ambiguous') body = '<main><h1>Cadeira Premium</h1><p>Frete R$ 36,00</p><p>Oferta R$ 1899,90</p></main>';
  if (route === '/related') body = '<main><div class="product-info"><h1>Cadeira Premium</h1><span class="price-current">R$ 199,00</span></div><div class="recommend"><h2>Outro produto</h2><span class="price-pix">R$ 29,99 no Pix</span></div></main>';
  if (route === '/late') body = '<main><div class="product-info"><h1>Cadeira Premium</h1><span id="wait"></span></div></main><script>setTimeout(()=>{document.getElementById("wait").outerHTML=\'<span class="price-current">R$ 1888,00</span>\'},6500)</script>';
  if (route === '/conflict') body = '<main><div class="product-info"><h1>Produto</h1><span class="price-current">R$ 199,00</span><span class="price-current">R$ 299,00</span></div></main>';
  if (route === '/json') body = '<main><h1>Cadeira Premium</h1></main><script type="application/ld+json">{"@type":"Product","name":"Cadeira Premium","offers":{"price":199.9,"priceCurrency":"BRL"}}</script>';
  return '<!doctype html><html><head><title>Cadeira Premium</title></head><body>' + body + '</body></html>';
}
let child, cdp;
(async () => {
  const base = 'https://radar.test';
  child = spawn(binary, ['--headless=new', '--disable-gpu', '--disable-crash-reporter', '--disable-breakpad', '--disable-crashpad', '--noerrdialogs', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--remote-debugging-pipe', '--user-data-dir=' + profile, '--disable-extensions-except=' + extension, '--load-extension=' + extension, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
  const socket = {send: value=>child.stdio[3].write(value+'\0'), close() {}};
  let pending = '';
  child.stdio[4].on('data', chunk=> { pending += chunk.toString(); let end; while((end=pending.indexOf('\0'))>=0) { const value=pending.slice(0,end);pending=pending.slice(end+1);if(value) socket.onmessage({data:value}); }});
  cdp = new CDP(socket);
  await cdp.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true});
  const worker = await until(async () => (await cdp.send('Target.getTargets')).targetInfos.find(t => t.type === 'service_worker' && t.url.endsWith('/background.js')));
  const extensionOrigin = worker.url.replace('/background.js', '');
  const driver = await cdp.page(extensionOrigin + '/test-driver.html');
  const workerSession = driver.session;
  assert.equal(await cdp.evaluate(workerSession, 'typeof chrome'), 'object');
  assert.equal((await cdp.evaluate(workerSession, 'RadarData.read()')).items.length, 0);
  const script = fs.readFileSync(path.join(root, 'money.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'price-extractor.js'), 'utf8');
  for (const [route, expected, review] of [['/product',1899.9,false], ['/related',199,false], ['/text',1800,true], ['/ambiguous',null,false], ['/json',199.9,true], ['/conflict',199,true]]) {
    const page = await cdp.page(base + route);
    await cdp.evaluate(page.session, script);
    const result = await cdp.evaluate(page.session, 'extractPageInfo("")');
    if ((result.price?.amount ?? null) !== expected) console.log('Fixture failure:', route, result, await cdp.evaluate(page.session, 'document.body.innerText.slice(0,1500)'));
    assert.equal(result.price?.amount ?? null, expected, route);
    if (expected) assert.equal(Boolean(result.price.requiresReview), review, route);
    if(route === '/conflict') assert.equal((await cdp.evaluate(page.session, 'extractPageInfo(".price-current")')).price,null);
    if(route === '/product') assert.equal((await cdp.evaluate(page.session, 'extractPageInfo("[invalid")')).price,null);
    await cdp.send('Target.closeTarget', { targetId: page.targetId });
  }
  console.log('PASS: product amount, discount/related-price exclusion, ambiguous and low-confidence text');
  const source = await cdp.page(base + '/product');
  const sourceTab = await cdp.evaluate(workerSession, '(async()=>{const tabs=await chrome.tabs.query({});return tabs.find(t=>t.url===' + JSON.stringify(base + '/product') + ').id})()');
  const ui = await cdp.page(extensionOrigin + '/popup.html?dashboard=1&sourceTab=' + sourceTab);

  await until(() => cdp.evaluate(ui.session, 'typeof dataBaseline !== "undefined" && currentPage?.price?.amount === 1899.9')).catch(async error => { console.log('UI state:', await cdp.evaluate(ui.session, '({page:currentPage, baseline:dataBaseline,text:document.body.innerText.slice(0,1800)})'), cdp.errors); throw error; });
  const pageAccess = await cdp.evaluate(ui.session, 'chrome.scripting.executeScript({target:{tabId:' + sourceTab + '},func:async()=>{let storage=false;try{await chrome.storage.local.get("radarLocalData");storage=true;}catch{}let command;try{command=await chrome.runtime.sendMessage({type:"radar:refresh",ids:["fake"]});}catch{}return {storage,command:command?.ok??null}}})');
  assert.equal(pageAccess[0].result.storage,false);
  assert.equal(pageAccess[0].result.command,null);
  console.log('PASS: injected page context cannot read storage or issue queue commands');
  await cdp.evaluate(ui.session, 'onCaptureClick()');
  await cdp.evaluate(ui.session, 'saveCurrentPage()');
  assert.equal(await cdp.evaluate(ui.session, 'data.items.length'), 1);
  const other = await cdp.page(extensionOrigin + '/popup.html?dashboard=1&sourceTab=' + sourceTab);
  await until(() => cdp.evaluate(other.session, 'typeof dataBaseline !== "undefined" && data.items.length === 1'));
  await Promise.all([
    cdp.evaluate(ui.session, 'data.items[0].offerLabel="Loja editada"; persist()'),
    cdp.evaluate(other.session, 'data.items[0].alertsMuted=true; persist()')
  ]);
  const saved = await cdp.evaluate(workerSession, 'RadarData.read()');
  assert.equal(saved.items[0].offerLabel, 'Loja editada'); assert.equal(saved.items[0].alertsMuted, true);
  console.log('PASS: UI capture, source tab in dashboard mode, concurrent writes from separate windows');
  const token = '12345678-1234-1234-1234-123456789abc';
  await cdp.evaluate(workerSession, 'chrome.storage.local.set({' + JSON.stringify('radarCapture:' + token) + ':{url:' + JSON.stringify(base+'/manual') + ',selectionText:"R$ 1.899",title:"Manual",createdAt:Date.now()}})');
  const capture = await cdp.page(extensionOrigin + '/quick-capture.html?capture=' + token);
  await until(() => cdp.evaluate(capture.session, '!document.getElementById("captureForm").classList.contains("hidden")'));
  assert.equal(await cdp.evaluate(capture.session, 'document.getElementById("captureAmount").value'), '1.899,00');
  await cdp.evaluate(capture.session, 'saveSelection({preventDefault(){}})');
  const manual = await cdp.evaluate(workerSession, 'RadarData.read()'); assert.equal(manual.items.find(i=>i.url.endsWith('/manual')).price.amount, 1899); assert.equal(manual.items.find(i=>i.url.endsWith('/manual')).price.currency,'BRL');
  console.log('PASS: selected-price flow preserves thousands and currency');
  await cdp.evaluate(workerSession, 'RadarData.update(data=>{const sample=data.items.find(i=>i.url.endsWith("/product"));for(const route of ["late","empty","text"]){data.items.push({...structuredClone(sample),id:route,url:' + JSON.stringify(base) + '+"/"+route,history:[...sample.history]})}})');
  observedPrice = 1850;
  const queueReply = await cdp.evaluate(other.session, 'chrome.runtime.sendMessage({type:"radar:refresh",ids:[' + JSON.stringify(saved.items[0].id) + ',"late","empty","text"]})');
  assert.equal(queueReply.ok, true);
  await cdp.send('Target.closeTarget', { targetId: other.targetId });
  await cdp.send('Target.closeTarget', { targetId: ui.targetId });
  await until(() => cdp.evaluate(workerSession, '(async()=>{const s=await chrome.storage.local.get(["radarLocalAutoQueue","radarLocalAutoStatus"]);return !s.radarLocalAutoQueue && s.radarLocalAutoStatus?.results?.text})()'), 90000);
  const result = await cdp.evaluate(workerSession, 'RadarData.read()');

  assert.equal(result.items.find(i=>i.id===saved.items[0].id).price.amount,1850);
  assert.equal(result.items.find(i=>i.id==='late').price.amount,1888);
  assert.equal(result.items.find(i=>i.id==='empty').price.amount,1899.9);
  assert.ok(result.items.find(i=>i.id==='empty').lastCheckError);
  assert.equal(result.items.find(i=>i.id==='text').price.amount,1899.9);
  assert.equal(result.items.find(i=>i.id==='text').pendingPriceCandidate.amount,1800);
  console.log('PASS: queue survives closing UI, waits for late price, preserves last price on failure and requires review');
  const finalUi = await cdp.page(extensionOrigin + '/popup.html');
  await until(()=>cdp.evaluate(finalUi.session,'Boolean(dataBaseline)'));
  await cdp.evaluate(finalUi.session,'chrome.runtime.sendMessage({type:"radar:refresh",ids:["late","empty"]})');
  await cdp.evaluate(finalUi.session,'chrome.runtime.sendMessage({type:"radar:queue-control",action:"pause"})');
  assert.equal(await cdp.evaluate(workerSession,'(async()=> (await chrome.storage.local.get("radarLocalAutoQueue")).radarLocalAutoQueue.paused)()'),true);
  await cdp.evaluate(finalUi.session,'chrome.runtime.sendMessage({type:"radar:queue-control",action:"cancel"})');
  await sleep(8000);
  assert.equal(await cdp.evaluate(workerSession,'(async()=> Boolean((await chrome.storage.local.get("radarLocalAutoQueue")).radarLocalAutoQueue))()'),false);
  console.log('PASS: paused/cancelled queue is not resurrected by an in-flight reading');
  await cdp.evaluate(finalUi.session,'for(const p of data.products) expandedProducts.add(p.id); for(const i of data.items) expandedOffers.add(i.id); renderItems()');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:392,height:600,deviceScaleFactor:1,mobile:false},finalUi.session);
  await sleep(300);
  assert.equal(await cdp.evaluate(finalUi.session,'document.documentElement.scrollWidth <= innerWidth'),true,'popup horizontal overflow');
  fs.writeFileSync(path.join(workspace,'popup.png'),Buffer.from((await cdp.send('Page.captureScreenshot',{},finalUi.session)).data,'base64'));
  const dashboard = await cdp.page(extensionOrigin + '/dashboard.html?sourceTab=' + sourceTab);
  await until(()=>cdp.evaluate(dashboard.session,'document.getElementById("radarApp").contentDocument?.getElementById("itemsSummary")?.textContent.includes("produtos")'));
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},dashboard.session);
  await sleep(300);
  assert.equal(await cdp.evaluate(dashboard.session,'document.documentElement.scrollWidth <= innerWidth'),true,'dashboard horizontal overflow');
  fs.writeFileSync(path.join(workspace,'dashboard.png'),Buffer.from((await cdp.send('Page.captureScreenshot',{},dashboard.session)).data,'base64'));
  console.log('PASS: popup and dashboard render without horizontal overflow');
  await cdp.evaluate(workerSession,'chrome.storage.local.set({radarLocalData:{folders:"invalid",items:[]}})');
  const recovery = await cdp.page(extensionOrigin + '/popup.html');
  await until(()=>cdp.evaluate(recovery.session,'document.body.innerText.includes("Exportar dados originais")'));
  assert.equal(await cdp.evaluate(workerSession,'(async()=> (await chrome.storage.local.get("radarLocalData")).radarLocalData.folders)()'),'invalid');
  console.log('PASS: corrupt data is preserved and recovery is offered');
  assert.equal(cdp.errors.length, 0, JSON.stringify(cdp.errors));
  console.log('PASS: no uncaught exceptions in extension contexts');
})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => {
  if (cdp) { await cdp.send('Browser.close').catch(()=>{}); cdp.socket.close(); }
  if (child && child.exitCode == null) child.kill();

  console.log('Isolated test profile:', workspace);
});
