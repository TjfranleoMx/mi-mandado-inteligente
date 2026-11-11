import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {indexedDB} from 'fake-indexeddb';
import {exampleRecipes,validateRecipe,parseRecipePack,mergeRecipes,validateBackup,makeInitialState,money} from '../core.mjs';
import {encodeBackup,decodeBackup} from '../backup.mjs';
import {ensurePlans,saveMenuTemplate,repeatMenu,importMenuPack,syncActivePlan} from '../menus.mjs';
import {cookingModel,hasIntro,firstScreen,limitationsHTML,utensilsHTML,prepHTML,notesHTML,stepsHTML,stepExtrasHTML,cookScreenHTML,changedDetailSteps,detailReviewHTML} from '../cocina-ui.mjs';

const read=name=>JSON.parse(fs.readFileSync(new URL(`../${name}`,import.meta.url),'utf8'));
const DETALLES=['utensils','prep','notes','limitations','stepDetails'];
const h={esc:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  amountText:(q,u)=>`${q} ${u}`,button:(label,action,kind='',extra='')=>`<button data-action="${action}" class="${kind}" ${extra}>${label}</button>`};
const [ensalada,pollo]=parseRecipePack(read('ejemplo-receta-detallada.json'));
const sinId=r=>{const {id,...rest}=r;return rest;};

// ---------- Recetas antiguas ----------
test('las recetas antiguas se validan igual que antes y no reciben campos nuevos',async t=>{
  const antiguas=[...exampleRecipes,...read('ejemplo-importar-recetas.json').recipes];
  for(const r of antiguas){const v=validateRecipe(r);for(const k of DETALLES)assert.equal(k in v,false,`${r.title}: no debe tener «${k}»`);}
  const original=new URL('../../app/core.mjs',import.meta.url);
  if(!fs.existsSync(original))return t.skip('no está la carpeta app/ original junto a esta copia');
  const old=await import(original.href);
  for(const r of antiguas)assert.deepEqual(sinId(validateRecipe(r)),sinId(old.validateRecipe(r)),r.title);
});

test('una receta antigua se ve en la vista completa y en el modo de cocina sin campos opcionales',()=>{
  const m=cookingModel(validateRecipe(exampleRecipes[0]));
  assert.equal(hasIntro(m),false);assert.equal(firstScreen(m),0);
  const html=stepsHTML(m,h)+cookScreenHTML(m,0,h,'x');
  for(const palabra of ['Usas','Fuego','Tiempo aproximado','Cómo comprobar','Seguridad','Falta','De la receta','Por revisar','información pendiente'])assert.equal(html.includes(palabra),false,palabra);
  assert.match(html,/Paso 1 de 4/);
});

// ---------- Formato nuevo ----------
test('el archivo de ejemplo se importa con todos sus detalles, en la posición de cada paso',()=>{
  assert.equal(ensalada.utensils.length,4);assert.equal(ensalada.prep.length,1);assert.equal(ensalada.notes.length,1);
  assert.equal(ensalada.steps.length,3);assert.equal(ensalada.stepDetails.length,3);
  assert.deepEqual(ensalada.stepDetails[0].ingredients,[{name:'Jitomate',quantity:0.3,unit:'kg'},{name:'Cebolla',quantity:0.05,unit:'kg'}]);
  assert.equal(ensalada.stepDetails[0].terms.length,2);assert.match(ensalada.stepDetails[2].check,/ajusta la sal/);
  assert.match(ensalada.image,/^data:image\/webp;base64,/);
  assert.equal(pollo.limitations.length,2);assert.match(pollo.stepDetails[1].safetyCheck,/74 °C/);assert.equal(pollo.stepDetails[3].safetyCheck,undefined);
  assert.equal('prep' in pollo,false,'lo que el archivo no trae no aparece');
});

