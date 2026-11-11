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
const seed=(page,theme)=>page.evaluate(async([raw,theme])=>{
  const {decodeBackup}=await import('./backup.mjs');const {validateBackup}=await import('./core.mjs');const {persistState}=await import('./storage.mjs');
  const s=validateBackup(decodeBackup(raw));s.theme=theme;
  s.habituales=[{id:'h-leche',name:'Leche entera',quantity:2,unit:'l',category:'Lácteos',section:'lacteos-huevos'},{id:'h-jit',name:'Jitomate',quantity:0.5,unit:'kg',category:'Verduras y frutas',section:'frutas-verduras'}];
  await persistState(s);
},[v04,theme]);
async function toHabituales(page){
  await nav(page,'recetas');
  await page.locator('.menu-list-action [data-action="review-pantry"]').click();
  await page.getByRole('button',{name:'Aplicar y generar lista'}).click();
  await expect(page.locator('#habituales-form')).toBeVisible();
}

for(const theme of ['light','dark'])test(`recorrido con habituales: nada se agrega solo, coincidencias preguntan, todo se guarda (${theme})`,async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.accept());
  await ready(page);await seed(page,theme);
  await page.reload();await expect(page.locator('.hero')).toBeVisible();
  const before=(await saved(page)).shopping.length;
  await toHabituales(page);
  // Ninguno marcado de antemano, y la coincidencia (Jitomate) ya avisa.
  await expect(page.locator('[data-habitual-pick]:checked')).toHaveCount(0);
  await expect(page.locator('.habitual-conflict')).toHaveCount(1);
  await expect(page.locator('.habitual-conflict')).toContainText('Ya tienes 1.2 kg de «Jitomate»');
  await page.screenshot({path:`test-results/habituales-${theme}-${test.info().project.name}.png`});
  // Sin elegir nada, se puede omitir y la lista queda igual de grande.
  await page.getByRole('button',{name:'Omitir'}).click();
  await expect(page.locator('.shopping-item')).toHaveCount(before);
  expect((await saved(page)).shopping.some(i=>i.name==='Leche entera')).toBe(false);
  // Segunda vez: marca ambos; el que coincide obliga a elegir.
  await page.locator('[data-action="open-habituales"]').click();
  await page.getByLabel('Necesito Leche entera').check();
  await page.getByLabel('Necesito Jitomate').check();
  await page.getByRole('button',{name:'Agregar lo elegido y generar lista'}).click();
  await expect(page.locator('#habituales-form')).toBeVisible();              // sigue abierto: falta responder
  await expect(page.locator('#toast')).toContainText('ya está en tu lista');
  expect((await saved(page)).shopping.some(i=>i.name==='Leche entera')).toBe(false);
  await page.getByLabel('Qué hacer con Jitomate').selectOption('sum');
  await page.getByRole('button',{name:'Agregar lo elegido y generar lista'}).click();
  await expect(page.locator('#habituales-form')).toHaveCount(0);
  let s=await saved(page);
  expect(s.shopping.filter(i=>i.name==='Jitomate')).toHaveLength(1);
  expect(s.shopping.find(i=>i.name==='Jitomate').plannedQty).toBeCloseTo(1.7,5);
  expect(s.shopping.find(i=>i.name==='Leche entera')).toMatchObject({plannedQty:2,section:'lacteos-huevos',habitualId:'h-leche',source:'manual'});
  expect(s.habitualSums).toHaveLength(1);
  await expect(page.locator('[data-section="lacteos-huevos"]')).toContainText('Leche entera');
  // Reabrir la app: se conserva; regenerar no duplica.
  await page.reload();await nav(page,'mandado');
  await page.locator('[data-action="generate-list"]').first().click();
  s=await saved(page);
  expect(s.shopping.find(i=>i.name==='Jitomate').plannedQty).toBeCloseTo(1.7,5);
  expect(s.shopping.filter(i=>i.name==='Leche entera')).toHaveLength(1);
  // Leche ya está en la lista: pregunta y «No agregar» no la duplica.
  await page.locator('[data-action="open-habituales"]').click();
  await page.getByLabel('Necesito Leche entera').check();
  await page.getByLabel('Qué hacer con Leche entera').selectOption('skip');
  await page.getByRole('button',{name:'Agregar lo elegido y generar lista'}).click();
  expect((await saved(page)).shopping.filter(i=>i.name==='Leche entera')).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('editar mis habituales y guardar un producto manual como habitual',async({page})=>{
  page.on('dialog',d=>d.accept());
  await ready(page);await seed(page,'light');
  await page.reload();await expect(page.locator('.hero')).toBeVisible();
  await nav(page,'mandado');
  await page.locator('[data-action="open-habituales"]').click();
  await page.getByRole('button',{name:'Editar mi lista'}).click();
  await expect(page.locator('#habituales-manager-form .ingredient-editor[data-hid]')).toHaveCount(2);
  await page.locator('#habituales-manager-form .ingredient-editor[data-hid="h-jit"] [data-action="remove-ingredient-row"]').click();
  await page.locator('#habituales-manager-form [data-action="add-ingredient-row"]').click();
  const fresh=page.locator('#habituales-manager-form .ingredient-editor').last();
  await fresh.locator('[data-ingredient="name"]').fill('Pan de caja');
  await fresh.locator('[data-ingredient="quantity"]').fill('1');
  await fresh.locator('[data-ingredient="unit"]').selectOption('pza');
  await page.getByRole('button',{name:'Guardar mis habituales'}).click();
  await expect(page.locator('#habituales-form')).toBeVisible();
  let s=await saved(page);
  expect(s.habituales.map(h=>h.name)).toEqual(['Leche entera','Pan de caja']);
  expect(s.habituales[0].id).toBe('h-leche');expect(s.habituales[1].section).toBe('pan-tortillas');
  await page.getByRole('button',{name:'Omitir'}).click();
  // Guardar un artículo manual como habitual desde su tarjeta.
  await page.locator('[data-shopping-row]').filter({hasText:'Detergente ficticio'}).getByRole('button',{name:'Guardar como habitual'}).click();
  await expect.poll(async()=>(await saved(page)).habituales.some(h=>h.name==='Detergente ficticio')).toBe(true);
  s=await saved(page);expect(s.habituales.find(h=>h.name==='Detergente ficticio').section).toBe('limpieza');
  await expect(page.locator('[data-shopping-row]').filter({hasText:'Detergente ficticio'}).getByRole('button',{name:'Guardar como habitual'})).toHaveCount(0);
  // Y desde el formulario de «Agregar artículo».
  await page.locator('[data-action="add-item"]').click();
  await page.locator('#manual-item-form [name="name"]').fill('Papel higiénico ficticio');
  await page.locator('#manual-item-form [name="category"]').selectOption('Higiene');
  await page.locator('#manual-item-form [name="saveHabitual"]').check();
  await page.locator('#manual-item-form button[type="submit"]').click();
  await expect.poll(async()=>(await saved(page)).habituales.some(h=>h.name==='Papel higiénico ficticio')).toBe(true);
  // Sin internet y tras reabrir, la biblioteca sigue.
  await page.reload();await expect(page.locator('.hero')).toBeVisible();
  expect((await saved(page)).habituales.map(h=>h.name)).toEqual(['Leche entera','Pan de caja','Detergente ficticio','Papel higiénico ficticio']);
});

