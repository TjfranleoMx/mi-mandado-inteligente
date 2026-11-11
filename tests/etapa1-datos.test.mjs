import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {indexedDB} from 'fake-indexeddb';
import {CATEGORIES,SECTIONS,SECTION_IDS,DATA_REVISION,makeInitialState,sectionFor,generateShoppingList,validateBackup,spendingSummary,finalizePurchase} from '../core.mjs';
import {encodeBackup,decodeBackup} from '../backup.mjs';
import {ensurePlans,createPlan,activatePlan,syncActivePlan} from '../menus.mjs';

const fixtureUrl=new URL('./fixtures/respaldo-v04-ficticio.json',import.meta.url);
// Respaldo REAL de v0.4 (generado con el código original, datos ficticios): no trae campos nuevos.
const v04=()=>JSON.parse(fs.readFileSync(fixtureUrl,'utf8'));
const restoredV04=()=>validateBackup(decodeBackup(v04()),'2026-11-10');
const strip=value=>JSON.parse(JSON.stringify(value,(k,v)=>['id','section'].includes(k)?undefined:v));

test('el respaldo de v0.4 es realmente anterior: no trae campos nuevos',()=>{
  const raw=v04();
  for(const k of ['habituales','sectionOverrides','prefs','dataRevision'])assert.equal(raw[k],undefined);
  assert.ok(raw.shopping.every(i=>i.section===undefined));
});

test('actualizar desde v0.4 conserva todos los datos y añade los campos nuevos vacíos',()=>{
  const raw=decodeBackup(v04()),now=validateBackup(raw,'2026-11-10');
  assert.equal(now.schemaVersion,1);
  assert.equal(now.dataRevision,DATA_REVISION);
  assert.deepEqual(now.habituales,[]);
  assert.deepEqual(now.sectionOverrides,{});
  assert.deepEqual(now.prefs,{groupBySection:true,superMode:false,purchasedFolded:true});
  assert.equal(now.theme,'dark');assert.equal(now.budgetWeekly,850);assert.equal(now.defaultStore,'Tienda ficticia');
  assert.deepEqual(now.selected,raw.selected);
  assert.deepEqual(now.pantry,raw.pantry);
  assert.deepEqual(now.menuPurchaseIds,raw.menuPurchaseIds);
  assert.deepEqual(now.purchases,raw.purchases);
  assert.equal(now.plans.length,1);assert.equal(now.savedMenus.length,1);
  assert.equal(now.recipes.find(r=>r.id==='receta-propia').image,raw.recipes.find(r=>r.id==='receta-propia').image,'la foto propia se conserva');
  // Lista: mismas cantidades, mismos precios, misma marca de comprado; solo se añade la sección.
  assert.deepEqual(strip(now.shopping),strip(raw.shopping.map(i=>({...i,recipeIds:i.recipeIds}))));
  assert.ok(now.shopping.every(i=>SECTION_IDS.includes(i.section)));
  assert.deepEqual(now.plans[0].shopping.map(i=>i.section),now.shopping.map(i=>i.section));
});

test('las secciones se calculan para productos antiguos y no tocan las categorías de gasto',()=>{
  const now=restoredV04(),by=Object.fromEntries(now.shopping.map(i=>[i.name,i]));
  assert.equal(by['Atún en agua'].section,'abarrotes');
  assert.equal(by['Atún en agua'].category,'Proteínas','la categoría de gasto no cambia');
  assert.equal(by['Huevo'].section,'lacteos-huevos');
  assert.equal(by['Tortillas de maíz'].section,'pan-tortillas');
  assert.equal(by['Calabacita'].section,'frutas-verduras');
  assert.equal(by['Detergente ficticio'].section,'limpieza');
  assert.deepEqual(Object.keys(spendingSummary(now.purchases,'2026-11')).sort(),['categories','count','total']);
  assert.deepEqual(Object.keys(spendingSummary(now.purchases,'2026-11').categories),CATEGORIES);
  assert.equal(SECTIONS.length,8);
  assert.deepEqual(SECTIONS.map(s=>s.label),['Frutas y verduras','Carnes y pescados','Lácteos y huevos','Pan y tortillas','Abarrotes y enlatados','Limpieza','Higiene','Otros']);
});

