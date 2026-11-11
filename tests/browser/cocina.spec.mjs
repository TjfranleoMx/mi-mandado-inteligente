import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const read=name=>fs.readFileSync(new URL(`../../${name}`,import.meta.url));
const PACK=read('ejemplo-receta-detallada.json'),MENU=read('ejemplo-menu-detallado.json');
const prefijo=()=>test.info().project.name.startsWith('movil')?'mobile':'desktop';
const nav=(page,view)=>page.locator(`.nav-link[data-view="${view}"]:visible`).first().click();   // el menú visible depende del ancho de pantalla
async function ready(page){
  await page.goto('./');
  await expect(page.locator('.hero')).toBeVisible();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
}
const saved=page=>page.evaluate(async()=>{const {loadState}=await import('./storage.mjs');return loadState();});
const tema=async(page,valor)=>{await nav(page,'ajustes');await page.locator('#theme-choice').selectOption(valor);};
const recetario=async page=>{await nav(page,'recetas');await page.getByRole('tab',{name:'Recetario',exact:true}).click();};
const importar=async(page,buffer=PACK)=>{await recetario(page);await page.locator('#import-recipes-input').setInputFiles({name:'recetas.json',mimeType:'application/json',buffer});};
const abrir=async(page,titulo)=>{await recetario(page);await page.locator('.recipe-card').filter({hasText:titulo}).getByRole('button',{name:'Ver preparación'}).first().click();await expect(page.locator('#modal[open] .recipe-details')).toBeVisible();};
const ENSALADA='jitomate y aguacate',POLLO='ejemplo con límites';
const textoModal=page=>page.locator('#modal-content').innerText();
const cocinando=page=>page.locator('dialog.cooking .cook');

for(const modo of ['light','dark'])test(`importar un archivo con detalles: vista completa ordenada, sin etiquetas de maqueta (${modo})`,async({page})=>{
  await ready(page);await tema(page,modo);await importar(page);
  await expect(page.locator('.recipe-card').filter({hasText:ENSALADA})).toBeVisible();
  await abrir(page,ENSALADA);
  expect(await page.locator('#modal-content h3').allTextContents()).toEqual(['Utensilios','Antes de empezar','Ingredientes','Preparación paso a paso','Notas']);
  const paso1=page.locator('.prep-step').first();
  await expect(paso1).toContainText('Usas');await expect(paso1).toContainText('300 g');await expect(paso1).toContainText('50 g');
  await expect(paso1).toContainText('Cubos: trozos con forma de dado');
  await expect(page.locator('.prep-step').nth(2)).toContainText('Cómo comprobar: Prueba un poco');
  const texto=await textoModal(page);
  for(const prohibido of ['Falta','De la receta','Por revisar','Fuego','Tiempo aproximado','Seguridad','información pendiente'])expect(texto).not.toContain(prohibido);
  // La foto conserva el tamaño aprobado: igual que la de una receta sin detalles.
  const medir=async()=>page.locator('.recipe-photo').evaluate(i=>{const r=i.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)];});
  const conDetalles=await medir();
  await page.locator('.icon-close').click();
  await recetario(page);await page.locator('button[data-action="view-recipe"][data-id="ejemplo-pollo-calabacitas"]').click();await expect(page.locator('#modal[open] .recipe-details')).toBeVisible();
  expect(await medir()).toEqual(conDetalles);
  await page.locator('.icon-close').click();
  await abrir(page,ENSALADA);
  await page.screenshot({path:`test-results/cocina-receta-${modo}-${test.info().project.name}.png`});
  await page.locator('#recipe-steps').scrollIntoViewIfNeeded();
  await page.screenshot({path:`test-results/cocina-pasos-${modo}-${test.info().project.name}.png`});
});

