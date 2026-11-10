import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const nav=(page,view)=>page.locator(`#${test.info().project.name.startsWith('movil')?'mobile':'desktop'}-nav [data-view="${view}"]`).click();
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
  await expect(offlinePage.getByLabel('Cantidad comprada de Arroz de prueba')).toBeVisible();
  await offlinePage.getByLabel('Cantidad comprada de Arroz de prueba').fill('2');
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