test('validar dos veces da el mismo resultado (no se acumulan cambios)',()=>{
  const once=restoredV04(),twice=validateBackup(structuredClone(once),'2026-11-10');
  assert.deepEqual(twice,once);
});

test('sectionFor: corrección del usuario > palabras clave > categoría',()=>{
  assert.equal(sectionFor('Pechuga de pollo','Proteínas'),'carnes-pescados');
  assert.equal(sectionFor('Sardinas en lata','Proteínas'),'abarrotes');
  assert.equal(sectionFor('HUEVO','Proteínas'),'lacteos-huevos');
  assert.equal(sectionFor('Bolillo','Despensa'),'pan-tortillas');
  assert.equal(sectionFor('Pan molido','Despensa'),'pan-tortillas');
  assert.equal(sectionFor('Sartén antiadherente','Otros'),'otros','no confunde «sartén» con «pan»');
  assert.equal(sectionFor('Pasta dental','Higiene'),'higiene');
  assert.equal(sectionFor('Atún en agua','Proteínas',{'atun en agua':'carnes-pescados'}),'carnes-pescados');
  assert.equal(sectionFor('Atún en agua','Proteínas',{'atun en agua':'inventada'}),'abarrotes','una sección inválida se ignora');
  assert.equal(sectionFor('Algo','Categoría rara'),'otros');
});

test('el cálculo de compras y despensa no cambia y asigna la sección',()=>{
  const now=restoredV04();
  const regenerated=generateShoppingList(now.recipes,now.selected,now.shopping,now.purchases.filter(p=>now.menuPurchaseIds.includes(p.id)),now.pantry,now.sectionOverrides);
  // Pechuga ya comprada: no reaparece. Cebolla: 0.3 kg - 100 g de casa ya estaba descontado al generar.
  assert.equal(regenerated.find(i=>i.name==='Pechuga de pollo'),undefined);
  assert.equal(regenerated.find(i=>i.name==='Cebolla').plannedQty,0.3);
  assert.equal(regenerated.find(i=>i.name==='Detergente ficticio').source,'manual','el artículo manual se conserva');
  assert.equal(regenerated.filter(i=>i.name==='Jitomate').length,1,'ingredientes compatibles se suman en un renglón');
  assert.equal(regenerated.find(i=>i.name==='Jitomate').plannedQty,1.2);
  assert.ok(regenerated.every(i=>SECTION_IDS.includes(i.section)));
  // Regenerar dos veces no duplica descuentos.
  const again=generateShoppingList(now.recipes,now.selected,regenerated,now.purchases.filter(p=>now.menuPurchaseIds.includes(p.id)),now.pantry,now.sectionOverrides);
  assert.deepEqual(strip(again),strip(regenerated));
  // Una corrección de sección guardada se aplica al regenerar.
  const moved=generateShoppingList(now.recipes,now.selected,[],[],[],{'atun en agua':'carnes-pescados'});
  assert.equal(moved.find(i=>i.name==='Atún en agua').section,'carnes-pescados');
});

test('compatibilidad con la versión anterior del cálculo (comparación con el código v0.4 original)',async t=>{
  const original=new URL('../../app/core.mjs',import.meta.url);
  if(!fs.existsSync(original))return t.skip('no está la carpeta app/ original junto a esta copia');
  const old=await import(original.href);
  const now=restoredV04();
  const args=[now.recipes,now.selected,[],now.purchases,now.pantry];
  assert.deepEqual(strip(generateShoppingList(...args)),strip(old.generateShoppingList(...args)));
  // Un respaldo NUEVO (con habituales) sigue siendo aceptado por el validador antiguo.
  const nuevo=encodeBackup({...now,habituales:[{id:'h1',name:'Leche',quantity:2,unit:'l',category:'Lácteos',section:'lacteos-huevos'}],sectionOverrides:{leche:'lacteos-huevos'}});
  const abierto=old.validateBackup(decodeBackup(JSON.parse(nuevo)),'2026-11-10');
  assert.equal(abierto.purchases.length,now.purchases.length);
  assert.equal(abierto.shopping.length,now.shopping.length);
});