for(const modo of ['light','dark'])test(`receta con información pendiente: se señala y no se muestra como completa (${modo})`,async({page})=>{
  await ready(page);await tema(page,modo);await importar(page);await abrir(page,POLLO);
  await expect(page.locator('.recipe-limits')).toContainText('Esta receta tiene información pendiente');
  await expect(page.locator('.recipe-limits')).toContainText('No indica el nivel de fuego');
  await expect(page.locator('.prep-step').nth(1).locator('.step-safety')).toContainText('74 °C');
  const texto=await textoModal(page);expect(texto).not.toContain('Fuego:');expect(texto).not.toContain('Tiempo aproximado');
  expect(await page.locator('#modal-content h3').allTextContents()).toEqual(['Utensilios','Ingredientes','Preparación paso a paso','Notas']);
  await page.screenshot({path:`test-results/cocina-pendiente-${modo}-${test.info().project.name}.png`});
  await page.locator('[data-action="cook-start"]').click();
  await expect(page.locator('.cook .recipe-limits')).toBeVisible();                       // también al empezar a cocinar
  await page.screenshot({path:`test-results/cocina-modo-intro-pendiente-${modo}-${test.info().project.name}.png`});
  await page.getByRole('button',{name:'Empezar →'}).click();
  await expect(page.locator('.cook-warn')).toContainText('información pendiente');       // y en cada paso
  await page.getByRole('button',{name:'Siguiente →'}).click();
  await expect(page.locator('.cook .step-safety')).toContainText('74 °C');
});

for(const modo of ['light','dark'])test(`Cocinar paso a paso: letra grande, progreso, navegación y regreso a la receta completa (${modo})`,async({page})=>{
  await ready(page);await tema(page,modo);await importar(page);await abrir(page,ENSALADA);
  await page.locator('[data-action="cook-start"]').click();
  await expect(page.locator('dialog.cooking')).toBeVisible();
  await expect(cocinando(page)).toContainText('Antes de empezar');await expect(cocinando(page)).toContainText('Tabla para cortar');await expect(cocinando(page)).toContainText('Lava el jitomate');
  await expect(page.getByRole('button',{name:'← Anterior'})).toBeDisabled();
  await page.screenshot({path:`test-results/cocina-modo-intro-${modo}-${test.info().project.name}.png`});
  await page.getByRole('button',{name:'Empezar →'}).click();
  await expect(page.locator('.cook-count')).toHaveText('Paso 1 de 3');
  await expect(page.locator('.cook-progress')).toHaveAttribute('aria-valuenow','1');
  const tamano=await page.locator('.cook-text').evaluate(e=>parseFloat(getComputedStyle(e).fontSize));expect(tamano).toBeGreaterThanOrEqual(24);
  for(const nombre of ['← Anterior','Siguiente →']){const b=await page.getByRole('button',{name:nombre}).boundingBox();expect(b.height).toBeGreaterThanOrEqual(60);}
  await expect(cocinando(page)).toContainText('Usas');await expect(cocinando(page)).toContainText('300 g');await expect(cocinando(page)).toContainText('Cuadritos: trozos pequeños');
  await page.screenshot({path:`test-results/cocina-modo-paso-${modo}-${test.info().project.name}.png`});
  await page.getByRole('button',{name:'Siguiente →'}).click();
  await expect(page.locator('.cook-count')).toHaveText('Paso 2 de 3');
  // Consultar la receta completa sin perder el paso.
  await page.getByRole('button',{name:'Ver receta completa'}).click();
  await expect(page.locator('#modal[open] .recipe-details')).toBeVisible();await expect(page.locator('dialog.cooking')).toHaveCount(0);
  await expect(page.locator('[data-action="cook-start"]')).toContainText('Continuar: paso 2 de 3');
  await page.locator('[data-action="cook-start"]').click();
  await expect(page.locator('.cook-count')).toHaveText('Paso 2 de 3');
  await page.getByRole('button',{name:'← Anterior'}).click();await expect(page.locator('.cook-count')).toHaveText('Paso 1 de 3');
  await page.getByRole('button',{name:'Siguiente →'}).click();
  // Salir y volver a abrir la receta con la app abierta: sigue en el paso 2.
  await page.getByRole('button',{name:'Salir'}).click();await expect(page.locator('#modal[open]')).toHaveCount(0);
  await abrir(page,ENSALADA);await expect(page.locator('[data-action="cook-start"]')).toContainText('Continuar: paso 2 de 3');
  await page.locator('[data-action="cook-restart"]').click();await expect(cocinando(page)).toContainText('Antes de empezar');
  await page.getByRole('button',{name:'Empezar →'}).click();
  await page.getByRole('button',{name:'Siguiente →'}).click();await page.getByRole('button',{name:'Siguiente →'}).click();
  await expect(page.locator('.cook-count')).toHaveText('Paso 3 de 3');await expect(page.locator('.cook-progress i.on')).toHaveCount(3);
  await page.getByRole('button',{name:'Terminar ✓'}).click();
  await expect(page.locator('#toast')).toContainText('Terminaste la receta');
  await expect(page.locator('[data-action="cook-start"]')).toContainText('Cocinar paso a paso');
});

