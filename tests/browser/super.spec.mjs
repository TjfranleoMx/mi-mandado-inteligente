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
// Estado v0.4 ficticio; `mutate` recibe el estado ya validado.
const seed=(page,{theme='light',mutate=''}={})=>page.evaluate(async([raw,theme,mutate])=>{
  const {decodeBackup}=await import('./backup.mjs');const {validateBackup}=await import('./core.mjs');const {persistState}=await import('./storage.mjs');
  const s=validateBackup(decodeBackup(raw));s.theme=theme;
  if(mutate)new Function('s',mutate)(s);
  await persistState(s);
},[v04,theme,mutate]);
const abrir=async(page,opts)=>{await ready(page);await seed(page,opts);await page.reload();await expect(page.locator('.hero')).toBeVisible();await page.locator('.hero [data-action="go-super"]').click();await expect(page.locator('.super')).toBeVisible();};
const fila=(page,nombre,donde='.super-section')=>page.locator(`${donde} .super-row`).filter({has:page.locator('.super-name',{hasText:new RegExp(`^${nombre}$`)})});
const pulsar=async loc=>{await loc.evaluate(e=>e.scrollIntoView({block:'center'}));await loc.click();};
const marcar=(page,n)=>pulsar(fila(page,n).locator('.super-check'));
const desmarcar=(page,n)=>pulsar(fila(page,n,'.super-bought').locator('.super-check'));
const editar=async(page,nombre,campos)=>{
  await fila(page,nombre).locator('.super-info').click();
  await expect(page.locator('#modal[open] .shopping-item.sheet')).toBeVisible();
  for(const [label,valor] of Object.entries(campos))await page.getByLabel(label).fill(valor);
  await page.getByRole('button',{name:'Listo'}).click();
  await expect(page.locator('#modal[open]')).toHaveCount(0);
};

test('acceso desde Inicio y desde Mandado; pendientes por sección con letras y botones grandes',async({page})=>{
  await abrir(page);
  expect(await page.locator('.super-section .section-head > span:first-child').allTextContents()).toEqual(['Frutas y verduras','Lácteos y huevos','Pan y tortillas','Abarrotes y enlatados','Limpieza']);
  await expect(page.locator('.super-row')).toHaveCount(v04.shopping.length);
  const nombre=await page.locator('.super-name').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize));
  const caja=await page.locator('.super-check').first().boundingBox();
  const fila1=await page.locator('.super-info').first().boundingBox();
  expect(nombre).toBeGreaterThanOrEqual(20);expect(caja.width).toBeGreaterThanOrEqual(32);expect(caja.height).toBeGreaterThanOrEqual(32);expect(fila1.height).toBeGreaterThanOrEqual(48);
  await expect(page.locator('details.super-bought')).not.toHaveAttribute('open','');          // comprados: plegado
  // Volver y entrar desde Mandado.
  await page.getByRole('button',{name:'Lista completa'}).click();
  await expect(page.locator('.shopping-item').first()).toBeVisible();
  await page.locator('.section-title [data-action="go-super"]').click();
  await expect(page.locator('.super')).toBeVisible();
  await expect(page.locator('.nav-link.active:visible')).toContainText('Mandado');
});

