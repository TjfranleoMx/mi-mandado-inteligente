import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {makeInitialState,generateShoppingList,safeHabituales,finalizePurchase,convert,validateBackup} from '../core.mjs';
import {encodeBackup,decodeBackup} from '../backup.mjs';
import {ensurePlans,updatePlan,syncActivePlan} from '../menus.mjs';
import {applyHabitualPicks,regenerateShopping} from '../habituales.mjs';

const POLLO='ejemplo-pollo-calabacitas',ATUN='ejemplo-atun-nopales';
const days=list=>({name:'Semana ficticia',startDate:'2026-11-09',days:list});
// Dos habituales del MISMO producto (se pueden crear desde «Editar mis habituales»), con unidades compatibles: 0,3 kg y 200 g.
function escenario({pantryG=0,compradoKg=0}={}){
  const s=makeInitialState();ensurePlans(s,'2026-11-09');
  updatePlan(s,days([POLLO,ATUN,'','','','','']));regenerateShopping(s);
  s.habituales=safeHabituales([
    {id:'h-a',name:'Nopales',quantity:0.3,unit:'kg',category:'Verduras y frutas'},
    {id:'h-b',name:'Nopales',quantity:200,unit:'g',category:'Verduras y frutas'}]);
  applyHabitualPicks(s,s.habituales.map(habitual=>({habitual,choice:'sum'})),s.shopping);
  regenerateShopping(s);
  assert.equal(s.shopping.find(i=>i.name==='Nopales').plannedQty,1,'0,5 menú + 0,3 + 0,2');
  if(compradoKg){
    const item=s.shopping.find(i=>i.name==='Nopales');item.checked=true;item.actualQty=compradoKg;item.totalPaid=10;item.priceMode='total';
    const {purchase}=finalizePurchase(s,'2026-11-07','Tienda ficticia');
    s.purchases.push(purchase);s.menuPurchaseIds.push(purchase.id);
    s.shopping=s.shopping.filter(i=>!i.checked);
  }
  if(pantryG)s.pantry=[{name:'Nopales',quantity:pantryG,unit:'g',category:'Verduras y frutas'}];
  s.selected=[];updatePlan(s,days([POLLO,'','','','','','']));   // se quita la ensalada
  return s;
}
const gramos=s=>s.shopping.filter(i=>i.name==='Nopales').reduce((t,i)=>t+convert(Number(i.plannedQty),i.unit,'g'),0);
const filas=s=>s.shopping.filter(i=>i.name==='Nopales');

test('una cantidad en casa se reparte entre los dos extras: no se descuenta dos veces',()=>{
  const s=escenario({pantryG:100});
  const orphans=regenerateShopping(s);
  assert.equal(orphans.length,2);
  assert.equal(gramos(s),400,'500 g solicitados - 100 g disponibles');
  assert.equal(filas(s).length,2,'siguen siendo dos artículos independientes');
});

test('una compra parcial se reparte sin exceder lo comprado',()=>{
  const s=escenario({compradoKg:0.4});
  const orphans=regenerateShopping(s);
  assert.equal(gramos(s),100,'500 g solicitados en extras - 400 g comprados');
  assert.deepEqual(orphans.map(o=>o.kept),[false,true],'el primero queda cubierto y el segundo conserva lo que falta');
});

test('compra mayor que lo solicitado: se cubre todo y no sobra descuento',()=>{
  const s=escenario({compradoKg:0.9});
  regenerateShopping(s);
  assert.equal(gramos(s),0,'lo comprado cubre los 500 g de extras');
});

test('compra y casa juntas, con unidades compatibles, se reparten una sola vez',()=>{
  const s=escenario({compradoKg:0.1,pantryG:150});   // disponible total: 100 g + 150 g
  regenerateShopping(s);
  assert.equal(gramos(s),250,'500 g - 250 g disponibles');
});

test('nunca se descuenta más de lo disponible ni se pierde lo solicitado',()=>{
  for(const [compradoKg,pantryG] of [[0,50],[0,100],[0,299],[0,300],[0,301],[0,499],[0,500],[0,700],[0.2,0],[0.3,100],[0.5,0],[0.1,400]]){
    const s=escenario({compradoKg,pantryG});regenerateShopping(s);
    const disponible=compradoKg*1000+pantryG;
    assert.equal(gramos(s),Math.max(0,500-disponible),`compra ${compradoKg} kg + casa ${pantryG} g`);
  }
});