const habitual={id:'h-leche',name:'Leche entera',quantity:2,unit:'l',category:'Lácteos',section:'lacteos-huevos'};
function newState(){
  const s=restoredV04();
  s.habituales=[habitual,{id:'h-jabon',name:'Jabón de trastes',quantity:1,unit:'pza',category:'Limpieza',section:'limpieza'}];
  s.sectionOverrides={'atun en agua':'carnes-pescados'};
  s.prefs={groupBySection:true,superMode:true,purchasedFolded:false};
  s.shopping.push({id:'desde-habitual',name:'Leche entera',category:'Lácteos',section:'lacteos-huevos',unit:'l',plannedQty:2,actualQty:'',unitPrice:'',totalPaid:'',priceMode:'unit',checked:false,store:'',source:'manual',recipeIds:[],habitualId:'h-leche'});
  syncActivePlan(s);
  return s;
}

test('exportar y restaurar conserva habituales, secciones, preferencias y fotos',()=>{
  const s=newState();
  const file=JSON.parse(encodeBackup(s));
  assert.ok(file.habituales&&file.sectionOverrides&&file.prefs&&file.dataRevision===DATA_REVISION);
  const back=validateBackup(decodeBackup(JSON.parse(JSON.stringify(file))),'2026-11-10');
  assert.deepEqual(back.habituales,s.habituales);
  assert.deepEqual(back.sectionOverrides,s.sectionOverrides);
  assert.deepEqual(back.prefs,s.prefs);
  assert.equal(back.shopping.find(i=>i.id==='desde-habitual').habitualId,'h-leche');
  assert.equal(back.plans[0].shopping.find(i=>i.id==='desde-habitual').habitualId,'h-leche');
  assert.equal(back.recipes.find(r=>r.id==='receta-propia').image,s.recipes.find(r=>r.id==='receta-propia').image);
  assert.deepEqual(back,validateBackup(structuredClone(back),'2026-11-10'));
});

test('el artículo que vino de un habitual sobrevive a regenerar la lista',()=>{
  const s=newState();
  const regenerated=generateShoppingList(s.recipes,s.selected,s.shopping,[],[],s.sectionOverrides);
  const kept=regenerated.find(i=>i.id==='desde-habitual');
  assert.equal(kept.habitualId,'h-leche');assert.equal(kept.source,'manual');
});

test('los habituales son globales; cada semana sigue teniendo su propia lista',()=>{
  const s=newState();
  createPlan(s,{name:'Semana siguiente',startDate:'2026-11-16',days:[]});
  assert.equal(s.habituales.length,2,'los habituales no se pierden al crear semana');
  assert.equal(s.shopping.length,0,'la semana nueva empieza sin productos');
  assert.equal(s.plans.every(p=>p.habituales===undefined),true,'no se copian dentro de cada semana');
  const first=s.plans[0].id;activatePlan(s,first);
  assert.ok(s.shopping.some(i=>i.id==='desde-habitual'),'la semana anterior conserva lo suyo');
  const back=validateBackup(decodeBackup(JSON.parse(encodeBackup(s))),'2026-11-10');
  assert.equal(back.plans.length,2);assert.equal(back.habituales.length,2);
});

test('datos nuevos inválidos se rechazan o se limpian con seguridad',()=>{
  const base=()=>decodeBackup(v04());
  const bad=extra=>()=>validateBackup({...base(),...extra},'2026-11-10');
  assert.throws(bad({habituales:'no es lista'}),/habituales/i);
  assert.throws(bad({habituales:[{name:'X',quantity:1,unit:'galón'}]}),/habitual/i);
  assert.throws(bad({habituales:[{name:'X',quantity:-3,unit:'kg'}]}),/habitual/i);
  assert.throws(bad({habituales:[{name:'',quantity:1,unit:'kg'}]}),/habitual/i);
  assert.throws(bad({habituales:Array.from({length:501},(_,i)=>({name:`P${i}`,quantity:1,unit:'pza'}))}),/500/);
  assert.throws(bad({sectionOverrides:[1,2]}),/secciones/i);
  assert.throws(bad({prefs:'x'}),/preferencias/i);
  const ok=validateBackup({...base(),habituales:[{id:'a',name:'Pan',quantity:'1,5',unit:'kg',category:'Inventada',section:'inventada'},{id:'a',name:'Leche',quantity:1,unit:'l',category:'Lácteos'}],
    sectionOverrides:{Atún:'carnes-pescados',malo:'zzz','__proto__':'otros'},prefs:{superMode:'sí',groupBySection:false,extra:1}},'2026-11-10');
  assert.equal(ok.habituales[0].quantity,1.5);assert.equal(ok.habituales[0].category,'Otros');assert.equal(ok.habituales[0].section,'pan-tortillas','sección inválida: se recalcula por nombre («Pan»)');
  assert.notEqual(ok.habituales[0].id,ok.habituales[1].id,'los ids repetidos se corrigen');
  assert.deepEqual(ok.sectionOverrides,{atun:'carnes-pescados'});
  assert.deepEqual(ok.prefs,{groupBySection:false,superMode:false,purchasedFolded:true});
  assert.equal(Object.getPrototypeOf(ok.sectionOverrides),Object.prototype,'no se contamina el prototipo');
  assert.equal(ok.habituales[0].section,sectionFor('Pan','Otros'));
});

