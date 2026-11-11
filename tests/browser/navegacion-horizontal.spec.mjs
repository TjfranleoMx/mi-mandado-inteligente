import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const v04=JSON.parse(fs.readFileSync(new URL('../fixtures/respaldo-v04-ficticio.json',import.meta.url),'utf8'));
async function ready(page){
  await page.goto('./');
  await expect(page.locator('.hero')).toBeVisible();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
}
const sembrar=async page=>{
  await ready(page);
  await page.evaluate(async raw=>{const {decodeBackup}=await import('./backup.mjs');const {validateBackup}=await import('./core.mjs');const {persistState}=await import('./storage.mjs');await persistState(validateBackup(decodeBackup(raw)));},v04);
  await page.reload();await expect(page.locator('.hero')).toBeVisible();
};
// Un enlace de navegación está accesible si, tras desplazar su contenedor, queda dentro de la pantalla y es lo que está encima.
const auditarNavegacion=page=>page.evaluate(async()=>{
  const esperar=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const enlaces=[...document.querySelectorAll('.nav-link')].filter(e=>e.offsetParent!==null&&getComputedStyle(e).visibility!=='hidden'&&e.getBoundingClientRect().width>0);
  const fallos=[];
  for(const e of enlaces){
    e.scrollIntoView({block:'nearest'});await esperar();
    const r=e.getBoundingClientRect(),sobre=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    if(!(r.top>=0&&r.bottom<=innerHeight&&sobre&&e.contains(sobre)))fallos.push(`${e.dataset.view}: top=${Math.round(r.top)} bottom=${Math.round(r.bottom)} alto=${innerHeight}`);
  }
  return {total:enlaces.length,vistas:enlaces.map(e=>e.dataset.view),fallos};
});
// Recorre la pantalla actual y comprueba que cada control se puede dejar completamente visible y sin nada encima.
const auditarControles=page=>page.evaluate(async()=>{
  const esperar=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const controles=[...document.querySelectorAll('#content button:not([disabled]),#content input:not([type=hidden]):not([type=file]),#content select,#content textarea,#content summary')]
    .filter(e=>e.offsetParent!==null&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0)
    .filter(e=>e.tagName==='SUMMARY'||!e.closest('details:not([open])'));   // lo que está en un apartado plegado no se ve hasta abrirlo
  const libres=new Map(controles.map(e=>[e,false]));
  const max=document.documentElement.scrollHeight-innerHeight;
  const ok=e=>{
    const r=e.getBoundingClientRect();
    if(r.top<0||r.bottom>innerHeight||r.left<0||r.right>innerWidth)return false;
    for(const [x,y] of [[r.left+r.width/2,r.top+r.height/2],[r.left+Math.min(8,r.width/2),r.top+Math.min(6,r.height/2)],[r.right-Math.min(8,r.width/2),r.bottom-Math.min(6,r.height/2)]]){
      const sobre=document.elementFromPoint(x,y);if(!sobre||!(e.contains(sobre)||(sobre.contains(e)&&sobre.tagName==='LABEL')))return false;
    }
    return true;
  };
  const paso=Math.max(20,Math.floor(innerHeight/6));
  for(let y=0;y<=max+paso;y+=paso){
    window.scrollTo(0,Math.min(y,max));await esperar();
    for(const e of controles)if(!libres.get(e)&&ok(e))libres.set(e,true);
  }
  window.scrollTo(0,0);
  return {total:controles.length,inalcanzables:controles.filter(e=>!libres.get(e)).map(e=>`${e.tagName.toLowerCase()} «${(e.getAttribute('aria-label')||e.textContent||e.name||e.id||'').trim().slice(0,40)}»`)};
});
const irA=(page,vista)=>page.locator(`.nav-link[data-view="${vista}"]:visible`).first().click();

for(const [nombre,viewport] of [['800 × 360 (menú lateral)',{width:800,height:360}],['667 × 375 (menú inferior)',{width:667,height:375}],['740 × 340 (menú lateral)',{width:740,height:340}],['851 × 393 (menú lateral)',{width:851,height:393}]])
  test(`teléfono horizontal ${nombre}: la navegación y todos los controles de cada pantalla son accesibles`,async({page})=>{
    test.skip(!test.info().project.name.startsWith('movil'),'solo móvil');
    await page.setViewportSize(viewport);await sembrar(page);
    const nav=await auditarNavegacion(page);
    console.log(`[${nombre}] navegación: ${JSON.stringify(nav)}`);
    expect(nav.vistas).toEqual(['inicio','recetas','mandado','gastos','ajustes']);
    expect(nav.fallos).toEqual([]);
    for(const vista of ['inicio','recetas','mandado','gastos','ajustes']){
      await irA(page,vista);
      await expect(page.locator('#page-title')).not.toHaveText('');
      if(vista==='gastos')for(const resumen of await page.locator('details.purchase summary').all())await resumen.click();   // se abren las compras para medir también sus botones
      const r=await auditarControles(page);
      console.log(`[${nombre}] ${vista}: ${r.total} controles, inalcanzables: ${JSON.stringify(r.inalcanzables)}`);
      expect(r.total).toBeGreaterThan(0);
      expect(r.inalcanzables,`${vista}`).toEqual([]);
    }
    // Pantalla del modo súper (no está en la navegación).
    await irA(page,'inicio');await page.locator('.hero [data-action="go-super"]').click();await expect(page.locator('.super')).toBeVisible();
    const s=await auditarControles(page);console.log(`[${nombre}] súper: ${s.total} controles, inalcanzables: ${JSON.stringify(s.inalcanzables)}`);
    expect(s.inalcanzables,'súper').toEqual([]);
  });

test('Ajustes se alcanza con el menú lateral en horizontal y la barra no corta el diseño en pantallas altas',async({page})=>{
  test.skip(!test.info().project.name.startsWith('movil'),'solo móvil');
  await page.setViewportSize({width:800,height:360});await sembrar(page);
  await page.locator('.nav-link[data-view="ajustes"]:visible').click();                   // Playwright desplaza el menú si hace falta
  await expect(page.locator('#page-title')).toHaveText('Configuración');
  await expect(page.locator('#theme-choice')).toBeVisible();
  // En pantalla alta el menú lateral se ve completo y sin barra de desplazamiento.
  await page.setViewportSize({width:1280,height:800});
  const sinBarra=await page.locator('.sidebar').evaluate(e=>e.scrollHeight<=e.clientHeight);
  expect(sinBarra).toBe(true);
  await expect(page.locator('.side-help')).toBeVisible();
});

for(const modo of ['light','dark'])test(`captura: menú lateral desplazado hasta Ajustes en horizontal (${modo})`,async({page})=>{
  test.skip(!test.info().project.name.startsWith('movil'),'solo móvil');
  await page.setViewportSize({width:800,height:360});await sembrar(page);
  await page.evaluate(async modo=>{const {loadState,persistState}=await import('./storage.mjs');const e=await loadState();e.theme=modo;await persistState(e);},modo);
  await page.reload();await expect(page.locator('.hero')).toBeVisible();
  await page.screenshot({path:`test-results/menu-horizontal-arriba-${modo}.png`});
  await page.locator('.nav-link[data-view="ajustes"]:visible').click();
  await page.screenshot({path:`test-results/menu-horizontal-ajustes-${modo}.png`});
});