test('regenerar de nuevo no vuelve a descontar ni a avisar',()=>{
  const s=escenario({pantryG:100,compradoKg:0.1});
  regenerateShopping(s);const despues=gramos(s);
  assert.equal(despues,300);
  for(let i=0;i<3;i++)assert.deepEqual(regenerateShopping(s),[]);
  assert.equal(gramos(s),300);assert.equal(filas(s).length,2);
  assert.deepEqual(s.habitualSums,[]);
});

test('cerrar y reabrir conserva el reparto y no lo descuenta otra vez',async()=>{
  globalThis.window={indexedDB};globalThis.indexedDB=indexedDB;
  globalThis.localStorage={getItem(){return null;},setItem(){throw Error('no debería usarse');}};
  const {loadState,persistState}=await import('../storage.mjs?descuento');
  const s=escenario({pantryG:100,compradoKg:0.1});
  regenerateShopping(s);syncActivePlan(s);await persistState(s);
  let abierta=await loadState();
  assert.equal(gramos(abierta),300);
  assert.deepEqual(regenerateShopping(abierta),[]);assert.equal(gramos(abierta),300);
  syncActivePlan(abierta);await persistState(abierta);
  abierta=await loadState();
  assert.equal(gramos(abierta),300);assert.equal(filas(abierta).length,2);
  const respaldo=validateBackup(decodeBackup(JSON.parse(encodeBackup(abierta))),'2026-11-10');
  assert.equal(gramos(respaldo),300);
});

test('con un solo extra el resultado es el de siempre',()=>{
  const s=makeInitialState();ensurePlans(s,'2026-11-09');
  updatePlan(s,days([POLLO,ATUN,'','','','','']));regenerateShopping(s);
  s.habituales=safeHabituales([{id:'h-a',name:'Nopales',quantity:0.3,unit:'kg',category:'Verduras y frutas'}]);
  applyHabitualPicks(s,[{habitual:s.habituales[0],choice:'sum'}],s.shopping);regenerateShopping(s);
  s.pantry=[{name:'Nopales',quantity:100,unit:'g',category:'Verduras y frutas'}];
  updatePlan(s,days([POLLO,'','','','','','']));regenerateShopping(s);
  assert.equal(gramos(s),200);
});

function sinReceta(habituales,pantry,unidadBase){
  const s=makeInitialState();ensurePlans(s,'2026-11-09');
  updatePlan(s,days([ATUN,'','','','','','']));regenerateShopping(s);
  s.habituales=safeHabituales(habituales);
  s.shopping=s.shopping.filter(i=>false);
  s.habitualSums=s.habituales.map(h=>({habitualId:h.id,name:h.name,quantity:h.quantity,unit:h.unit,category:h.category}));
  s.pantry=pantry;
  return s;
}
test('volumen (l y ml) y piezas también se reparten una sola vez',()=>{
  let s=sinReceta([{id:'a',name:'Leche entera',quantity:1,unit:'l',category:'Lácteos'},{id:'b',name:'Leche entera',quantity:500,unit:'ml',category:'Lácteos'}],[{name:'Leche entera',quantity:600,unit:'ml',category:'Lácteos'}]);
  regenerateShopping(s);
  assert.equal(s.shopping.filter(i=>i.name==='Leche entera').reduce((t,i)=>t+convert(Number(i.plannedQty),i.unit,'ml'),0),900,'1 500 ml - 600 ml');
  s=sinReceta([{id:'a',name:'Manzana',quantity:2,unit:'pza',category:'Verduras y frutas'},{id:'b',name:'Manzana',quantity:3,unit:'pza',category:'Verduras y frutas'}],[{name:'Manzana',quantity:4,unit:'pza',category:'Verduras y frutas'}]);
  regenerateShopping(s);
  assert.equal(s.shopping.filter(i=>i.name==='Manzana').reduce((t,i)=>t+Number(i.plannedQty),0),1,'5 piezas - 4 en casa');
  // Unidades que no son compatibles no se mezclan: 1 pieza en casa no descuenta kilos.
  s=sinReceta([{id:'a',name:'Manzana',quantity:1,unit:'kg',category:'Verduras y frutas'},{id:'b',name:'Manzana',quantity:2,unit:'pza',category:'Verduras y frutas'}],[{name:'Manzana',quantity:1,unit:'pza',category:'Verduras y frutas'}]);
  regenerateShopping(s);
  assert.equal(s.shopping.find(i=>i.name==='Manzana'&&i.unit==='kg').plannedQty,1);assert.equal(s.shopping.find(i=>i.name==='Manzana'&&i.unit==='pza').plannedQty,1);
});