test('marcar y desmarcar conserva la posición, no abre formularios y guarda',async({page})=>{
  await abrir(page);
  const objetivo=fila(page,'Atún en agua').locator('.super-check');
  await objetivo.evaluate(e=>e.scrollIntoView({block:'center'}));
  const y=await page.evaluate(()=>window.scrollY);
  if(test.info().project.name.startsWith('movil'))expect(y).toBeGreaterThan(100);   // la prueba sí desplaza la pantalla
  await objetivo.click();
  await expect(page.locator('#modal[open]')).toHaveCount(0);                                   // sin formulario obligatorio
  expect(Math.abs(await page.evaluate(()=>window.scrollY)-y)).toBeLessThanOrEqual(2);          // la pantalla no salta
  await expect(page.locator('details.super-bought summary')).toContainText('Comprados (1)');
  await expect(page.locator('.super-section .super-row')).toHaveCount(v04.shopping.length-1);
  expect((await saved(page)).shopping.find(i=>i.name==='Atún en agua').checked).toBe(true);
  // Los comprados siguen abajo, plegados; se abren y se pueden desmarcar.
  await page.locator('details.super-bought summary').click();
  await expect(page.locator('details.super-bought .super-row')).toHaveCount(1);
  await desmarcar(page,'Atún en agua');
  await expect(page.locator('details.super-bought summary')).toContainText('Comprados (0)');
  await expect(page.locator('.super-section .super-row')).toHaveCount(v04.shopping.length);
  expect((await saved(page)).shopping.find(i=>i.name==='Atún en agua').checked).toBe(false);
  // El estado plegado/abierto se recuerda al cerrar y reabrir.
  await expect.poll(async()=>(await saved(page)).prefs.purchasedFolded).toBe(false);
  await page.reload();await page.locator('.hero [data-action="go-super"]').click();
  await expect(page.locator('details.super-bought')).toHaveAttribute('open','');
});

test('tocar un producto permite editar cantidad real y precio',async({page})=>{
  await abrir(page);
  await editar(page,'Jitomate',{'Cantidad comprada de Jitomate':'1,3','Total pagado por Jitomate':'39'});
  await expect(fila(page,'Jitomate')).toContainText('real 1.3 kg');
  await expect(fila(page,'Jitomate')).toContainText('$39.00');
  const item=(await saved(page)).shopping.find(i=>i.name==='Jitomate');
  expect([Number(item.actualQty),Number(item.totalPaid),item.checked]).toEqual([1.3,39,false]);  // editar no marca como comprado
  // Precio por kg: calcula el total sin inventar otros datos.
  await editar(page,'Calabacita',{'Cantidad comprada de Calabacita':'1,2','Precio por kg de Calabacita':'30'});
  await expect(fila(page,'Calabacita')).toContainText('$36.00');
});

test('registrar una compra parcial revisa los datos faltantes y no inventa nada',async({page})=>{
  await abrir(page);
  await editar(page,'Jitomate',{'Cantidad comprada de Jitomate':'0,5','Total pagado por Jitomate':'15'});     // parcial: 0,5 de 1,2 kg
  await marcar(page,'Jitomate');
  await marcar(page,'Limón');                                                // sin datos
  await expect(fila(page,'Limón')).toHaveCount(0);                                                            // ya no está en pendientes
  await page.locator('details.super-bought summary').click();
  await expect(page.locator('details.super-bought .super-missing')).toHaveText(['Falta cantidad real y precio']);
  await page.getByRole('button',{name:/Registrar compra/}).click();
  await expect(page.locator('#modal[open]')).toContainText('Faltan datos');
  await expect(page.locator('.super-missing-card')).toHaveCount(1);                                            // solo Limón
  await expect(page.locator('.super-missing-card')).toContainText('Limón');
  let limon=(await saved(page)).shopping.find(i=>i.name==='Limón');
  expect([limon.actualQty,limon.totalPaid,limon.unitPrice]).toEqual(['','','']);                              // nada inventado
  // Acción explícita: usar la cantidad planeada. El precio sigue faltando.
  await page.getByRole('button',{name:/Usar lo planeado/}).click();
  await expect(page.locator('.super-missing-card')).toContainText('Falta precio');
  limon=(await saved(page)).shopping.find(i=>i.name==='Limón');expect(Number(limon.actualQty)).toBe(2);expect(limon.totalPaid).toBe('');
  // Completar el precio y volver a la revisión automáticamente.
  await page.getByRole('button',{name:'Completar'}).click();
  await page.getByLabel('Total pagado por Limón').fill('12');
  await page.getByRole('button',{name:'Listo'}).click();
  await expect(page.locator('#checkout-form')).toBeVisible();                                                  // confirmación final
  await expect(page.locator('#modal[open]')).toContainText('2 artículos');
  await page.getByRole('button',{name:'Confirmar y guardar la compra'}).click();
  const s=await saved(page);
  const compra=s.purchases[s.purchases.length-1];
  expect(compra.items.map(i=>[i.name,i.actualQty,i.totalPaid])).toEqual([['Jitomate',0.5,15],['Limón',2,12]]);
  const jit=s.shopping.find(i=>i.name==='Jitomate');
  expect([jit.checked,Number(jit.plannedQty)]).toEqual([false,0.7]);                                           // lo que falta sigue pendiente
  expect(s.shopping.some(i=>i.name==='Limón')).toBe(false);
});