test('registrar una compra no cambia por los campos nuevos',()=>{
  const s=newState();
  const item=s.shopping.find(i=>i.name==='Nopales');item.checked=true;item.actualQty=0.5;item.totalPaid=20;item.priceMode='total';
  const {purchase,total}=finalizePurchase(s,'2026-11-10','Tienda ficticia');
  assert.equal(total,20);assert.equal(purchase.items[0].category,'Verduras y frutas');
  assert.equal(purchase.items[0].section,undefined,'el historial de gastos sigue usando solo categorías');
});

test('cerrar y reabrir (IndexedDB): actualizar desde v0.4 y guardar datos nuevos',async()=>{
  globalThis.window={indexedDB};globalThis.indexedDB=indexedDB;
  globalThis.localStorage={getItem(){return null;},setItem(){throw Error('no debería usarse');}};
  const {loadState,persistState}=await import('../storage.mjs?indexeddb');
  await persistState(decodeBackup(v04()));            // lo que dejó v0.4 en el teléfono
  const abierta=await loadState();                    // primera apertura con la versión nueva
  assert.equal(abierta.habituales.length,0);assert.equal(abierta.theme,'dark');assert.equal(abierta.purchases.length,1);
  assert.ok(abierta.shopping.every(i=>SECTION_IDS.includes(i.section)));
  abierta.habituales=[habitual];abierta.sectionOverrides={'atun en agua':'carnes-pescados'};abierta.prefs.superMode=true;
  await persistState(abierta);
  const reabierta=await loadState();                  // cerrar y reabrir
  assert.deepEqual(reabierta.habituales,[habitual]);
  assert.deepEqual(reabierta.sectionOverrides,{'atun en agua':'carnes-pescados'});
  assert.equal(reabierta.prefs.superMode,true);
  assert.equal(reabierta.recipes.find(r=>r.id==='receta-propia').image.startsWith('data:image/png'),true);
  assert.deepEqual(reabierta.purchases,abierta.purchases);
});

test('cerrar y reabrir con la alternativa localStorage',async()=>{
  const store=new Map();
  globalThis.window={};                                // sin IndexedDB: se usa la alternativa
  globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))};
  const {loadState,persistState,storageMode}=await import('../storage.mjs?localstorage');
  store.set('mi-mandado-respaldo',JSON.stringify(decodeBackup(v04())));  // dejado por v0.4
  const abierta=await loadState();
  assert.equal(abierta.dataRevision,DATA_REVISION);assert.deepEqual(abierta.habituales,[]);
  abierta.habituales=[habitual];await persistState(abierta);
  assert.equal(store.get('mi-mandado-storage-fallback-active'),'1');
  assert.deepEqual((await loadState()).habituales,[habitual]);
});

test('estado inicial nuevo incluye los campos y es válido',()=>{
  const s=makeInitialState();
  assert.deepEqual(s.habituales,[]);assert.deepEqual(s.sectionOverrides,{});assert.equal(s.dataRevision,DATA_REVISION);
  ensurePlans(s);
  const back=validateBackup(JSON.parse(JSON.stringify(s)),'2026-11-10');
  assert.deepEqual(back.prefs,s.prefs);
});
