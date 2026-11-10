import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const nav=async(page,view)=>{await page.locator(`#${test.info().project.name.startsWith('movil')?'mobile':'desktop'}-nav [data-view="${view}"]`).click();if(view==='recetas')await page.locator('[data-action="menu-tab"][data-tab="recipes"]').first().click();};
const pack={recipes:[{title:'Receta de prueba',servings:2,minutes:10,ingredients:[{name:'Arroz de prueba',quantity:1,unit:'kg',category:'Despensa'}],steps:['Lavar el arroz.','Cocinar y servir.']}]};
async function ready(page){
  await page.goto('./');
  await expect(page.locator('.hero')).toBeVisible();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
}
test('recetas, compra, importación, respaldo y reapertura sin conexión',async({page,context})=>{
  const errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',req=>{if(new URL(req.url()).origin!==new URL(test.info().project.use.baseURL||'http://127.0.0.1:8765').origin)external.push(req.url());});
  await ready(page);
  await nav(page,'ajustes');
  await page.locator('#budget').fill('500');
  await page.locator('#default-store').fill('Tienda de prueba');
  await page.getByRole('button',{name:'Guardar preferencias'}).click();
  await nav(page,'recetas');
  await page.locator('#import-recipes-input').setInputFiles({name:'recetas.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(pack))});
  await expect(page.getByText('Receta de prueba',{exact:true})).toBeVisible();
  const recipe=page.locator('.recipe-card').filter({hasText:'Receta de prueba'});
  await recipe.getByRole('button',{name:'Ver preparación'}).click();
  await expect(page.getByText('Cocinar y servir.',{exact:true})).toBeVisible();
  await page.locator('.icon-close').click();
  await recipe.locator('[data-action="toggle-recipe"]').check();
  await page.getByRole('button',{name:'Generar lista del menú'}).click();
  await page.getByLabel('Cantidad comprada de Arroz de prueba').fill('1,300');
  await page.getByLabel('Precio por kg de Arroz de prueba').fill('120');
  await expect(page.getByLabel('Total pagado por Arroz de prueba')).toHaveValue('156');
  await page.getByLabel('Total pagado por Arroz de prueba').fill('150');
  await page.getByLabel('Cantidad comprada de Arroz de prueba').fill('1,5');
  await expect(page.getByLabel('Total pagado por Arroz de prueba')).toHaveValue('150');
  await page.getByLabel('Marcar Arroz de prueba como comprado').check();
  await page.getByLabel('Precio por kg de Arroz de prueba').fill('120');
  await expect(page.locator('.stats .stat').nth(1)).toContainText('$180.00');
  await page.getByLabel('Total pagado por Arroz de prueba').fill('150');
  await page.locator('[data-action="finalize-shopping"]').click();
  await page.locator('#checkout-form button[type="submit"]').click();
  await expect(page.locator('.purchase')).toContainText('$150.00');
  await page.locator('.purchase summary').click();
  await page.locator('[data-action="edit-purchase"]').click();
  await page.locator('[data-purchase-quantity="0"]').fill('1e309');
  await page.locator('#purchase-edit-form button[type="submit"]').click();
  await expect(page.locator('#purchase-edit-form')).toBeVisible();
  await expect(page.locator('#toast')).toContainText('cantidades');
  await page.locator('[data-purchase-quantity="0"]').fill('1,5');
  await page.locator('#purchase-edit-form button[type="submit"]').click();
  await nav(page,'ajustes');
  const backupDownload=page.waitForEvent('download');
  await page.locator('[data-action="export-backup"]').click();
  const download=await backupDownload;
  const stream=await download.createReadStream();let data='';for await(const chunk of stream)data+=chunk;
  const backup=JSON.parse(data);
  expect(backup.purchases[0].items[0].actualQty).toBe(1.5);
  expect(backup.purchases[0].items[0].totalPaid).toBe(150);
  // Esperar la escritura efectiva, no un intervalo arbitrario.
  await expect.poll(()=>page.evaluate(async()=>{
    const {loadState}=await import('./storage.mjs');return (await loadState()).purchases.length;
  })).toBe(1);
  await context.setOffline(true);
  await page.close();
  const offlinePage=await context.newPage();
  offlinePage.on('pageerror',e=>errors.push(e.message));
  await offlinePage.goto('./');
  await expect(offlinePage.locator('#network-status')).toContainText('Sin internet');
  await nav(offlinePage,'gastos');
  await expect(offlinePage.locator('.purchase')).toContainText('$150.00');
  await nav(offlinePage,'recetas');
  await expect(offlinePage.getByText('Receta de prueba',{exact:true})).toBeVisible();
  await offlinePage.getByRole('button',{name:'Generar lista del menú'}).click();
  await expect(offlinePage.locator('.shopping-item')).toHaveCount(0);
  await nav(offlinePage,'recetas');
  await offlinePage.locator('.recipe-card').filter({hasText:'Receta de prueba'}).locator('[data-action="recipe-times"]').selectOption('2');
  await offlinePage.getByRole('button',{name:'Generar lista del menú'}).click();
  await expect(offlinePage.getByLabel('Cantidad planeada de Arroz de prueba')).toHaveValue('500');
  await offlinePage.getByLabel('Cantidad comprada de Arroz de prueba').fill('2000');
  await offlinePage.getByLabel('Precio por kg de Arroz de prueba').fill('50');
  await offlinePage.getByLabel('Marcar Arroz de prueba como comprado').check();
  await offlinePage.locator('[data-action="finalize-shopping"]').click();
  await offlinePage.locator('#checkout-form button[type="submit"]').click();
  await expect(offlinePage.locator('.purchase')).toHaveCount(2);
  await expect.poll(()=>offlinePage.evaluate(async()=>{const {loadState}=await import('./storage.mjs');return (await loadState()).purchases.length;})).toBe(2);
  await offlinePage.reload();await nav(offlinePage,'gastos');
  await expect(offlinePage.locator('.purchase')).toHaveCount(2);
  expect(errors).toEqual([]);expect(external).toEqual([]);
});
test('manifest instalable, iconos y pantalla sin desbordamiento',async()=>{
  const profile=await mkdtemp(path.join(tmpdir(),'mandado-test-'));
  const config=test.info().project.use;
  const context=await chromium.launchPersistentContext(profile,{headless:true,
    executablePath:config.launchOptions.executablePath,baseURL:config.baseURL,
    viewport:config.viewport,isMobile:config.isMobile,hasTouch:config.hasTouch,userAgent:config.userAgent});
  try{
  const page=await context.newPage();
  await ready(page);
  await nav(page,'ajustes');await page.getByLabel('Apariencia').selectOption('dark');
  const cdp=await context.newCDPSession(page);
  const manifest=await cdp.send('Page.getAppManifest');
  expect(manifest.errors).toEqual([]);
  const parsed=JSON.parse(manifest.data);
  expect(parsed.display).toBe('standalone');expect(parsed.start_url).toBe('./');
  for(const icon of parsed.icons){const response=await page.request.get(icon.src);expect(response.ok()).toBeTruthy();expect(response.headers()['content-type']).toContain('image/png');}
  const install=await cdp.send('Page.getInstallabilityErrors');
  expect(install.installabilityErrors).toEqual([]);
  for(const view of ['inicio','recetas','mandado','gastos','ajustes']){
    await nav(page,view);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    const contrast=await page.evaluate(()=>{
      const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});
      const luminance=value=>{const c=rgb(value);return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;};
      const root=getComputedStyle(document.documentElement);
      const a=luminance(root.color),b=luminance(root.backgroundColor);
      return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  }
  }finally{await context.close();await rm(profile,{recursive:true,force:true});}
});
test('agregar receta y artículo manual; restaurar respaldo y guardar con alternativa local',async({page})=>{
  await page.addInitScript(()=>{indexedDB.open=()=>{throw new Error('IndexedDB bloqueado para esta prueba');};});
  await ready(page);
  await nav(page,'recetas');
  await page.locator('[data-action="new-recipe"]').click();
  await page.locator('#recipe-form [name="title"]').fill('Sopa manual de prueba');
  await page.getByLabel('Ingrediente',{exact:true}).fill('Verdura de prueba');
  await page.locator('#recipe-form [name="steps"]').fill('Lavar.\nCocinar.');
  await page.locator('#recipe-form button[type="submit"]').click();
  await expect(page.getByText('Sopa manual de prueba',{exact:true})).toBeVisible();
  await nav(page,'mandado');
  await page.locator('[data-action="add-item"]').click();
  await page.locator('#manual-item-form [name="name"]').fill('Jabón de prueba');
  await page.locator('#manual-item-form button[type="submit"]').click();
  await page.getByLabel('Cantidad comprada de Jabón de prueba').fill('2');
  await page.getByLabel('Precio por pza de Jabón de prueba').fill('20');
  await page.getByLabel('Marcar Jabón de prueba como comprado').check();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('mi-mandado-respaldo')||'{}').shopping?.[0]?.totalPaid)).toBe('40');
  await page.reload();await nav(page,'mandado');
  await expect(page.getByLabel('Total pagado por Jabón de prueba')).toHaveValue('40');
  const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('mi-mandado-respaldo')));
  restored.defaultStore='Tienda restaurada';restored.budgetWeekly=300;
  await nav(page,'ajustes');page.once('dialog',dialog=>dialog.accept());
  await page.locator('#restore-input').setInputFiles({name:'respaldo.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(restored))});
  await expect(page.locator('.hero')).toBeVisible();
  await nav(page,'ajustes');
  await expect(page.locator('#budget')).toHaveValue('300');
  await expect(page.locator('#default-store')).toHaveValue('Tienda restaurada');
});