const seedNopales=page=>page.evaluate(async raw=>{
  const {decodeBackup}=await import('./backup.mjs');const {validateBackup}=await import('./core.mjs');const {persistState}=await import('./storage.mjs');
  const s=validateBackup(decodeBackup(raw));
  s.habituales=[{id:'h-leche',name:'Leche entera',quantity:2,unit:'l',category:'Lácteos',section:'lacteos-huevos'},{id:'h-jit',name:'Jitomate',quantity:0.5,unit:'kg',category:'Verduras y frutas',section:'frutas-verduras'},{id:'h-nop',name:'Nopales',quantity:0.3,unit:'kg',category:'Verduras y frutas',section:'frutas-verduras'}];
  await persistState(s);
},v04);

test('cantidad distinta para esta semana: no cambia el habitual guardado',async({page})=>{
  page.on('dialog',d=>d.accept());
  await ready(page);await seedNopales(page);
  await page.reload();await expect(page.locator('.hero')).toBeVisible();
  await nav(page,'mandado');
  await page.locator('[data-action="open-habituales"]').click();
  await expect(page.getByLabel('Cantidad de Leche entera esta semana')).toHaveValue('2');
  await expect(page.getByLabel('Cantidad de Jitomate esta semana')).toHaveValue('500');     // 0,5 kg se muestra en gramos
  // Una cantidad inválida no deja continuar ni cambia nada.
  await page.getByLabel('Necesito Leche entera').check();
  await page.getByLabel('Cantidad de Leche entera esta semana').fill('0');
  await page.getByRole('button',{name:'Agregar lo elegido y generar lista'}).click();
  await expect(page.locator('#habituales-form')).toBeVisible();
  await expect(page.locator('#toast')).toContainText('Revisa la cantidad de «Leche entera»');
  expect((await saved(page)).shopping.some(i=>i.name==='Leche entera')).toBe(false);
  await page.getByLabel('Cantidad de Leche entera esta semana').fill('3');
  await page.getByLabel('Necesito Jitomate').check();
  await page.getByLabel('Cantidad de Jitomate esta semana').fill('200');
  await page.getByLabel('Qué hacer con Jitomate').selectOption('sum');
  await page.getByRole('button',{name:'Agregar lo elegido y generar lista'}).click();
  await expect(page.locator('#habituales-form')).toHaveCount(0);
  let s=await saved(page);
  expect(s.shopping.find(i=>i.name==='Leche entera').plannedQty).toBe(3);
  expect(s.shopping.find(i=>i.name==='Jitomate').plannedQty).toBeCloseTo(1.4,5);
  expect(s.habitualSums.find(x=>x.name==='Jitomate').quantity).toBeCloseTo(0.2,5);
  expect(s.habituales.map(h=>[h.name,h.quantity])).toEqual([['Leche entera',2],['Jitomate',0.5],['Nopales',0.3]]);
  // Reabrir la app y regenerar: la cantidad de la semana se mantiene y el habitual sigue igual.
  await page.reload();await nav(page,'mandado');
  await page.locator('[data-action="generate-list"]').first().click();
  s=await saved(page);
  expect(s.shopping.find(i=>i.name==='Jitomate').plannedQty).toBeCloseTo(1.4,5);
  expect(s.shopping.filter(i=>i.name==='Leche entera')).toHaveLength(1);
  await page.locator('[data-action="open-habituales"]').click();
  await expect(page.getByLabel('Cantidad de Leche entera esta semana')).toHaveValue('2');   // vuelve a la cantidad habitual
  await expect(page.getByLabel('Cantidad de Jitomate esta semana')).toHaveValue('500');
});

