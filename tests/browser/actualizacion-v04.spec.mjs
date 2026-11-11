import {test,expect} from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// Comprobación LOCAL de actualización: se sirve la copia original v0.4 (carpeta app/ junto a esta copia), se instala con sus datos
// y su caché, se «publica» localmente la copia nueva en la MISMA dirección y se comprueba qué pasa. No sale nada a internet.
const NUEVA=fileURLToPath(new URL('../../',import.meta.url));
const V04=fileURLToPath(new URL('../../../app/',import.meta.url));
const FIXTURE=JSON.parse(fs.readFileSync(new URL('../fixtures/respaldo-v04-ficticio.json',import.meta.url),'utf8'));
const PACK=fs.readFileSync(new URL('../../ejemplo-receta-detallada.json',import.meta.url));
const prefijo='/mi-mandado-inteligente/';
const tipos={'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};

function servidor(){
  let raiz=V04;const servidos=[];
  const s=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(!url.pathname.startsWith(prefijo)){res.writeHead(404).end();return;}
    const archivo=path.resolve(raiz,decodeURIComponent(url.pathname.slice(prefijo.length))||'index.html');
    if(!archivo.startsWith(raiz.replace(/[\\/]$/,'')+path.sep)){res.writeHead(403).end();return;}
    fs.readFile(archivo,(error,datos)=>{
      if(error){res.writeHead(404).end();return;}
      servidos.push(`${raiz===V04?'v0.4':'nueva'} ${url.pathname.slice(prefijo.length)||'index.html'}`);
      // Como GitHub Pages: los archivos se pueden guardar en la caché del navegador unos minutos.
      res.writeHead(200,{'Content-Type':tipos[path.extname(archivo)]||'text/plain','Cache-Control':'public, max-age=600'});res.end(datos);
    });
  });
  return {s,servidos,publicar:dir=>{raiz=dir;},escuchar:()=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r(s.address().port))),cerrar:()=>new Promise(r=>s.close(r))};
}
const esperarSW=page=>page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
const estado=page=>page.evaluate(async()=>{const {loadState}=await import('./storage.mjs');return JSON.parse(JSON.stringify(await loadState()));});
const sinSeccion=lista=>lista.map(({section,...resto})=>resto);