test('alias en español, texto mezclado con objetos y campos vacíos que se omiten',()=>{
  const r=validateRecipe({title:'Prueba',servings:2,ingredients:[{name:'Arroz',quantity:1,unit:'kg'}],
    utensilios:['Olla',' ',''],preparacion_previa:[],notas:['Una nota'],limitaciones:[],
    pasos:['Solo texto',{texto:'Con detalles',ingredientes:[{nombre:'Arroz',cantidad:'1,5',unidad:'KG'}],fuego:' medio ',tiempo:'',comprobar:'',seguridad:'',terminos:[]},{text:'   '}]});
  assert.deepEqual(r.steps,['Solo texto','Con detalles']);
  assert.deepEqual(r.utensils,['Olla']);assert.equal('prep' in r,false);assert.equal('limitations' in r,false);assert.deepEqual(r.notes,['Una nota']);
  assert.deepEqual(r.stepDetails,[null,{ingredients:[{name:'Arroz',quantity:1.5,unit:'kg'}],heat:'medio'}]);
  const sinDetalles=validateRecipe({title:'Otra',ingredients:[{name:'A',quantity:1,unit:'kg'}],steps:[{text:'Hola',ingredients:[],terms:[]}]});
  assert.equal('stepDetails' in sinDetalles,false,'un objeto sin detalles no deja basura');
});

test('datos inválidos se rechazan con un mensaje claro y no se deduce nada',()=>{
  const base=extra=>validateRecipe({title:'Mala',ingredients:[{name:'A',quantity:1,unit:'kg'}],steps:['Paso'],...extra});
  assert.throws(()=>base({utensils:'olla'}),/utensilios/);
  assert.throws(()=>base({notes:Array.from({length:11},()=>'x')}),/notas/);
  assert.throws(()=>base({limitations:['x'.repeat(301)]}),/limitaciones/);
  assert.throws(()=>base({steps:[{text:'a',ingredients:[{name:'A',quantity:1,unit:'galón'}]}]}),/Ingrediente de un paso/);
  assert.throws(()=>base({steps:[{text:'a',ingredients:[{name:'A',quantity:-1,unit:'kg'}]}]}),/Ingrediente de un paso/);
  assert.throws(()=>base({steps:[{text:'a',terms:[{term:'solo palabra'}]}]}),/término/);
  assert.throws(()=>base({steps:[{text:'a',terms:Array.from({length:7},(_,i)=>({term:`t${i}`,meaning:'m'}))}]}),/hasta 6/);
  assert.throws(()=>base({steps:[{text:'a',heat:'x'.repeat(61)}]}),/heat/);
  assert.throws(()=>base({steps:[{text:'a',ingredients:'harina'}]}),/lista/);
  // Un texto ambiguo NO produce utensilios, tiempos ni cantidades por sí solo.
  const v=base({steps:['Calienta el aceite en un sartén 10 minutos a fuego medio con 2 tazas de agua']});
  for(const k of DETALLES)assert.equal(k in v,false);
});

test('validar un resultado ya validado da lo mismo (forma guardada: pasos de texto + stepDetails)',()=>{
  for(const r of [ensalada,pollo]){assert.deepEqual(validateRecipe(structuredClone(r)),r);assert.ok(r.steps.every(s=>typeof s==='string'));}
  const desfasada=validateRecipe({...structuredClone(ensalada),stepDetails:[...ensalada.stepDetails,{heat:'extra'}]});
  assert.equal(desfasada.stepDetails.length,3,'un detalle sobrante sin paso se descarta');
});

// ---------- Presentación ----------
test('solo se muestra lo que la receta trae; nunca etiquetas de maqueta ni «Falta»',()=>{
  const m=cookingModel(ensalada),todo=limitationsHTML(m,h)+utensilsHTML(m,h)+prepHTML(m,h)+stepsHTML(m,h)+notesHTML(m,h)+[-1,0,1,2].map(i=>cookScreenHTML(m,i,h,'e')).join('');
  for(const palabra of ['Falta','De la receta','Por revisar','Fuego','Tiempo aproximado','Seguridad','información pendiente'])assert.equal(todo.includes(palabra),false,palabra);
  for(const palabra of ['Utensilios','Antes de empezar','Usas','Cómo comprobar','Notas','Cubos','trozos con forma de dado','0.3 kg'])assert.ok(todo.includes(palabra),palabra);
});

test('una receta con información pendiente la señala en la vista completa y en cada pantalla de cocina',()=>{
  const m=cookingModel(pollo);
  assert.match(limitationsHTML(m,h),/Esta receta tiene información pendiente/);assert.match(limitationsHTML(m,h),/No indica el nivel de fuego/);
  assert.match(cookScreenHTML(m,-1,h,'p'),/información pendiente/);                 // pantalla «Antes de empezar»
  for(const i of [0,1,2,3])assert.match(cookScreenHTML(m,i,h,'p'),/cook-warn/);     // aviso fijo en cada paso
  assert.match(stepExtrasHTML(m.steps[1],h),/class="step-safety"><strong>Seguridad:<\/strong> El pollo debe llegar a 74 °C/);
  assert.equal(stepExtrasHTML(m.steps[2],h).includes('Fuego'),false,'fuego no se muestra si no existe');
});

