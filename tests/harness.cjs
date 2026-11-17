// Infraestrutura compartilhada pelos testes de navegador e pelo gerador de capturas da loja.
// Abre um Chromium isolado (perfil descartável em .test-artifacts/) com uma cópia da extensão
// e responde às páginas das "lojas" com fixtures locais, sem acessar a internet.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await fn(); if (value) return value; await sleep(100); }
  throw new Error('Timed out waiting for fixture');
}

function findBrowser() {
  if (process.env.RADAR_BROWSER) return process.env.RADAR_BROWSER;
  const local = process.env.LOCALAPPDATA || '';
  const candidates = [
    'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
    local && path.join(local, 'BraveSoftware/Brave-Browser/Application/brave.exe'),
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    local && path.join(local, 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/brave-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'
  ].filter(Boolean);
  const found = candidates.find(candidate => fs.existsSync(candidate));
  if (!found) throw new Error('Nenhum navegador Chromium encontrado. Defina RADAR_BROWSER com o caminho do executável.');
  return found;
}

class CDP {
  constructor(socket, { origins, fixture }) {
    this.socket = socket; this.id = 0; this.calls = new Map(); this.errors = []; this.sessions = new Map();
    this.origins = origins; this.fixture = fixture;
    socket.onmessage = event => {
      const data = JSON.parse(event.data);
      if (data.id) {
        const call = this.calls.get(data.id);
        if (!call) return;
        this.calls.delete(data.id); clearTimeout(call.timer);
        if (data.error) call.reject(new Error(JSON.stringify(data.error))); else call.resolve(data.result);
      } else if (data.method === 'Runtime.exceptionThrown') this.errors.push(data.params.exceptionDetails);
      else void this.event(data).catch(error => this.errors.push({ text: error.message }));
    };
  }
  send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const timer = setTimeout(() => { this.calls.delete(id); reject(new Error('CDP timeout: ' + method)); }, 10000);
      this.calls.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  async event(data) {
    if (data.method === 'Target.attachedToTarget') {
      const { sessionId, targetInfo } = data.params;
      if (targetInfo.type === 'page') {
        await this.send('Runtime.enable', {}, sessionId);
        await this.send('Fetch.enable', { patterns: this.origins.map(origin => ({ urlPattern: origin + '/*' })) }, sessionId);
        this.sessions.set(targetInfo.targetId, sessionId);
      }
      await this.send('Runtime.runIfWaitingForDebugger', {}, sessionId);
      if (this.origins.some(origin => targetInfo.url.startsWith(origin + '/'))) await this.send('Page.navigate', { url: targetInfo.url }, sessionId);
    }
    if (data.method === 'Fetch.requestPaused') {
      await this.send('Fetch.fulfillRequest', { requestId: data.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }], body: Buffer.from(this.fixture(data.params.request.url)).toString('base64') }, data.sessionId);
    }
  }
  async attach(id) { return until(() => this.sessions.get(id)); }
  async evaluate(session, expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, session);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async page(url) {
    const { targetId } = await this.send('Target.createTarget', { url });
    const session = await this.attach(targetId);
    await until(() => this.evaluate(session, 'document.readyState === "complete" && location.href === ' + JSON.stringify(url)).catch(() => false));
    return { targetId, session };
  }
}

// Copia a extensão para um perfil descartável, concede acesso só às origens de teste e abre o navegador.
async function launch({ origins, fixture }) {
  const binary = findBrowser();
  fs.mkdirSync(path.join(root, '.test-artifacts'), { recursive: true });
  const workspace = fs.mkdtempSync(path.join(root, '.test-artifacts', 'radar-review-'));
  const extension = path.join(workspace, 'extension'), profile = path.join(workspace, 'profile');
  fs.mkdirSync(extension); fs.mkdirSync(profile);
  fs.copyFileSync(path.join(root, 'manifest.json'), path.join(extension, 'manifest.json'));
  for (const dir of ['src', 'assets']) fs.cpSync(path.join(root, dir), path.join(extension, dir), { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json')));
  manifest.host_permissions = origins.map(origin => origin + '/*');
  fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(extension, 'src/test-driver.html'), '<!doctype html><html><head><title>Isolated test driver</title></head><body><script src="shared/money.js"></script><script src="shared/data-store.js"></script></body></html>');

  // O modo de teste desativa o sandbox interno do navegador; use apenas com estas fixtures.
  const child = spawn(binary, ['--headless=new', '--disable-gpu', '--disable-crash-reporter', '--disable-breakpad', '--disable-crashpad', '--noerrdialogs', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--remote-debugging-pipe', '--user-data-dir=' + profile, '--disable-extensions-except=' + extension, '--load-extension=' + extension, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  child.stderr.on('data', () => {});
  const socket = { send: value => child.stdio[3].write(value + '\0'), close() {} };
  let pending = '';
  child.stdio[4].on('data', chunk => {
    pending += chunk.toString();
    let end;
    while ((end = pending.indexOf('\0')) >= 0) { const value = pending.slice(0, end); pending = pending.slice(end + 1); if (value) socket.onmessage({ data: value }); }
  });
  const cdp = new CDP(socket, { origins, fixture });
  const close = async () => {
    await cdp.send('Browser.close').catch(() => {});
    cdp.socket.close();
    if (child.exitCode == null) child.kill();
  };
  try {
    await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    const worker = await until(async () => (await cdp.send('Target.getTargets')).targetInfos.find(t => t.type === 'service_worker' && t.url.endsWith('/src/background/service-worker.js')), 20000)
      .catch(() => { throw new Error(`A extensão não carregou em ${binary}. O Google Chrome oficial (137+) ignora --load-extension; use Brave, Edge, Chromium ou o Chrome for Testing e aponte RADAR_BROWSER para ele.`); });
    const extensionOrigin = worker.url.replace('/src/background/service-worker.js', '');
    const driver = await cdp.page(extensionOrigin + '/src/test-driver.html');
    return { cdp, child, workspace, extensionOrigin, workerSession: driver.session, close };
  } catch (error) { await close(); throw error; }
}

module.exports = { root, sleep, until, launch, findBrowser };
