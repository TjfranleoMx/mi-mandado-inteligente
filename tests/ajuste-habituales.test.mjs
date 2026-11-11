import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {makeInitialState,generateShoppingList,validateBackup,finalizePurchase} from '../core.mjs';
import {encodeBackup,decodeBackup} from '../backup.mjs';
import {ensurePlans,updatePlan,syncActivePlan} from '../menus.mjs';
import {applyHabitualPicks,upsertHabitual,regenerateShopping,findConflict} from '../habituales.mjs';

const POLLO='ejemplo-pollo-calabacitas',ATUN='ejemplo-atun-nopales';
function base(days=[POLLO,ATUN,'','','','','']){
  const s=makeInitialState();ensurePlans(s,'2026-11-09');
  updatePlan(s,{name:'Semana ficticia',startDate:'2026-11-09',days});
  regenerateShopping(s);
  return s;
}
const quitarAtun=s=>{updatePlan(s,{name:'Semana ficticia',startDate:'2026-11-09',days:[POLLO,'','','','','','']});};
const row=(s,name)=>s.shopping.filter(i=>i.name===name);
const sumar=(s,input,quantity)=>{
  const h=upsertHabitual(s,input).habitual;
  applyHabitualPicks(s,[{habitual:h,choice:'sum',quantity}],generateShoppingList(s.recipes,s.selected,s.shopping,[],s.pantry||[],s.sectionOverrides,s.habitualSums));
  regenerateShopping(s);return h;
};
const NOPALES={name:'Nopales',quantity:0.3,unit:'kg',category:'Verduras y frutas'};

// ---------- 1. Cantidad distinta para esta semana ----------
test('cantidad de esta semana al SUMAR: no cambia el habitual guardado',()=>{
  const s=base();
  const h=sumar(s,{name:'Jitomate',quantity:1,unit:'kg',category:'Verduras y frutas'},0.2);
  assert.equal(s.habituales[0].quantity,1,'el habitual sigue en 1 kg');
  assert.equal(h.quantity,1);
  assert.equal(s.habitualSums[0].quantity,0.2);
  assert.equal(row(s,'Jitomate')[0].plannedQty,0.85,'0,65 del menú + 0,2');
});

test('cantidad de esta semana en un renglón nuevo o «dos renglones»: el habitual no cambia',()=>{
  const s=base();
  const leche=upsertHabitual(s,{name:'Leche entera',quantity:2,unit:'l',category:'Lácteos'}).habitual;
  applyHabitualPicks(s,[{habitual:leche,choice:'',quantity:3}],s.shopping);
  assert.equal(row(s,'Leche entera')[0].plannedQty,3);
  assert.equal(s.habituales[0].quantity,2);
  const jit=upsertHabitual(s,{name:'Jitomate',quantity:1,unit:'kg',category:'Verduras y frutas'}).habitual;
  applyHabitualPicks(s,[{habitual:jit,choice:'two',quantity:0.25}],s.shopping);
  assert.equal(row(s,'Jitomate').find(i=>i.source==='manual').plannedQty,0.25);
  assert.equal(s.habituales.find(h=>h.name==='Jitomate').quantity,1);
});

test('sin cantidad indicada se usa la habitual; una cantidad inválida no cambia nada',()=>{
  const s=base();
  const leche=upsertHabitual(s,{name:'Leche entera',quantity:2,unit:'l',category:'Lácteos'}).habitual;
  const copia=JSON.stringify(s);
  for(const quantity of [0,-1,NaN,'abc',''])assert.throws(()=>applyHabitualPicks(s,[{habitual:leche,choice:'',quantity}],s.shopping),/cantidad/i);
  assert.equal(JSON.stringify(s),copia);
  applyHabitualPicks(s,[{habitual:leche,choice:''}],s.shopping);
  assert.equal(row(s,'Leche entera')[0].plannedQty,2);
});