test('el paso actual solo se recuerda mientras la app está abierta (recordarlo al cerrarla queda pendiente)',async({page})=>{
  await ready(page);await importar(page);await abrir(page,ENSALADA);
  await page.locator('[data-action="cook-start"]').click();await page.getByRole('button',{name:'Empezar →'}).click();
  await page.getByRole('button',{name:'Salir'}).click();
  await page.reload();await expect(page.locator('.hero')).toBeVisible();
  await abrir(page,ENSALADA);
  await expect(page.locator('[data-action="cook-start"]')).toContainText('Cocinar paso a paso');
});

test('una receta antigua (solo texto) se puede cocinar paso a paso sin campos opcionales',async({page})=>{
  await ready(page);await recetario(page);await page.locator('button[data-action="view-recipe"][data-id="ejemplo-pollo-calabacitas"]').click();await expect(page.locator('#modal[open] .recipe-details')).toBeVisible();
  expect(await page.locator('#modal-content h3').allTextContents()).toEqual(['Ingredientes','Preparación paso a paso']);
  await expect(page.locator('.prep-step')).toHaveCount(4);
  await page.locator('[data-action="cook-start"]').click();
  await expect(page.locator('.cook-count')).toHaveText('Paso 1 de 4');
  await expect(page.getByRole('button',{name:'← Anterior'})).toBeDisabled();
  const texto=await cocinando(page).innerText();
  for(const prohibido of ['Usas','Fuego','Tiempo aproximado','Cómo comprobar','Seguridad','Falta','pendiente'])expect(texto).not.toContain(prohibido);
  await expect(cocinando(page)).toContainText('Lava y desinfecta las verduras');
});

