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
function fixture() { return "<!doctype html><main><h1>Demonstração</h1></main>"; }
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

  const now=Date.now();
  const folders=[{id:'tech',name:'Tecnologia',color:'#86a9e8'},{id:'study',name:'Cursos e certificações',color:'#b69ade'},{id:'games',name:'Jogos',color:'#78b99a'}];
  const products=[{id:'chair',name:'Cadeira ergonômica',folderId:'tech',target:1800},{id:'mouse',name:'Mouse sem fio',folderId:'tech',target:150},{id:'course',name:'Curso de automação',folderId:'study',target:200},{id:'game',name:'Jogo de aventura',folderId:'games',target:90}];
  const make=(id,productId,label,amounts)=>{const points=amounts.map((amount,index)=>({amount,currency:'BRL',checkedAt:new Date(now-(amounts.length-1-index)*86400000).toISOString(),source:'entrada manual',confidence:'confirmed'}));return {id,productId,url:'https://'+id+'.example/produto',offerLabel:label,availability:'unknown',price:points.at(-1),history:points};};
  const items=[make('loja-a','chair','Loja A · demonstração',[2299,2099,1899]),make('loja-b','chair','Loja B · demonstração',[2199,1999]),make('loja-c','mouse','Loja C · demonstração',[199,179,159]),make('escola','course','Escola · demonstração',[399,299,249]),make('games','game','Jogos · demonstração',[149,119,99])];
  await cdp.evaluate(workerSession,'RadarData.update(data=>Object.assign(data,'+JSON.stringify({folders,products,items,siteProfiles:[],favicons:{}})+'))');
  const panel=await cdp.page(extensionOrigin+'/dashboard.html');
  await until(()=>cdp.evaluate(panel.session,'document.getElementById("radarApp").contentDocument?.getElementById("itemsSummary")?.textContent.includes("4 produtos")'));
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false},panel.session);
  const assets=path.join(root,'store','assets');fs.mkdirSync(assets,{recursive:true});
  const capture=async name=>{await sleep(500);assert.equal(await cdp.evaluate(panel.session,'document.documentElement.scrollWidth <= innerWidth'),true);fs.writeFileSync(path.join(assets,name),Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png'},panel.session)).data,'base64'));};
  await capture('01-produtos-1280x800.png');
  await cdp.evaluate(panel.session,'(()=>{const doc=document.getElementById("radarApp").contentDocument;doc.querySelector(".product-card").open=true;doc.querySelector(".offer-accordion").open=true;doc.querySelector(".history").open=true})()');
  await sleep(300);
  await cdp.evaluate(panel.session,'document.getElementById("radarApp").contentDocument.querySelector(".history").scrollIntoView({block:"center"})');
  await capture('02-ofertas-historico-1280x800.png');
  await cdp.evaluate(panel.session,'document.getElementById("radarApp").contentDocument.querySelector("main").scrollTop=0');
  await cdp.evaluate(panel.session,`document.querySelector('[data-view="foldersView"]').click()`);
  await capture('03-pastas-1280x800.png');
  await cdp.evaluate(panel.session,`document.querySelector('[data-view="settingsView"]').click()`);
  await capture('04-configuracoes-1280x800.png');
  fs.copyFileSync(path.join(root,'icons','icon-128.png'),path.join(assets,'icon-128.png'));
  assert.equal(cdp.errors.length,0,JSON.stringify(cdp.errors));
  console.log('Created four real UI screenshots (1280x800) and copied the 128px icon. Fictional data only.');
})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => {
  if (cdp) { await cdp.send('Browser.close').catch(()=>{}); cdp.socket.close(); }
  if (child && child.exitCode == null) child.kill();

  console.log('Isolated test profile:', workspace);
});
