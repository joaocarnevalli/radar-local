// Verifica se todo arquivo referenciado pela extensão existe e se o pacote da loja inclui todos eles.
// Teria barrado o commit 38476fe, que moveu os arquivos sem atualizar os caminhos.
// Uso: node tools/check-files.cjs
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const problems = [];
const exists = relative => fs.existsSync(path.join(root, relative));
const runtime = new Set(['manifest.json']);
const need = (relative, from) => {
  const clean = relative.split(/[?#]/)[0].replace(/^\/+/, '');
  if (!clean) return;
  if (!exists(clean)) problems.push(`${from}: "${relative}" não existe`);
  else runtime.add(clean);
};

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
Object.values(manifest.icons || {}).forEach(file => need(file, 'manifest.json (icons)'));
Object.values(manifest.action?.default_icon || {}).forEach(file => need(file, 'manifest.json (action.default_icon)'));
if (manifest.action?.default_popup) need(manifest.action.default_popup, 'manifest.json (default_popup)');
if (manifest.background?.service_worker) need(manifest.background.service_worker, 'manifest.json (service_worker)');

// Percorre HTML e JS alcançáveis a partir do manifest.
const queue = [...runtime];
const seen = new Set();
while (queue.length) {
  const file = queue.shift();
  if (seen.has(file) || !/\.(?:html|js)$/.test(file)) continue;
  seen.add(file);
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const dir = path.posix.dirname(file);
  const local = value => !/^(?:[a-z]+:|\/\/|#|data:)/i.test(value) && !value.includes('${');
  const resolve = value => path.posix.normalize(path.posix.join(dir, value));
  const references = [];
  if (file.endsWith('.html')) for (const [, value] of text.matchAll(/\s(?:src|href)="([^"]+)"/g)) if (local(value)) references.push(resolve(value));
  if (file.endsWith('.js')) {
    for (const [, list] of text.matchAll(/importScripts\(([^)]*)\)/g)) for (const [, value] of list.matchAll(/"([^"]+)"/g)) references.push(resolve(value));
    // Caminhos absolutos dentro da extensão: getURL("..."), files: ["..."], url: "src/..."
    for (const [, value] of text.matchAll(/getURL\("([^"$]+)/g)) references.push(value);
    for (const [, list] of text.matchAll(/files:\s*\[([^\]]*)\]/g)) for (const [, value] of list.matchAll(/"([^"]+)"/g)) references.push(value);
    for (const [, value] of text.matchAll(/url:\s*"((?:src|assets)\/[^"]+)"/g)) references.push(value);
    for (const [, value] of text.matchAll(/\.src = "(\.\.?\/[^"?]+)/g)) references.push(resolve(value));
  }
  for (const reference of references) {
    const before = problems.length;
    need(reference, file);
    if (problems.length === before) queue.push(reference.split(/[?#]/)[0]);
  }
}

// O pacote da loja precisa conter todos os arquivos de execução encontrados.
const packageScript = fs.readFileSync(path.join(root, 'tools', 'package.ps1'), 'utf8');
const listed = new Set([...packageScript.slice(packageScript.indexOf('$files'), packageScript.indexOf('$outputDirectory')).matchAll(/'([^']+)'/g)].map(match => match[1]));
for (const file of listed) if (!exists(file)) problems.push(`tools/package.ps1 lista "${file}", que não existe`);
for (const file of runtime) if (!listed.has(file)) problems.push(`tools/package.ps1 não inclui "${file}", usado pela extensão`);

if (problems.length) {
  console.error('Referências quebradas:\n- ' + problems.join('\n- '));
  process.exitCode = 1;
} else {
  console.log(`OK: ${runtime.size} arquivos de execução encontrados e incluídos no pacote.`);
}