for(const [nombre,viewport] of [['teléfono pequeño',{width:360,height:640}],['teléfono horizontal',{width:800,height:360}]])
  test(`${nombre}: ningún contenido ni botón queda inaccesible en la receta completa ni en el modo de cocina`,async({page})=>{
    test.skip(!test.info().project.name.startsWith('movil'),'solo móvil');
    await page.setViewportSize(viewport);
    await ready(page);await importar(page);
    for(const titulo of [POLLO,ENSALADA]){
      await abrir(page,titulo);
      // Receta completa: se llega al final y el botón «Cerrar» queda visible y sin nada encima.
      const fin=await page.evaluate(async()=>{
        const dialogo=document.getElementById('modal');dialogo.scrollTop=dialogo.scrollHeight;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        const b=[...document.querySelectorAll('#modal-content button')].find(x=>x.textContent.trim()==='Cerrar').getBoundingClientRect();
        const e=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
        return {dentro:b.top>=0&&b.bottom<=innerHeight&&b.left>=0&&b.right<=innerWidth,tapado:e?.textContent.trim()!=='Cerrar'};
      });
      expect(fin).toEqual({dentro:true,tapado:false});
      await page.locator('[data-action="cook-start"]').click();
      const pantallas=await page.evaluate(()=>document.querySelector('.cook-progress').children.length);
      for(let i=0;i<=pantallas+1;i++){
        const r=await page.evaluate(async()=>{
          const cuerpo=document.querySelector('.cook-body'),pie=document.querySelector('.cook-foot');
          cuerpo.scrollTop=cuerpo.scrollHeight;await new Promise(x=>requestAnimationFrame(()=>requestAnimationFrame(x)));
          const p=pie.getBoundingClientRect(),c=cuerpo.getBoundingClientRect(),ultimo=cuerpo.lastElementChild.getBoundingClientRect();
          const botones=[...pie.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect(),e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
            return {texto:b.textContent.trim(),dentro:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth,tapado:!(e&&b.contains(e))};});
          const salir=document.querySelector('.cook-head button').getBoundingClientRect();
          return {botones,ultimoVisible:ultimo.bottom<=p.top+1&&ultimo.bottom>c.top,pie:Math.round(p.bottom)<=innerHeight,cabecera:salir.top>=0&&salir.bottom<=innerHeight,
            cuerpoUtil:Math.round(c.height)};
        });
        expect(r.botones.filter(b=>!b.dentro||b.tapado),`${titulo} pantalla ${i}: ${JSON.stringify(r)}`).toEqual([]);
        expect(r.ultimoVisible,`${titulo} pantalla ${i}: el final del contenido queda tapado`).toBe(true);
        expect(r.pie&&r.cabecera).toBe(true);
        expect(r.cuerpoUtil,`${titulo} pantalla ${i}: casi no queda espacio para leer`).toBeGreaterThanOrEqual(viewport.height===360?130:250);
        const siguiente=page.getByRole('button',{name:/Siguiente →|Empezar →/});
        if(await siguiente.count()===0||await page.locator('.cook-count').innerText()===`Paso ${pantallas} de ${pantallas}`)break;
        await siguiente.click();
      }
      await page.getByRole('button',{name:'Salir'}).click();
    }
  });

test('editar una receta con detalles los conserva; cambiar la cantidad de pasos avisa antes de quitarlos',async({page})=>{
  await ready(page);await importar(page);await abrir(page,POLLO);
  await page.locator('#modal-content [data-action="edit-recipe"]').click();
  await expect(page.locator('#recipe-form .hint').filter({hasText:'detalles por paso'})).toBeVisible();
  await page.locator('#recipe-form [name="minutes"]').fill('40');
  await page.locator('#recipe-form button[type="submit"]').click();
  let r=(await saved(page)).recipes.find(x=>x.title.includes(POLLO));
  expect([r.minutes,r.utensils,r.limitations.length,r.stepDetails.length]).toEqual([40,['Sartén'],2,4]);
  expect(r.stepDetails[1].safetyCheck).toContain('74 °C');
  // Cambiar la cantidad de pasos: si se cancela, no cambia nada.
  await abrir(page,POLLO);await page.locator('#modal-content [data-action="edit-recipe"]').click();
  const pasos=await page.locator('#recipe-form [name="steps"]').inputValue();
  await page.locator('#recipe-form [name="steps"]').fill(pasos+'\nServir caliente.');
  page.once('dialog',d=>{expect(d.message()).toContain('Cambiaste la cantidad de pasos');d.dismiss();});
  await page.locator('#recipe-form button[type="submit"]').click();
  r=(await saved(page)).recipes.find(x=>x.title.includes(POLLO));expect([r.steps.length,r.stepDetails.length]).toEqual([4,4]);
  // Si se acepta, se quitan solo los detalles por paso; lo demás se conserva.
  page.once('dialog',d=>d.accept());
  await page.locator('#recipe-form button[type="submit"]').click();
  await expect.poll(async()=>(await saved(page)).recipes.find(x=>x.title.includes(POLLO)).steps.length).toBe(5);
  r=(await saved(page)).recipes.find(x=>x.title.includes(POLLO));
  expect(['stepDetails' in r,r.utensils,r.limitations.length,r.notes.length]).toEqual([false,['Sartén'],2,1]);
});