test('actualizar desde v0.4: conserva compras, listas, menús, imágenes, tema y respaldos; los módulos nuevos funcionan sin internet',async({browser})=>{
  test.skip(!test.info().project.name.startsWith('escritorio'),'se ejecuta una sola vez');
  test.skip(!fs.existsSync(V04),'no está la carpeta app/ original (v0.4) junto a esta copia');
  test.setTimeout(120000);
  const srv=servidor(),puerto=await srv.escuchar(),base=`http://127.0.0.1:${puerto}${prefijo}`;
  const context=await browser.newContext({viewport:{width:412,height:915},acceptDownloads:true});
  try{
    const page=await context.newPage();
    const errores=[];page.on('pageerror',e=>errores.push(e.message));

    // ---- 1. Un teléfono con v0.4 instalada, con sus datos ----
    await page.goto(base);await expect(page.locator('.hero')).toBeVisible();await esperarSW(page);
    await page.evaluate(async()=>{await (await caches.open('otra-app-v1')).put('/otra',new Response('otra aplicación'));});   // una caché ajena en el mismo dominio
    expect(await page.evaluate(()=>caches.keys())).toEqual(expect.arrayContaining(['mi-mandado:/mi-mandado-inteligente/:0.4.0','otra-app-v1']));
    await expect(page.locator('.hero [data-action="go-super"]')).toHaveCount(0);                          // confirma que corre el código v0.4
    await page.evaluate(async raw=>{const {decodeBackup}=await import('./backup.mjs');const {persistState}=await import('./storage.mjs');await persistState(decodeBackup(raw));},FIXTURE);
    await page.reload();await expect(page.locator('.hero')).toBeVisible();
    const antes=await estado(page);
    const respaldoV04=await page.evaluate(async()=>{const {loadState}=await import('./storage.mjs');const {encodeBackup}=await import('./backup.mjs');return encodeBackup(await loadState());});
    expect(antes.theme).toBe('dark');expect(antes.purchases).toHaveLength(1);expect(antes.savedMenus).toHaveLength(1);expect(antes.habituales).toBeUndefined();
    const imagenPropia=antes.recipes.find(r=>r.id==='receta-propia').image;expect(imagenPropia).toMatch(/^data:image\/png/);

    // ---- 2. Se publica la copia nueva en la misma dirección y se abre la app con conexión ----
    srv.publicar(NUEVA);srv.servidos.length=0;
    await page.reload();                                                                                  // el navegador detecta el sw.js nuevo
    await expect.poll(()=>page.evaluate(()=>caches.keys()),{timeout:20000}).toContain('mi-mandado:/mi-mandado-inteligente/:0.5.0');
    await expect.poll(()=>page.evaluate(()=>caches.keys()),{timeout:20000}).not.toContain('mi-mandado:/mi-mandado-inteligente/:0.4.0');   // la caché vieja se reemplaza al activarse la nueva
    const claves=await page.evaluate(()=>caches.keys());
    expect(claves).toContain('otra-app-v1');                                                              // la de otra aplicación no se toca
    expect(srv.servidos.filter(x=>x.startsWith('nueva'))).toEqual(expect.arrayContaining(['nueva cocina-ui.mjs','nueva habituales.mjs','nueva app.mjs','nueva core.mjs']));
    await page.reload();await expect(page.locator('.hero')).toBeVisible();                                // ya corre la versión nueva
    await expect(page.locator('.hero [data-action="go-super"]')).toBeVisible();
    expect(errores).toEqual([]);

    // ---- 3. Todo lo de antes sigue ahí ----
    const despues=await estado(page);
    for(const clave of ['budgetWeekly','defaultStore','recipes','selected','purchases','menuPurchaseIds','theme','pantry','activePlanId'])expect(despues[clave],clave).toEqual(antes[clave]);
    expect(sinSeccion(despues.shopping)).toEqual(sinSeccion(antes.shopping));
    expect(despues.plans.map(p=>({...p,shopping:sinSeccion(p.shopping),habitualSums:undefined}))).toEqual(antes.plans.map(p=>({...p,shopping:sinSeccion(p.shopping)})));
    expect(despues.savedMenus).toEqual(antes.savedMenus);
    expect(despues.shopping.every(i=>typeof i.section==='string'&&i.section)).toBe(true);                // solo se añadió la sección
    expect([despues.habituales,despues.habitualSums,despues.sectionOverrides,despues.dataRevision]).toEqual([[],[],{},2]);
    expect(despues.recipes.find(r=>r.id==='receta-propia').image).toBe(imagenPropia);
    expect(await page.evaluate(()=>document.documentElement.dataset.theme)).toBe('dark');
    const nav=n=>page.locator(`.nav-link[data-view="${n}"]:visible`).first().click();
    await nav('gastos');await expect(page.locator('.purchase')).toHaveCount(1);await expect(page.locator('.purchase')).toContainText('2026-11-07');
    await nav('mandado');await expect(page.locator('.shopping-item')).toHaveCount(antes.shopping.length);await expect(page.locator('.shopping-section')).toHaveCount(5);
    await nav('recetas');await expect(page.locator('.menu-day img').first()).toBeVisible();
    expect(await page.locator('.menu-day img').evaluateAll(async imgs=>{const r=[];for(const i of imgs){i.loading='eager';try{await i.decode();r.push(i.naturalWidth>0);}catch{r.push(false);}}return r;})).toEqual([true,true,true,true]);   // las 4 comidas con foto
    await page.getByRole('tab',{name:'Guardados',exact:true}).click();await expect(page.locator('.saved-menu-card')).toHaveCount(1);

    // ---- 4. Un respaldo hecho con v0.4 se restaura en la versión nueva ----
    page.once('dialog',d=>d.accept());
    await page.locator('#restore-input').setInputFiles({name:'respaldo-v04.json',mimeType:'application/json',buffer:Buffer.from(respaldoV04)});
    await expect(page.locator('.hero')).toBeVisible();
    const restaurado=await estado(page);
    expect(restaurado.purchases).toEqual(antes.purchases);expect(restaurado.savedMenus).toEqual(antes.savedMenus);expect(restaurado.theme).toBe('dark');
    expect(sinSeccion(restaurado.shopping)).toEqual(sinSeccion(antes.shopping));
    expect(restaurado.recipes.find(r=>r.id==='receta-propia').image).toBe(imagenPropia);
    // …y un respaldo nuevo conserva todo lo anterior.
    await nav('ajustes');
    const [descarga]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action="export-backup"]').click()]);
    const nuevo=JSON.parse(fs.readFileSync(await descarga.path(),'utf8'));
    expect([nuevo.purchases.length,nuevo.savedMenus.length,nuevo.theme,nuevo.dataRevision]).toEqual([1,1,'dark',2]);

    // ---- 5. Cerrar la app y abrirla SIN INTERNET: los módulos nuevos salen de la caché y funcionan ----
    const urlsActivos=[...fs.readFileSync(path.join(NUEVA,'sw.js'),'utf8').match(/const ASSETS=\[(.*?)\];/s)[1].matchAll(/'\.\/([^']*)'/g)].map(m=>new URL(m[1],base).href);
    const enCache=await page.evaluate(async()=>{const c=await caches.open('mi-mandado:/mi-mandado-inteligente/:0.5.0');return (await c.keys()).map(r=>r.url);});
    expect(urlsActivos.filter(u=>!enCache.includes(u))).toEqual([]);                                       // todo lo que la app necesita quedó guardado
    expect(enCache.some(u=>u.endsWith('/cocina-ui.mjs'))&&enCache.some(u=>u.endsWith('/habituales.mjs'))).toBe(true);
    await page.close();await context.setOffline(true);
    srv.servidos.length=0;
    const sin=await context.newPage();
    const respuestas=[],fallidas=[],errores2=[];
    sin.on('response',r=>respuestas.push({url:r.url(),sw:r.fromServiceWorker(),status:r.status()}));
    sin.on('requestfailed',r=>fallidas.push(r.url()));sin.on('pageerror',e=>errores2.push(e.message));
    await sin.goto(base);await expect(sin.locator('.hero')).toBeVisible();
    expect(srv.servidos).toEqual([]);                                                                      // nada llegó al servidor
    for(const modulo of ['app.mjs','core.mjs','cocina-ui.mjs','habituales.mjs','menu-ui.mjs','menus.mjs','storage.mjs','backup.mjs','media.mjs']){
      const r=respuestas.find(x=>x.url.endsWith(`/${modulo}`));
      expect(r,`${modulo} se pidió`).toBeTruthy();expect([r.sw,r.status],modulo).toEqual([true,200]);
    }
    expect(fallidas.filter(u=>u.startsWith(base)||!u.startsWith('data:'))).toEqual([]);
    expect(await sin.evaluate(()=>document.documentElement.dataset.theme)).toBe('dark');
    // Funciones nuevas sin internet: receta con detalles y modo de cocina, modo súper y habituales.
    const irA=n=>sin.locator(`.nav-link[data-view="${n}"]:visible`).first().click();
    await irA('recetas');await sin.getByRole('tab',{name:'Recetario',exact:true}).click();
    await sin.locator('#import-recipes-input').setInputFiles({name:'recetas.json',mimeType:'application/json',buffer:PACK});
    await sin.locator('.recipe-card').filter({hasText:'jitomate y aguacate'}).getByRole('button',{name:'Ver preparación'}).click();
    await expect(sin.locator('.recipe-utensils')).toContainText('Tabla para cortar');
    await expect(sin.locator('.recipe-photo')).toBeVisible();
    expect(await sin.locator('.recipe-photo').evaluate(async i=>{i.loading='eager';try{await i.decode();return i.naturalWidth>0;}catch{return false;}})).toBe(true);
    await sin.locator('[data-action="cook-start"]').click();await sin.getByRole('button',{name:'Empezar →'}).click();
    await expect(sin.locator('.cook-count')).toHaveText('Paso 1 de 3');await expect(sin.locator('.cook .step-uses')).toContainText('300 g');
    await sin.getByRole('button',{name:'Salir'}).click();
    await irA('mandado');await sin.locator('.section-title [data-action="go-super"]').click();await expect(sin.locator('.super-row').first()).toBeVisible();
    await sin.getByLabel('Marcar Calabacita como comprado').check();
    await expect(sin.locator('details.super-bought summary')).toContainText('Comprados (1)');
    await irA('mandado');await sin.locator('[data-action="open-habituales"]').click();await expect(sin.locator('#modal[open]')).toContainText('Mis habituales');
    await sin.getByRole('button',{name:'Crear mi lista de habituales'}).click();await expect(sin.locator('#habituales-manager-form')).toBeVisible();
    await sin.locator('.icon-close').click();
    // Cerrar de nuevo y reabrir sin internet: lo hecho sin conexión se conserva.
    await sin.close();
    const otra=await context.newPage();await otra.goto(base);await expect(otra.locator('.hero')).toBeVisible();
    const final=await estado(otra);
    expect(final.recipes.some(r=>r.title.includes('jitomate y aguacate')&&r.stepDetails?.length===3)).toBe(true);
    expect(final.shopping.find(i=>i.name==='Calabacita').checked).toBe(true);
    expect(final.purchases).toEqual(antes.purchases);
    expect(errores2).toEqual([]);
    console.log('Actualización local v0.4 → nueva: archivos pedidos al servidor tras publicar:',[...new Set(srv.servidos)].length===0?'(sin conexión: ninguno)':'');
  }finally{await context.close();await srv.cerrar();}
});
