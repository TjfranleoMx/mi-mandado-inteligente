import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const v04=JSON.parse(fs.readFileSync(new URL('../fixtures/respaldo-v04-ficticio.json',import.meta.url),'utf8'));
const nav=async(page,view)=>{await page.locator(`#${test.info().project.name.startsWith('movil')?'mobile':'desktop'}-nav [data-view="${view}"]`).click();};
async function ready(page){
  await page.goto('./');
  await expect(page.locator('.hero')).toBeVisible();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
}
const saved=page=>page.evaluate(async()=>{const {loadState}=await import('./storage.mjs');return loadState();});
const habitual={id:'h-leche',name:'Leche entera',quantity:2,unit:'l',category:'Lácteos',section:'lacteos-huevos'};

test('actualizar un teléfono con datos v0.4: se conserva todo y se guardan los campos nuevos, también sin internet',async({page,context})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await ready(page);
  await page.evaluate(async raw=>{ // deja el guardado exactamente como lo dejaba v0.4
    const {decodeBackup}=await import('./backup.mjs');const {persistState}=await import('./storage.mjs');
    await persistState(decodeBackup(raw));
  },v04);
  await page.reload();await expect(page.locator('.hero')).toBeVisible();
  await expect.poll(async()=>(await saved(page)).dataRevision).toBe(2);   // se guardó migrado
  let s=await saved(page);
  expect(s.habituales).toEqual([]);expect(s.theme).toBe('dark');expect(s.purchases).toHaveLength(1);
  expect(s.shopping.map(i=>i.name)).toContain('Detergente ficticio');
  expect(s.shopping.every(i=>typeof i.section==='string'&&i.section)).toBe(true);
  expect(s.recipes.find(r=>r.id==='receta-propia').image).toMatch(/^data:image\/png/);
  await nav(page,'mandado');
  await expect(page.getByLabel('Cantidad planeada de Detergente ficticio')).toBeVisible();
  await expect(page.locator('.shopping-item')).toHaveCount(v04.shopping.length);
  // Sin internet: se vuelve a abrir y todo sigue ahí.
  await context.setOffline(true);
  await page.reload();await expect(page.locator('.hero')).toBeVisible();
  s=await saved(page);expect(s.dataRevision).toBe(2);expect(s.shopping).toHaveLength(v04.shopping.length);
  await nav(page,'mandado');await expect(page.locator('.shopping-item')).toHaveCount(v04.shopping.length);
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

test('habituales, secciones y preferencias sobreviven a cerrar y reabrir la app, y a un respaldo',async({page})=>{
  await ready(page);
  await page.evaluate(async([raw,h])=>{
    const {decodeBackup}=await import('./backup.mjs');const {validateBackup}=await import('./core.mjs');const {persistState}=await import('./storage.mjs');
    const s=validateBackup(decodeBackup(raw));
    s.habituales=[h];s.sectionOverrides={'atun en agua':'carnes-pescados'};s.prefs={groupBySection:true,superMode:true,purchasedFolded:false};
    await persistState(s);
  },[v04,habitual]);
  for(let i=0;i<2;i++){await page.reload();await expect(page.locator('.hero')).toBeVisible();}   // el uso normal vuelve a guardar el estado
  let s=await saved(page);
  expect(s.habituales).toEqual([habitual]);expect(s.sectionOverrides).toEqual({'atun en agua':'carnes-pescados'});expect(s.prefs.superMode).toBe(true);expect(s.prefs.purchasedFolded).toBe(false);
  // Respaldo desde la pantalla de Ajustes y restauración en un teléfono «limpio».
  await nav(page,'ajustes');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action="export-backup"]').click()]);
  const file=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  expect(file.habituales).toEqual([habitual]);expect(file.sectionOverrides).toEqual({'atun en agua':'carnes-pescados'});expect(file.prefs.superMode).toBe(true);
  await page.evaluate(async()=>{const {makeInitialState}=await import('./core.mjs');const {persistState}=await import('./storage.mjs');await persistState(makeInitialState());});
  await page.reload();await expect(page.locator('.hero')).toBeVisible();
  expect((await saved(page)).habituales).toEqual([]);
  page.once('dialog',d=>d.accept());
  await nav(page,'ajustes');
  await page.locator('#restore-input').setInputFiles({name:'respaldo.json',mimeType:'application/json',buffer:fs.readFileSync(await download.path())});
  await expect.poll(async()=>(await saved(page)).habituales.length).toBe(1);
  s=await saved(page);
  expect(s.habituales).toEqual([habitual]);expect(s.prefs.superMode).toBe(true);expect(s.purchases).toHaveLength(1);
  expect(s.recipes.find(r=>r.id==='receta-propia').image).toMatch(/^data:image\/png/);
});