test('menú con detalles: importar, guardar, repetir, respaldar, restaurar y reabrir sin internet',async({page,context})=>{
  const detalles=r=>JSON.stringify([r.utensils,r.prep,r.notes,r.limitations,r.stepDetails]);
  await ready(page);await nav(page,'recetas');
  await page.locator('#import-recipes-input').setInputFiles({name:'menu.json',mimeType:'application/json',buffer:MENU});
  await expect(page.locator('#menu-import-form')).toBeVisible();
  await page.locator('#menu-import-form button[type="submit"]').click();
  await expect(page.locator('#active-plan')).toBeVisible();
  await expect(page.locator('.menu-day img')).toHaveCount(2);
  const detallada=async()=>(await saved(page)).recipes.filter(x=>x.title.includes('ejemplo con'));
  const referencia=Object.fromEntries((await detallada()).map(r=>[r.title,detalles(r)]));
  expect(Object.keys(referencia)).toHaveLength(2);
  // Guardar y repetir el menú.
  await page.locator('[data-action="save-menu"]').click();await page.locator('#save-menu-form button[type="submit"]').click();
  await expect(page.locator('.saved-menu-card')).toContainText('Menú de ejemplo con detalles');
  await page.locator('[data-action="repeat-menu"]').click();
  await page.locator('#repeat-menu-form [name="startDate"]').fill('2026-11-30');
  await page.locator('#repeat-menu-form button[type="submit"]').click();
  await expect(page.locator('.menu-day img')).toHaveCount(2);
  let estado=await saved(page);
  expect(estado.recipes.filter(x=>x.title.includes('ejemplo con'))).toHaveLength(2);   // repetir no duplica recetas
  expect(estado.savedMenus[0].recipes.map(detalles).sort()).toEqual(Object.values(referencia).sort());
  // La receta repetida se puede cocinar con todos sus detalles.
  await page.locator('.menu-day').filter({hasText:'Ensalada de jitomate'}).click();
  await expect(page.locator('.recipe-utensils')).toContainText('Tabla para cortar');
  await page.locator('.icon-close').click();
  // Respaldo, borrar y restaurar.
  await nav(page,'ajustes');
  const [descarga]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action="export-backup"]').click()]);
  const respaldo=fs.readFileSync(await descarga.path());
  expect(JSON.parse(respaldo).recipes.find(x=>x.title.includes('jitomate y aguacate')).stepDetails).toBeTruthy();
  await page.evaluate(async()=>{const {makeInitialState}=await import('./core.mjs');const {persistState}=await import('./storage.mjs');await persistState(makeInitialState());});
  await page.reload();await expect(page.locator('.hero')).toBeVisible();
  expect((await saved(page)).recipes.some(x=>x.title.includes('ejemplo con'))).toBe(false);
  await context.setOffline(true);                                                       // restaurar y reabrir sin internet
  page.once('dialog',d=>d.accept());await nav(page,'ajustes');
  await page.locator('#restore-input').setInputFiles({name:'respaldo.json',mimeType:'application/json',buffer:respaldo});
  await expect(page.locator('.hero')).toBeVisible();
  estado=await saved(page);
  for(const r of estado.recipes.filter(x=>x.title.includes('ejemplo con')))expect(detalles(r)).toBe(referencia[r.title]);
  expect(estado.recipes.find(x=>x.title.includes('jitomate y aguacate')).image).toMatch(/^data:image\/webp/);
  await page.reload();await expect(page.locator('.hero')).toBeVisible();
  await abrir(page,ENSALADA);
  await expect(page.locator('.recipe-photo')).toBeVisible();
  expect(await page.locator('.recipe-photo').evaluate(i=>i.complete&&i.naturalWidth>0)).toBe(true);
  await page.locator('[data-action="cook-start"]').click();
  await page.getByRole('button',{name:'Empezar →'}).click();
  await expect(cocinando(page)).toContainText('Usas');
  await context.setOffline(false);
});

