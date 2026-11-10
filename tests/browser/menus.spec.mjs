import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {makeInitialState} from '../../core.mjs';
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVxkAAAAASUVORK5CYII=';
const pack={format:'mi-mandado-menu',version:1,name:'Semana de prueba',startDate:'2026-11-16',recipes:[{id:'arroz-pack',title:'Arroz de prueba',image:pixel,servings:3,minutes:20,ingredients:[{name:'Arroz de prueba',quantity:1,unit:'kg',category:'Despensa'}],steps:['Lavar el arroz.','Cocinar y servir.']}],days:['arroz-pack','','','','','','']};
const menuNav=page=>page.locator(`#${test.info().project.name.startsWith('movil')?'mobile':'desktop'}-nav [data-view="recetas"]`).click();
const nav=(page,view)=>page.locator(`#${test.info().project.name.startsWith('movil')?'mobile':'desktop'}-nav [data-view="${view}"]`).click();
async function ready(page){await page.goto('./');await expect(page.locator('.hero')).toBeVisible();await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});}
async function importMenu(page){
 await menuNav(page);
 await page.locator('#import-recipes-input').setInputFiles({name:'menu.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(pack))});
 await expect(page.locator('#menu-import-form')).toBeVisible();
 await page.locator('#menu-import-form button[type="submit"]').click();
 await expect(page.locator('#active-plan')).toBeVisible();
}
test('diseño de menú, fotos, biblioteca y preparación distribuida',async({page})=>{
 await ready(page);await menuNav(page);
 await page.locator('[data-action="create-plan"]').click();
 await page.locator('#plan-form [name="name"]').fill('Comidas de casa');
 await page.locator('#plan-form [name="startDate"]').fill('2026-11-16');
 await page.locator('[data-plan-day="0"]').selectOption('ejemplo-pollo-calabacitas');
 await page.locator('[data-plan-day="1"]').selectOption('ejemplo-atun-nopales');
 await page.locator('#plan-form button[type="submit"]').click();
 await expect(page.locator('.menu-day img')).toHaveCount(2);
 expect(await page.locator('.menu-day img').first().evaluate(img=>img.complete&&img.naturalWidth>0)).toBeTruthy();
 await page.locator('.menu-day').filter({hasText:'Pollo con calabacitas'}).click();
 await expect(page.locator('.recipe-photo')).toBeVisible();
 await page.locator('[data-action="show-steps"]').click();
 await expect(page.getByRole('heading',{name:'Preparación paso a paso',exact:true})).toBeVisible();
 await expect(page.locator('.prep-step')).toHaveCount(4);
 await page.locator('.icon-close').click();
 await page.locator('[data-action="save-menu"]').click();
 await page.locator('#save-menu-form [name="name"]').fill('Favoritos de casa');
 await page.locator('#save-menu-form button[type="submit"]').click();
 await expect(page.locator('.saved-menu-card')).toContainText('Favoritos de casa');
 await page.locator('[data-action="repeat-menu"]').click();
 await page.locator('#repeat-menu-form [name="startDate"]').fill('2026-11-23');
 await page.locator('#repeat-menu-form button[type="submit"]').click();
 await expect(page.locator('.menu-day img')).toHaveCount(2);
 await expect(page.locator('.menu-week')).toContainText('23');
});
test('archivo de menú, despensa y compra sábado conservados al repetir para otro lunes',async({page,context})=>{
 await ready(page);await importMenu(page);
 const first=await page.locator('#active-plan').inputValue();
 await page.locator('[data-action="review-pantry"]').first().click();
 await page.locator('[data-pantry-index="0"]').fill('400');
 await page.locator('#pantry-form button[type="submit"]').click();
 await expect(page.getByLabel('Cantidad planeada de Arroz de prueba')).toHaveValue('600');
 await page.getByLabel('Cantidad comprada de Arroz de prueba').fill('600');
 await page.getByLabel('Precio por kg de Arroz de prueba').fill('120');
 await expect(page.getByLabel('Total pagado por Arroz de prueba')).toHaveValue('72');
 await page.getByLabel('Marcar Arroz de prueba como comprado').check();
 await page.locator('[data-action="finalize-shopping"]').click();
 await page.locator('#checkout-form [name="date"]').fill('2026-11-14');
 await page.locator('#checkout-form button[type="submit"]').click();
 await menuNav(page);await page.locator('[data-action="save-menu"]').click();
 await page.locator('#save-menu-form button[type="submit"]').click();
 await page.locator('[data-action="repeat-menu"]').click();
 await page.locator('#repeat-menu-form [name="startDate"]').fill('2026-11-23');
 await page.locator('#repeat-menu-form button[type="submit"]').click();
 await page.locator('[data-action="review-pantry"]').first().click();
 await expect(page.locator('[data-pantry-index="0"]')).toHaveValue('0');
 await page.locator('#pantry-form button[type="submit"]').click();
 await expect(page.getByLabel('Cantidad planeada de Arroz de prueba')).toHaveValue('1');
 await menuNav(page);await page.locator('#active-plan').selectOption(first);
 await page.locator('[data-action="review-pantry"]').first().click();
 await page.locator('#pantry-form button[type="submit"]').click();
 await expect(page.locator('.shopping-item')).toHaveCount(0);
 await context.setOffline(true);await page.reload();await menuNav(page);
 await expect(page.locator('.menu-day img')).toHaveCount(1);
 expect(await page.locator('.menu-day img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBeTruthy();
 await nav(page,'gastos');await expect(page.locator('.purchase')).toContainText('2026-11-14');
});
test('respaldo con imágenes conserva planes y biblioteca al restaurar offline',async({page,context})=>{
 await ready(page);await importMenu(page);
 await page.locator('[data-action="save-menu"]').click();await page.locator('#save-menu-form button[type="submit"]').click();
 await nav(page,'ajustes');const pending=page.waitForEvent('download');await page.locator('[data-action="export-backup"]').click();
 const stream=await(await pending).createReadStream();let data='';for await(const chunk of stream)data+=chunk;
 const backup=JSON.parse(data);expect(backup.savedMenus.length).toBe(1);expect(backup.backupImages).toContain(pixel);
 await context.setOffline(true);page.once('dialog',dialog=>dialog.accept());
 await page.locator('#restore-input').setInputFiles({name:'respaldo.json',mimeType:'application/json',buffer:Buffer.from(data)});
 await expect(page.locator('.hero')).toBeVisible();await menuNav(page);
 await expect(page.locator('.menu-day img')).toHaveCount(1);
 await page.getByRole('tab',{name:'Guardados',exact:true}).click();await expect(page.locator('.saved-menu-card')).toHaveCount(1);
});


test('subir foto propia y pasos claros, conservados al guardar y recargar',async({page})=>{
 await ready(page);await menuNav(page);await page.getByRole('tab',{name:'Recetario',exact:true}).click();
 await page.locator('[data-action="new-recipe"]').click();
 await page.locator('#recipe-form [name="title"]').fill('Receta con foto local');
 await page.getByLabel('Ingrediente',{exact:true}).fill('Arroz de prueba');
 await page.locator('#recipe-form [name="steps"]').fill('Lavar los ingredientes.\nCocinar con agua.\nServir.');
 await page.locator('#recipe-image-input').setInputFiles({name:'foto.png',mimeType:'image/png',buffer:Buffer.from(pixel.split(',')[1],'base64')});
 await expect(page.locator('#recipe-image-preview img')).toBeVisible();
 await page.locator('#recipe-form button[type="submit"]').click();
 await expect.poll(()=>page.evaluate(async()=>{const {loadState}=await import('./storage.mjs');return (await loadState()).recipes.find(r=>r.title==='Receta con foto local')?.image?.startsWith('data:image/webp;base64,');})).toBe(true);
 await page.reload();await menuNav(page);await page.getByRole('tab',{name:'Recetario',exact:true}).click();
 await page.locator('.recipe-card').filter({hasText:'Receta con foto local'}).getByRole('button',{name:'Ver preparación'}).click();
 await expect(page.locator('.recipe-photo')).toBeVisible();await expect(page.locator('.prep-step')).toHaveCount(3);
});


test('quitar una receta del recetario no elimina comidas de otra semana',async({page})=>{
 await ready(page);await menuNav(page);await page.locator('[data-action="create-plan"]').click();
 await page.locator('#plan-form [name="startDate"]').fill('2026-11-16');
 await page.locator('[data-plan-day="0"]').selectOption('ejemplo-pollo-calabacitas');
 await page.locator('#plan-form button[type="submit"]').click();const first=await page.locator('#active-plan').inputValue();
 await page.locator('[data-action="create-plan"]').click();await page.locator('#plan-form [name="startDate"]').fill('2026-11-23');await page.locator('#plan-form button[type="submit"]').click();
 await page.getByRole('tab',{name:'Recetario',exact:true}).click();
 await page.locator('.recipe-card').filter({hasText:'Pollo con calabacitas'}).getByRole('button',{name:'Editar',exact:true}).click();
 page.once('dialog',dialog=>dialog.accept());await page.locator('[data-action="delete-recipe"]').click();
 await page.getByRole('tab',{name:'Menú semanal',exact:true}).click();await page.locator('#active-plan').selectOption(first);
 await expect(page.locator('.menu-day').filter({hasText:'Pollo con calabacitas'})).toHaveCount(1);
 await page.reload();await menuNav(page);await expect(page.locator('.menu-day').filter({hasText:'Pollo con calabacitas'})).toHaveCount(1);
});


test('restaurar biblioteca válida mayor a 25 MB no rechaza su propio respaldo',async({page})=>{
 await ready(page);const raw=makeInitialState();
 const bytes=await readFile(new URL('../../images/pollo-calabacitas.webp',import.meta.url));
 const image='data:image/webp;base64,'+bytes.toString('base64');
 const recipes=Array.from({length:7},(_,i)=>({...structuredClone(raw.recipes[0]),id:'foto-'+i,image}));
 raw.savedMenus=Array.from({length:60},(_,i)=>({id:'menu-'+i,name:'Menú de prueba '+i,createdAt:0,recipes,selected:recipes.map((r,day)=>({recipeId:r.id,times:1,days:[day]}))}));
 const json=JSON.stringify(raw);expect(Buffer.byteLength(json)).toBeGreaterThan(25000000);
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#restore-input').setInputFiles({name:'respaldo-grande.json',mimeType:'application/json',buffer:Buffer.from(json)});
 await expect.poll(()=>page.evaluate(async()=>{const {loadState}=await import('./storage.mjs');return(await loadState()).savedMenus.length;}),{timeout:15000}).toBe(60);
});