test('la cantidad de la semana sobrevive a regenerar, a una compra parcial y a un respaldo',()=>{
  const s=base();
  sumar(s,{name:'Jitomate',quantity:1,unit:'kg',category:'Verduras y frutas'},0.2);
  regenerateShopping(s);regenerateShopping(s);
  assert.equal(row(s,'Jitomate')[0].plannedQty,0.85,'regenerar no la duplica ni la pierde');
  const item=row(s,'Jitomate')[0];item.checked=true;item.actualQty=0.5;item.totalPaid=15;item.priceMode='total';
  const {purchase}=finalizePurchase(s,'2026-11-07','Tienda ficticia');
  s.purchases.push(purchase);s.menuPurchaseIds.push(purchase.id);
  s.shopping=s.shopping.filter(i=>!i.checked).concat([{...item,plannedQty:0.35,actualQty:'',totalPaid:'',unitPrice:'',checked:false,priceMode:'unit'}]);
  regenerateShopping(s);
  assert.equal(row(s,'Jitomate')[0].plannedQty,0.35,'0,85 - 0,5 comprados');
  syncActivePlan(s);
  const back=validateBackup(decodeBackup(JSON.parse(encodeBackup(s))),'2026-11-10');
  assert.equal(back.habitualSums[0].quantity,0.2);assert.equal(back.habituales[0].quantity,1);
});

// ---------- 2. Quitar del menú lo que tenía una cantidad sumada ----------
test('quitar la receta conserva la cantidad extra como artículo propio, una sola vez, y avisa',()=>{
  const s=base();
  sumar(s,NOPALES,undefined);
  assert.equal(row(s,'Nopales')[0].plannedQty,0.8,'0,5 del menú + 0,3');
  quitarAtun(s);
  const orphans=regenerateShopping(s);
  assert.deepEqual(orphans.map(o=>[o.name,o.kept,o.remaining]),[['Nopales',true,0.3]]);
  const nopales=row(s,'Nopales');
  assert.equal(nopales.length,1);
  assert.deepEqual([nopales[0].source,nopales[0].plannedQty,nopales[0].section],['manual',0.3,'frutas-verduras']);
  assert.ok(nopales[0].habitualId);assert.deepEqual(s.habitualSums,[],'la suma quedó consumida');
  // Regenerar otra vez no lo duplica ni lo vuelve a avisar.
  assert.deepEqual(regenerateShopping(s),[]);regenerateShopping(s);
  assert.equal(row(s,'Nopales').length,1);assert.equal(row(s,'Nopales')[0].plannedQty,0.3);
});

test('si la receta vuelve, el extra independiente no se cuenta doble',()=>{
  const s=base();
  sumar(s,NOPALES,undefined);quitarAtun(s);regenerateShopping(s);
  updatePlan(s,{name:'Semana ficticia',startDate:'2026-11-09',days:[POLLO,ATUN,'','','','','']});
  regenerateShopping(s);
  const rows=row(s,'Nopales');
  assert.deepEqual(rows.map(i=>[i.source,i.plannedQty]).sort(),[['manual',0.3],['recipe',0.5]]);
});

test('si el ingrediente sigue en otra receta, la suma se queda donde estaba y no hay aviso',()=>{
  const s=base();
  sumar(s,{name:'Jitomate',quantity:0.4,unit:'kg',category:'Verduras y frutas'},undefined);
  quitarAtun(s);                       // el jitomate sigue en el pollo
  assert.deepEqual(regenerateShopping(s),[]);
  assert.equal(s.habitualSums.length,1);
  assert.equal(row(s,'Jitomate')[0].plannedQty,0.75,'0,35 del pollo + 0,4');
  assert.equal(row(s,'Jitomate')[0].source,'recipe');
});

test('quitar todo el menú también conserva lo sumado',()=>{
  const s=base([ATUN,'','','','','','']);
  sumar(s,NOPALES,undefined);
  updatePlan(s,{name:'Semana ficticia',startDate:'2026-11-09',days:[]});
  assert.equal(s.selected.length,0);
  const orphans=regenerateShopping(s);
  assert.equal(orphans[0].kept,true);assert.equal(row(s,'Nopales')[0].plannedQty,0.3);
});