for(const modo of ['light','dark'])for(const [nombre,viewport] of [['pequena',{width:360,height:640}],['horizontal',{width:800,height:360}]])
  test(`capturas del modo de cocina en pantalla ${nombre} (${modo})`,async({page})=>{
    test.skip(!test.info().project.name.startsWith('movil'),'solo móvil');
    await page.setViewportSize(viewport);
    await ready(page);
    // (A 800×360 el menú lateral existente no cabe y «Ajustes» queda fuera de pantalla: el tema se pone sin usarlo.)
    await page.evaluate(async modo=>{const {loadState,persistState}=await import('./storage.mjs');const e=await loadState();e.theme=modo;await persistState(e);},modo);
    await page.reload();await expect(page.locator('.hero')).toBeVisible();
    await importar(page);await abrir(page,POLLO);
    await page.locator('[data-action="cook-start"]').click();
    await page.screenshot({path:`test-results/cocina-${nombre}-intro-${modo}.png`});
    await page.getByRole('button',{name:'Empezar →'}).click();await page.getByRole('button',{name:'Siguiente →'}).click();
    await page.screenshot({path:`test-results/cocina-${nombre}-paso-${modo}.png`});
  });

test('cambiar el texto de un paso con detalles (sin cambiar el número de pasos) pide revisarlos antes de guardar',async({page})=>{
  await ready(page);await importar(page);
  const pollo=async()=>(await saved(page)).recipes.find(x=>x.title.includes(POLLO));
  await expect(page.locator('.recipe-card').filter({hasText:POLLO})).toBeVisible();   // la importación termina antes de leer
  const original=await pollo();
  const editar=async()=>{await abrir(page,POLLO);await page.locator('#modal-content [data-action="edit-recipe"]').click();};
  const lineas=()=>page.locator('#recipe-form [name="steps"]').inputValue().then(t=>t.split('\n'));
  await editar();
  let texto=await lineas();
  texto[1]=texto[1].replace('un sartén','una sartén');
  await page.locator('#recipe-form [name="steps"]').fill(texto.join('\n'));
  await page.locator('#recipe-form [name="minutes"]').fill('45');
  await page.locator('#recipe-form button[type="submit"]').click();
  // Aparece la revisión; todavía no se guardó nada.
  await expect(page.locator('#detail-review-form')).toBeVisible();
  await expect(page.locator('#modal-content')).toContainText('Texto anterior');
  await expect(page.locator('.detail-review')).toHaveCount(1);
  await expect(page.locator('.detail-review')).toContainText('Seguridad: El pollo debe llegar a 74 °C');
  await expect(page.locator('.detail-review')).toContainText('15 ml');
  await expect(page.locator('#detail-review-form input[type="radio"]:checked')).toHaveCount(0);
  await page.screenshot({path:`test-results/revision-detalles-${test.info().project.name}.png`});
  let r=await pollo();expect([r.steps[1],r.minutes,r.stepDetails[1].safetyCheck]).toEqual([original.steps[1],original.minutes,original.stepDetails[1].safetyCheck]);
  // Sin decidir no se puede guardar.
  await page.locator('#detail-review-form button[type="submit"]').click();
  await expect(page.locator('#toast')).toContainText('Elige qué hacer con los detalles del paso 2');
  await expect(page.locator('#detail-review-form')).toBeVisible();
  r=await pollo();expect(r.steps[1]).toBe(original.steps[1]);
  // «Volver a editar» regresa al editor con lo que ya se había escrito.
  await page.getByRole('button',{name:'Volver a editar'}).click();
  await expect(page.locator('#recipe-form [name="steps"]')).toHaveValue(texto.join('\n'));
  await expect(page.locator('#recipe-form [name="minutes"]')).toHaveValue('45');
  await page.locator('#recipe-form button[type="submit"]').click();
  await page.locator('#detail-review-form input[value="keep"]').check();
  await page.locator('#detail-review-form button[type="submit"]').click();
  await expect(page.locator('#toast')).toContainText('Receta actualizada');
  r=await pollo();
  expect([r.steps[1],r.minutes]).toEqual([texto[1],45]);
  expect(r.stepDetails[1]).toEqual(original.stepDetails[1]);                       // elegido explícitamente
  expect(r.stepDetails.map(Boolean)).toEqual([true,true,true,true]);
  // Dos pasos cambiados: uno se conserva y otro se quita, cada uno por decisión propia.
  await editar();
  texto=await lineas();texto[0]=texto[0]+' Con cuidado.';texto[2]=texto[2].replace('suaves','blandas');
  await page.locator('#recipe-form [name="steps"]').fill(texto.join('\n'));
  await page.locator('#recipe-form button[type="submit"]').click();
  await expect(page.locator('.detail-review')).toHaveCount(2);
  await page.locator('[data-step="0"] input[value="remove"]').check();
  await page.locator('[data-step="2"] input[value="keep"]').check();
  await page.locator('#detail-review-form button[type="submit"]').click();
  await expect(page.locator('#toast')).toContainText('Receta actualizada');
  r=await pollo();
  expect(r.steps[0]).toBe(texto[0]);expect(r.stepDetails[0]).toBeNull();
  expect(r.stepDetails[1]).toEqual(original.stepDetails[1]);expect(r.stepDetails[2]).toEqual(original.stepDetails[2]);expect(r.stepDetails[3]).toEqual(original.stepDetails[3]);
  expect([r.utensils,r.limitations.length,r.notes.length]).toEqual([['Sartén'],2,1]);   // lo demás no se tocó
});

