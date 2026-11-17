const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { root, sleep, until, launch } = require('../tests/harness.cjs');
function fixture() { return "<!doctype html><main><h1>Demonstração</h1></main>"; }
let child, cdp, workspace;
(async () => {
  const base = 'https://radar.test';
  let extensionOrigin, workerSession;
  ({ cdp, child, workspace, extensionOrigin, workerSession } = await launch({ origins: ['https://radar.test'], fixture }));
  assert.equal(await cdp.evaluate(workerSession, 'typeof chrome'), 'object');
  assert.equal((await cdp.evaluate(workerSession, 'RadarData.read()')).items.length, 0);

  const now=Date.now();
  const folders=[{id:'tech',name:'Tecnologia',color:'#86a9e8'},{id:'study',name:'Cursos e certificações',color:'#b69ade'},{id:'games',name:'Jogos',color:'#78b99a'}];
  const products=[{id:'chair',name:'Cadeira ergonômica',folderId:'tech',target:1800},{id:'mouse',name:'Mouse sem fio',folderId:'tech',target:150},{id:'course',name:'Curso de automação',folderId:'study',target:200},{id:'game',name:'Jogo de aventura',folderId:'games',target:90}];
  const make=(id,productId,label,amounts)=>{const points=amounts.map((amount,index)=>({amount,currency:'BRL',checkedAt:new Date(now-(amounts.length-1-index)*86400000).toISOString(),source:'entrada manual',confidence:'confirmed'}));return {id,productId,url:'https://'+id+'.example/produto',offerLabel:label,availability:'unknown',price:points.at(-1),history:points};};
  const items=[make('loja-a','chair','Loja A · demonstração',[2299,2099,1899]),make('loja-b','chair','Loja B · demonstração',[2199,1999]),make('loja-c','mouse','Loja C · demonstração',[199,179,159]),make('escola','course','Escola · demonstração',[399,299,249]),make('games','game','Jogos · demonstração',[149,119,99])];
  await cdp.evaluate(workerSession,'RadarData.update(data=>Object.assign(data,'+JSON.stringify({folders,products,items,siteProfiles:[],favicons:{}})+'))');
  const panel=await cdp.page(extensionOrigin+'/src/dashboard/dashboard.html');
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
  fs.copyFileSync(path.join(root,'assets','icons','icon-128.png'),path.join(assets,'icon-128.png'));
  assert.equal(cdp.errors.length,0,JSON.stringify(cdp.errors));
  console.log('Created four real UI screenshots (1280x800) and copied the 128px icon. Fictional data only.');
})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => {
  if (cdp) { await cdp.send('Browser.close').catch(()=>{}); cdp.socket.close(); }
  if (child && child.exitCode == null) child.kill();
  if (!workspace) return;
  console.log('Isolated test profile:', workspace);
});