test('un artículo manual nuevo recibe sección y se conserva al regenerar la lista',async({page})=>{
  await ready(page);
  await page.evaluate(async raw=>{const {decodeBackup}=await import('./backup.mjs');const {persistState}=await import('./storage.mjs');await persistState(decodeBackup(raw));},v04);
  await page.reload();await expect(page.locator('.hero')).toBeVisible();
  await nav(page,'mandado');
  await page.locator('[data-action="add-item"]').click();
  await page.locator('#manual-item-form [name="name"]').fill('Jabón ficticio');
  await page.locator('#manual-item-form [name="category"]').selectOption('Higiene');
  await page.locator('#manual-item-form button[type="submit"]').click();
  await expect.poll(async()=>(await saved(page)).shopping.find(i=>i.name==='Jabón ficticio')?.section).toBe('higiene');
  page.on('dialog',d=>d.accept());
  await page.locator('[data-action="generate-list"]').first().click();
  await expect.poll(async()=>(await saved(page)).shopping.some(i=>i.name==='Jabón ficticio')).toBe(true);
});

for(const theme of ['light','dark'])test(`la lista del mandado se agrupa por secciones y recuerda la corrección (${theme})`,async({page})=>{
  await ready(page);
  await page.evaluate(async([raw,theme])=>{const {decodeBackup}=await import('./backup.mjs');const {persistState}=await import('./storage.mjs');raw=decodeBackup(raw);raw.theme=theme;await persistState(raw);},[v04,theme]);
  await page.reload();await expect(page.locator('.hero')).toBeVisible();
  await nav(page,'mandado');
  const heads=await page.locator('.section-head > span:first-child').allTextContents();
  expect(heads).toEqual(['Frutas y verduras','Lácteos y huevos','Pan y tortillas','Abarrotes y enlatados','Limpieza']);
  await expect(page.locator('[data-section="abarrotes"] .shopping-item')).toContainText(['Atún en agua']);
  await expect(page.locator('[data-section="lacteos-huevos"]')).toContainText('Huevo');
  await expect(page.locator('.shopping-item')).toHaveCount(v04.shopping.length);
  await page.locator('.shopping-list').scrollIntoViewIfNeeded();await page.evaluate(()=>window.scrollBy(0,-60));
  await page.screenshot({path:`test-results/mandado-secciones-${theme}-${test.info().project.name}.png`,fullPage:false});
  // Corregir una sección: se mueve, se guarda y se recuerda al regenerar.
  await page.getByLabel('Sección del súper de Atún en agua').selectOption('carnes-pescados');
  await expect(page.locator('[data-section="carnes-pescados"]')).toContainText('Atún en agua');
  await expect.poll(async()=>(await saved(page)).sectionOverrides['atun en agua']).toBe('carnes-pescados');
  page.on('dialog',d=>d.accept());
  await page.locator('[data-action="generate-list"]').first().click();
  await expect(page.locator('[data-section="carnes-pescados"]')).toContainText('Atún en agua');
  await page.reload();await nav(page,'mandado');
  await expect(page.locator('[data-section="carnes-pescados"]')).toContainText('Atún en agua');
  // Marcar comprado actualiza el contador de la sección sin perder datos.
  await page.getByLabel('Marcar Huevo como comprado').check();
  await expect(page.locator('[data-section="lacteos-huevos"] .section-count')).toHaveText('Todo comprado');
});