test('«Dejar pendiente» desmarca el producto sin datos',async({page})=>{
  await abrir(page);
  await marcar(page,'Aguacate');
  await page.getByRole('button',{name:/Registrar compra/}).click();
  await page.getByRole('button',{name:'Dejar pendiente'}).click();
  await expect(page.locator('#toast')).toContainText('Marca al menos un producto');
  expect((await saved(page)).shopping.find(i=>i.name==='Aguacate').checked).toBe(false);
  await expect(fila(page,'Aguacate')).toHaveCount(1);
});

test('cambiar entre vistas y cerrar/reabrir sin conexión conserva marcas y datos',async({page,context})=>{
  await abrir(page);
  await editar(page,'Huevo',{'Cantidad comprada de Huevo':'6','Total pagado por Huevo':'60'});
  await marcar(page,'Huevo');
  await nav(page,'mandado');
  await expect(page.getByLabel('Marcar Huevo como comprado')).toBeChecked();                                   // se ve igual en la lista completa
  await expect(page.getByLabel('Total pagado por Huevo')).toHaveValue('60');
  await page.getByLabel('Total pagado por Huevo').fill('66');
  await page.locator('.section-title [data-action="go-super"]').click();
  await page.locator('details.super-bought summary').click();
  await expect(page.locator('details.super-bought')).toContainText('$66.00');
  await context.setOffline(true);
  await page.reload();await expect(page.locator('.hero')).toBeVisible();
  await page.locator('.hero [data-action="go-super"]').click();
  await expect(page.locator('details.super-bought')).toContainText('Huevo');
  await expect(page.locator('details.super-bought')).toContainText('$66.00');
  await desmarcar(page,'Huevo');                                            // funciona sin internet
  await expect.poll(async()=>(await saved(page)).shopping.find(i=>i.name==='Huevo').checked).toBe(false);
  await context.setOffline(false);
});

for(const theme of ['light','dark'])test(`capturas del modo súper (${theme})`,async({page})=>{
  await abrir(page,{theme,mutate:`
    const by=n=>s.shopping.find(i=>i.name===n);
    Object.assign(by('Jitomate'),{checked:true,actualQty:1.2,totalPaid:34,unitPrice:'',priceMode:'total'});
    Object.assign(by('Huevo'),{checked:true});
    s.prefs={...s.prefs,purchasedFolded:false};`});
  const tag=`${theme}-${test.info().project.name}`;
  await page.screenshot({path:`test-results/super-lista-${tag}.png`});
  await page.locator('.super-bought').scrollIntoViewIfNeeded();
  await page.screenshot({path:`test-results/super-comprados-${tag}.png`});
  await fila(page,'Calabacita').locator('.super-info').click();
  await expect(page.locator('#modal[open] .shopping-item.sheet')).toBeVisible();
  await page.screenshot({path:`test-results/super-editar-${tag}.png`});
  await page.getByRole('button',{name:'Listo'}).click();
  await page.getByRole('button',{name:/Registrar compra/}).click();
  await expect(page.locator('#modal[open]')).toContainText('Faltan datos');
  await page.screenshot({path:`test-results/super-faltan-${tag}.png`});
});