test('cambiar solo espacios o un paso sin detalles no pide revisión',async({page})=>{
  const mixta={recipes:[{title:'Receta mixta de prueba',servings:2,minutes:10,ingredients:[{name:'Arroz',quantity:1,unit:'kg'}],steps:[{text:'Paso con detalle',heat:'medio',ingredients:[{name:'Arroz',quantity:1,unit:'kg'}]},'Paso solo texto']}]};
  await ready(page);await importar(page,Buffer.from(JSON.stringify(mixta)));
  const receta=async()=>(await saved(page)).recipes.find(x=>x.title==='Receta mixta de prueba');
  await abrir(page,'Receta mixta de prueba');await page.locator('#modal-content [data-action="edit-recipe"]').click();
  await page.locator('#recipe-form [name="steps"]').fill('Paso   con   detalle\nPaso solo texto cambiado');
  await page.locator('#recipe-form button[type="submit"]').click();
  await expect(page.locator('#toast')).toContainText('Receta actualizada');
  await expect(page.locator('#detail-review-form')).toHaveCount(0);
  const r=await receta();
  expect([r.steps[1],r.stepDetails[0].heat,r.stepDetails[0].ingredients.length,r.stepDetails[1]]).toEqual(['Paso solo texto cambiado','medio',1,null]);
});

test('captura: revisión de detalles en oscuro',async({page})=>{
  test.skip(!test.info().project.name.startsWith('movil'),'solo móvil');
  await ready(page);await tema(page,'dark');await importar(page);await abrir(page,POLLO);
  await page.locator('#modal-content [data-action="edit-recipe"]').click();
  const t=(await page.locator('#recipe-form [name="steps"]').inputValue()).split('\n');t[1]=t[1].replace('un sartén','una sartén');
  await page.locator('#recipe-form [name="steps"]').fill(t.join('\n'));
  await page.locator('#recipe-form button[type="submit"]').click();
  await expect(page.locator('#detail-review-form')).toBeVisible();
  await page.screenshot({path:'test-results/revision-detalles-oscuro.png'});
});