test('compras parciales: lo ya comprado o en casa se descuenta del extra y se avisa si queda cubierto',()=>{
  // Comprado 0,1 kg de los 0,8: al quitar el menú quedan 0,2 kg del extra.
  let s=base();sumar(s,NOPALES,undefined);
  let item=row(s,'Nopales')[0];item.checked=true;item.actualQty=0.1;item.totalPaid=4;item.priceMode='total';
  let {purchase}=finalizePurchase(s,'2026-11-07','Tienda ficticia');
  s.purchases.push(purchase);s.menuPurchaseIds.push(purchase.id);
  s.shopping=s.shopping.filter(i=>!i.checked);regenerateShopping(s);
  assert.equal(row(s,'Nopales')[0].plannedQty,0.7);
  quitarAtun(s);
  let orphans=regenerateShopping(s);
  assert.deepEqual([orphans[0].kept,orphans[0].remaining],[true,0.2]);
  assert.equal(row(s,'Nopales')[0].plannedQty,0.2);
  // Comprado 0,5 kg (más que el extra): queda cubierto, no se agrega, pero se informa.
  s=base();sumar(s,NOPALES,undefined);
  item=row(s,'Nopales')[0];item.checked=true;item.actualQty=0.5;item.totalPaid=20;item.priceMode='total';
  ({purchase}=finalizePurchase(s,'2026-11-07','Tienda ficticia'));
  s.purchases.push(purchase);s.menuPurchaseIds.push(purchase.id);
  s.shopping=s.shopping.filter(i=>!i.checked);
  quitarAtun(s);
  orphans=regenerateShopping(s);
  assert.deepEqual([orphans[0].kept,orphans[0].quantity],[false,0.3]);
  assert.equal(row(s,'Nopales').length,0);assert.deepEqual(s.habitualSums,[]);
  // Con 100 g en casa: quedan 0,2 kg.
  s=base();sumar(s,NOPALES,undefined);s.pantry=[{name:'Nopales',quantity:100,unit:'g',category:'Verduras y frutas'}];
  quitarAtun(s);orphans=regenerateShopping(s);
  assert.equal(row(s,'Nopales')[0].plannedQty,0.2);
});

test('un artículo ya conservado se detecta como coincidencia y no se duplica en silencio',()=>{
  const s=base();
  const h=sumar(s,NOPALES,undefined);quitarAtun(s);regenerateShopping(s);
  assert.ok(findConflict(s.shopping,h),'ahora es un renglón manual que coincide');
  assert.throws(()=>applyHabitualPicks(s,[{habitual:h,choice:''}],s.shopping),/ya está en tu lista/);
});

test('cerrar y reabrir: lo conservado y la cantidad de la semana siguen ahí',async()=>{
  globalThis.window={indexedDB};globalThis.indexedDB=indexedDB;
  globalThis.localStorage={getItem(){return null;},setItem(){throw Error('no debería usarse');}};
  const {loadState,persistState}=await import('../storage.mjs?ajuste');
  const s=base();
  sumar(s,NOPALES,0.25);
  sumar(s,{name:'Jitomate',quantity:1,unit:'kg',category:'Verduras y frutas'},0.2);
  syncActivePlan(s);await persistState(s);
  let abierta=await loadState();
  assert.deepEqual(abierta.habitualSums.map(x=>[x.name,x.quantity]),[['Nopales',0.25],['Jitomate',0.2]]);
  assert.deepEqual(abierta.habituales.map(h=>[h.name,h.quantity]),[['Nopales',0.3],['Jitomate',1]],'los habituales guardados no cambiaron');
  quitarAtun(abierta);
  const orphans=regenerateShopping(abierta);
  assert.deepEqual(orphans.map(o=>o.name),['Nopales']);
  syncActivePlan(abierta);await persistState(abierta);
  abierta=await loadState();                                   // otra vez cerrar y reabrir
  assert.deepEqual(abierta.habitualSums.map(x=>x.name),['Jitomate'],'solo queda la suma que sigue aplicando');
  assert.equal(abierta.shopping.filter(i=>i.name==='Nopales').length,1);
  assert.equal(abierta.shopping.find(i=>i.name==='Nopales').plannedQty,0.25);
  assert.equal(abierta.shopping.find(i=>i.name==='Nopales').habitualId,abierta.habituales[0].id);
  assert.deepEqual(regenerateShopping(abierta),[],'regenerar tras reabrir no duplica ni vuelve a avisar');
  assert.equal(abierta.shopping.filter(i=>i.name==='Nopales').length,1);
});