test('quitar del menú la receta con un habitual sumado: se conserva aparte, una sola vez, con aviso',async({page})=>{
  page.on('dialog',d=>d.accept());
  await ready(page);await seedNopales(page);
  await page.reload();await expect(page.locator('.hero')).toBeVisible();
  await nav(page,'mandado');
  await page.locator('[data-action="open-habituales"]').click();
  await page.getByLabel('Necesito Nopales').check();
  await page.getByLabel('Qué hacer con Nopales').selectOption('sum');
  await page.getByRole('button',{name:'Agregar lo elegido y generar lista'}).click();
  await expect.poll(async()=>(await saved(page)).shopping.find(i=>i.name==='Nopales')?.plannedQty).toBeCloseTo(0.8,5);
  // Quitar la ensalada de atún (martes) del menú.
  await nav(page,'recetas');
  await page.locator('.menu-toolbar [data-action="edit-plan"]').click();
  await page.locator('#plan-day-1').selectOption('');
  await page.getByRole('button',{name:'Guardar cambios'}).click();
  await nav(page,'mandado');
  await page.locator('[data-action="generate-list"]').first().click();
  await expect(page.locator('#toast')).toContainText('«Nopales» ya no está en el menú: conservamos 300 g');
  await page.screenshot({path:`test-results/aviso-habitual-${test.info().project.name}.png`});
  let s=await saved(page);
  const rows=s.shopping.filter(i=>i.name==='Nopales');
  expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({source:'manual',habitualId:'h-nop'});expect(rows[0].plannedQty).toBeCloseTo(0.3,5);
  expect(s.habitualSums.some(x=>x.name==='Nopales')).toBe(false);
  await expect(page.locator('[data-shopping-row]').filter({hasText:'Nopales'})).toContainText('De mis habituales');
  // Cerrar y reabrir, y regenerar de nuevo: sigue habiendo un solo renglón y ya no avisa.
  await page.reload();await nav(page,'mandado');
  await page.locator('[data-action="generate-list"]').first().click();
  await expect(page.locator('#toast')).not.toContainText('ya no está en el menú');
  s=await saved(page);
  expect(s.shopping.filter(i=>i.name==='Nopales')).toHaveLength(1);
  expect(s.shopping.find(i=>i.name==='Nopales').plannedQty).toBeCloseTo(0.3,5);
});