test('navegación del modo de cocina: progreso, primer y último paso',()=>{
  const m=cookingModel(ensalada);
  assert.equal(firstScreen(m),-1);
  const intro=cookScreenHTML(m,-1,h,'e');assert.match(intro,/Antes de empezar/);assert.match(intro,/Empezar →/);assert.match(intro,/cook-prev"[^>]*disabled/);
  const uno=cookScreenHTML(m,0,h,'e');assert.match(uno,/Paso 1 de 3/);assert.equal(/cook-prev"[^>]*disabled/.test(uno),false);assert.match(uno,/aria-valuenow="1"/);
  const ultimo=cookScreenHTML(m,2,h,'e');assert.match(ultimo,/Paso 3 de 3/);assert.match(ultimo,/Terminar ✓/);assert.match(ultimo,/aria-valuenow="3"/);
  const sinIntro=cookingModel(validateRecipe(exampleRecipes[1]));assert.match(cookScreenHTML(sinIntro,0,h,'x'),/cook-prev"[^>]*disabled/);
});

test('el texto de la receta se escapa (no se ejecuta HTML de un archivo importado)',()=>{
  const r=validateRecipe({title:'<b>x</b>',ingredients:[{name:'A',quantity:1,unit:'kg'}],steps:[{text:'<img src=x onerror=alert(1)>',check:'<script>1</script>',terms:[{term:'<i>t</i>',meaning:'"m"'}]}],utensils:['<u>olla</u>'],limitations:['<svg onload=1>']});
  const m=cookingModel(r),html=limitationsHTML(m,h)+utensilsHTML(m,h)+stepsHTML(m,h)+cookScreenHTML(m,0,h,'x"y');
  for(const peligroso of ['<img src=x','<script>','<svg onload','<u>olla','<i>t</i>','<b>x</b>'])assert.equal(html.includes(peligroso),false,peligroso);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;')&&html.includes('&lt;u&gt;olla&lt;/u&gt;'));
});

// ---------- Conservación al importar, guardar, repetir, respaldar y restaurar ----------
const conDetalles=r=>JSON.stringify(Object.fromEntries(DETALLES.map(k=>[k,r[k]])));
test('importar un menú con detalles, guardarlo, repetirlo, respaldar y restaurar conserva todo',()=>{
  const s=makeInitialState();ensurePlans(s,'2026-11-09');
  const pack=read('ejemplo-menu-detallado.json');
  importMenuPack(s,{...pack,recipes:parseRecipePack(pack),name:pack.name,startDate:'2026-11-16'});
  const importadas=s.recipes.filter(r=>r.id!=='ejemplo-pollo-calabacitas'&&r.id!=='ejemplo-atun-nopales'&&r.title.includes('ejemplo con'));
  assert.equal(importadas.length,2);
  const referencia=Object.fromEntries(importadas.map(r=>[r.title,conDetalles(r)]));
  saveMenuTemplate(s,'Guardado con detalles');
  const guardado=s.savedMenus[0];
  assert.deepEqual(guardado.recipes.map(r=>conDetalles(r)).sort(),Object.values(referencia).sort(),'el menú guardado conserva los detalles');
  repeatMenu(s,guardado.id,{name:'Repetido',startDate:'2026-11-23'});
  const copias=s.recipes.filter(r=>r.title.includes('ejemplo con'));
  assert.equal(copias.length,2,'repetir no duplica recetas iguales ni pierde detalles');
  for(const r of copias)assert.equal(conDetalles(r),referencia[r.title]);
  syncActivePlan(s);
  const back=validateBackup(decodeBackup(JSON.parse(encodeBackup(s))),'2026-11-10');
  for(const r of back.recipes.filter(r=>r.title.includes('ejemplo con')))assert.equal(conDetalles(r),referencia[r.title],'respaldo y restauración');
  assert.deepEqual(back.savedMenus[0].recipes.map(conDetalles).sort(),Object.values(referencia).sort());
  assert.equal(back.recipes.find(r=>r.title.includes('jitomate y aguacate')).image,importadas.find(r=>r.title.includes('jitomate y aguacate')).image,'la imagen se conserva');
});

test('importar no sobrescribe una receta personal con el mismo título',()=>{
  const propia=validateRecipe({title:ensalada.title,servings:4,ingredients:[{name:'Mi ingrediente',quantity:1,unit:'kg'}],steps:['Mi paso personal']});
  const antes=structuredClone(propia);
  const resultado=mergeRecipes([propia],[ensalada,pollo]);
  assert.deepEqual([resultado.count,resultado.skipped],[1,1]);
  assert.deepEqual(resultado.recipes[0],antes,'la receta personal queda intacta');
  assert.equal(resultado.recipes.find(r=>r.title===pollo.title).limitations.length,2);
  // Un menú con el mismo título pero otro contenido se agrega como copia aparte, sin tocar la propia.
  const s=makeInitialState();ensurePlans(s,'2026-11-09');s.recipes.push(propia);
  const pack=read('ejemplo-menu-detallado.json');
  importMenuPack(s,{...pack,recipes:parseRecipePack(pack),name:'x',startDate:'2026-11-16'});
  assert.deepEqual(s.recipes.find(r=>r.id===propia.id),antes);
  assert.equal(s.recipes.filter(r=>r.title===ensalada.title).length,2);
});

test('cerrar y reabrir (IndexedDB): los detalles siguen ahí',async()=>{
  globalThis.window={indexedDB};globalThis.indexedDB=indexedDB;
  globalThis.localStorage={getItem(){return null;},setItem(){throw Error('no debería usarse');}};
  const {loadState,persistState}=await import('../storage.mjs?cocina');
  const s=makeInitialState();s.recipes.push(ensalada,pollo);ensurePlans(s,'2026-11-09');
  await persistState(s);
  const abierta=await loadState();
  for(const r of [ensalada,pollo])assert.equal(conDetalles(abierta.recipes.find(x=>x.id===r.id)),conDetalles(r));
  assert.equal(abierta.recipes.find(x=>x.id===ensalada.id).image,ensalada.image);
});

// ---------- Revisar detalles al cambiar el texto de un paso ----------
test('se detectan solo los pasos con detalles cuyo texto cambió (misma cantidad de pasos)',()=>{
  const nuevo=pollo.steps.slice();
  assert.deepEqual(changedDetailSteps(pollo,nuevo),[],'sin cambios');
  nuevo[1]=nuevo[1].replace('un sartén','una sartén');
  assert.deepEqual(changedDetailSteps(pollo,nuevo),[1]);
  const espacios=pollo.steps.map(t=>`  ${t.replace(' ','   ')}  `);
  assert.deepEqual(changedDetailSteps(pollo,espacios),[],'cambiar solo espacios no cuenta');
  nuevo[3]='Sirve en tres platos.';nuevo[0]='Otro texto.';
  assert.deepEqual(changedDetailSteps(pollo,nuevo),[0,1,3]);
  assert.deepEqual(changedDetailSteps(pollo,[...pollo.steps,'Uno más']),[],'otra cantidad de pasos se trata aparte');
  const mixta=validateRecipe({title:'Mixta',ingredients:[{name:'A',quantity:1,unit:'kg'}],steps:[{text:'Con detalle',heat:'medio'},'Solo texto']});
  assert.deepEqual(changedDetailSteps(mixta,['Con detalle','Cambiado']),[],'un paso sin detalles no pide revisión');
  assert.deepEqual(changedDetailSteps(mixta,['Cambiado','Solo texto']),[0]);
  assert.deepEqual(changedDetailSteps(validateRecipe(exampleRecipes[0]),['a','b','c','d']),[],'receta antigua: nada que revisar');
});

test('la pantalla de revisión muestra el texto anterior, el nuevo y los detalles, sin elegir nada por la persona',()=>{
  const nuevo=pollo.steps.slice();nuevo[1]='Calienta el aceite en una sartén. Cocina el pollo.';
  const html=detailReviewHTML(cookingModel(pollo),[1],nuevo,h);
  assert.match(html,/Texto anterior/);assert.match(html,/hasta alcanzar 74 °C en su centro/);assert.match(html,/<strong>Calienta el aceite en una sartén\. Cocina el pollo\.<\/strong>/);
  assert.match(html,/Seguridad:<\/strong> El pollo debe llegar a 74 °C/);assert.match(html,/15 ml/);
  assert.equal((html.match(/type="radio"/g)||[]).length,2);assert.equal(/checked/.test(html),false,'ninguna opción viene marcada');
  assert.match(html,/Los detalles siguen correspondiendo/);assert.match(html,/Quitar los detalles de este paso/);assert.match(html,/Volver a editar/);
});