test('compras registradas no reaparecen; nueva semana permite comprarlas de nuevo',async({page,context})=>{
 await ready(page);await nav(page,'recetas');
 await page.locator('#import-recipes-input').setInputFiles({name:'recetas.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(pack))});
 const recipe=page.locator('.recipe-card').filter({hasText:'Receta de prueba'});
 await recipe.locator('[data-action="toggle-recipe"]').check();
 await page.locator('[data-action="generate-list"]').click();
 await page.getByLabel('Cantidad comprada de Arroz de prueba').fill('1');
 await page.getByLabel('Precio por kg de Arroz de prueba').fill('20');
 await page.getByLabel('Marcar Arroz de prueba como comprado').check();
 await page.locator('[data-action="finalize-shopping"]').click();
 await page.locator('#checkout-form button[type="submit"]').click();
 await expect.poll(()=>page.evaluate(async()=>{const {loadState}=await import('./storage.mjs');return (await loadState()).purchases.length;})).toBe(1);
 await context.setOffline(true);await page.reload();await nav(page,'recetas');
 await page.locator('[data-action="generate-list"]').click();
 await expect(page.locator('.shopping-item')).toHaveCount(0);
 await page.reload();await nav(page,'recetas');
 await recipe.locator('[data-action="recipe-times"]').selectOption('2');
 await page.locator('[data-action="generate-list"]').click();
 await expect(page.getByLabel('Cantidad planeada de Arroz de prueba')).toHaveValue('1');
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('[data-action="new-week"]').click();
 await recipe.locator('[data-action="toggle-recipe"]').check();
 await page.locator('[data-action="generate-list"]').click();
 await expect(page.getByLabel('Cantidad planeada de Arroz de prueba')).toHaveValue('1');
 await nav(page,'gastos');await expect(page.locator('.purchase')).toHaveCount(1);
});

test('tema oscuro, claro y sistema conservan preferencia sin internet',async({page,context})=>{
 await page.emulateMedia({colorScheme:'dark'});await ready(page);
 const bg=()=>page.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor);
 await nav(page,'ajustes');
 const select=page.getByLabel('Apariencia');await expect(select).toHaveValue('system');
 await select.selectOption('dark');
 const dark=await bg();expect(dark).not.toBe('rgb(246, 248, 245)');
 await expect.poll(()=>page.evaluate(async()=>{const {loadState}=await import('./storage.mjs');return (await loadState()).theme;})).toBe('dark');
 await context.setOffline(true);await page.reload();await nav(page,'ajustes');
 await expect(select).toHaveValue('dark');expect(await bg()).toBe(dark);
 await select.selectOption('light');expect(await bg()).toBe('rgb(246, 248, 245)');
 await page.emulateMedia({colorScheme:'light'});await select.selectOption('system');
 expect(await bg()).toBe('rgb(246, 248, 245)');
 await page.emulateMedia({colorScheme:'dark'});await expect.poll(bg).toBe(dark);
 await select.selectOption('light');await page.emulateMedia({colorScheme:'dark'});
 expect(await bg()).toBe('rgb(246, 248, 245)');
});


test('compra parcial mantiene lo pendiente sin tener que regenerar',async({page})=>{
 await ready(page);await nav(page,'recetas');
 await page.locator('#import-recipes-input').setInputFiles({name:'recetas.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(pack))});
 await page.locator('.recipe-card').filter({hasText:'Receta de prueba'}).locator('[data-action="toggle-recipe"]').check();
 await page.locator('[data-action="generate-list"]').click();
 await page.getByLabel('Cantidad comprada de Arroz de prueba').fill('0,4');
 await page.getByLabel('Precio por kg de Arroz de prueba').fill('20');
 await page.getByLabel('Marcar Arroz de prueba como comprado').check();
 await page.locator('[data-action="finalize-shopping"]').click();
 await page.locator('#checkout-form button[type="submit"]').click();
 await nav(page,'mandado');
 await expect(page.getByLabel('Cantidad planeada de Arroz de prueba')).toHaveValue('600');
 await expect(page.getByLabel('Marcar Arroz de prueba como comprado')).not.toBeChecked();
 await expect(page.getByLabel('Cantidad comprada de Arroz de prueba')).toHaveValue('');
});


test('gramos en recetas y compras mantienen el precio por kilo',async({page})=>{
 await ready(page);await nav(page,'recetas');
 await page.locator('[data-action="view-recipe"]').first().click();
 await expect(page.locator('.ingredient-list').getByText('600 g',{exact:true})).toHaveCount(2);
 await page.locator('.icon-close').click();
 await page.locator('[data-action="toggle-recipe"]').first().check();
 await page.locator('[data-action="generate-list"]').click();
 const actual=page.getByLabel('Cantidad comprada de Pechuga de pollo');
 await expect(page.getByLabel('Cantidad planeada de Pechuga de pollo')).toHaveValue('600');
 await actual.fill('600');await page.getByLabel('Precio por kg de Pechuga de pollo').fill('120');
 await expect(page.getByLabel('Total pagado por Pechuga de pollo')).toHaveValue('72');
 await actual.fill('1300');await page.getByLabel('Precio por kg de Pechuga de pollo').click();
 await expect(actual).toHaveValue('1.3');
 await expect(page.getByLabel('Total pagado por Pechuga de pollo')).toHaveValue('156');
 await actual.fill('0,6');await page.getByLabel('Precio por kg de Pechuga de pollo').click();
 await expect(actual).toHaveValue('600');
 await expect(page.getByLabel('Total pagado por Pechuga de pollo')).toHaveValue('72');
 await page.getByLabel('Marcar Pechuga de pollo como comprado').check();
 await page.locator('[data-action="finalize-shopping"]').click();await page.locator('#checkout-form button[type="submit"]').click();
 await page.locator('.purchase summary').click();
 await expect(page.locator('.purchase-items')).toContainText('600 g');
 await page.locator('[data-action="edit-purchase"]').click();
 await expect(page.locator('[data-purchase-quantity="0"]')).toHaveValue('600');
 await page.locator('#purchase-edit-form button[type="submit"]').click();
 await expect.poll(()=>page.evaluate(async()=>{const {loadState}=await import('./storage.mjs');return (await loadState()).purchases[0].items[0].actualQty;})).toBe(0.6);
});


for(const accept of [true,false])test(`actualizar v0.2 conserva compras y pregunta una vez: ${accept?'asociar':'no asociar'}`,async({page})=>{
 await ready(page);
 await page.evaluate(async()=>{
  const {makeInitialState}=await import('./core.mjs');const {persistState}=await import('./storage.mjs');
  const raw=makeInitialState();delete raw.menuPurchaseIds;delete raw.theme;
  raw.selected=[{recipeId:raw.recipes[0].id,times:1}];
  const d=new Date(),date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  raw.purchases=[{id:'migracion-prueba',date,items:[{name:'Pechuga de pollo',unit:'kg',actualQty:0.6,totalPaid:72,source:'recipe'}]}];
  await persistState(raw);
 });
 let prompts=0;page.on('dialog',async dialog=>{prompts++;await(accept?dialog.accept():dialog.dismiss());});
 await page.reload();await expect(page.locator('.hero')).toBeVisible();
 await expect.poll(()=>page.evaluate(async()=>{const {loadState}=await import('./storage.mjs');return(await loadState()).menuMigrationPending;})).toBe(false);
 await page.reload();await nav(page,'recetas');await page.locator('[data-action="generate-list"]').click();
 await expect(page.getByLabel('Cantidad planeada de Pechuga de pollo')).toHaveCount(accept?0:1);
 await nav(page,'gastos');await expect(page.locator('.purchase')).toHaveCount(1);expect(prompts).toBe(1);
});

test('ingrediente guardado en gramos conserva tarifa por kilo y remanente',async({page})=>{
 await ready(page);await nav(page,'recetas');
 const grams=structuredClone(pack);grams.recipes[0].ingredients[0].quantity=600;grams.recipes[0].ingredients[0].unit='g';
 await page.locator('#import-recipes-input').setInputFiles({name:'gramos.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(grams))});
 await page.locator('.recipe-card').filter({hasText:'Receta de prueba'}).locator('[data-action="toggle-recipe"]').check();
 await page.locator('[data-action="generate-list"]').click();
 await page.getByLabel('Cantidad comprada de Arroz de prueba').fill('400');await page.getByLabel('Precio por kg de Arroz de prueba').fill('120');
 await expect(page.getByLabel('Total pagado por Arroz de prueba')).toHaveValue('48');
 await page.getByLabel('Marcar Arroz de prueba como comprado').check();await page.locator('[data-action="finalize-shopping"]').click();await page.locator('#checkout-form button[type="submit"]').click();
 await nav(page,'mandado');await expect(page.getByLabel('Cantidad planeada de Arroz de prueba')).toHaveValue('200');
 await expect(page.locator('.item-footer')).toContainText('$120.00/kg');
});
