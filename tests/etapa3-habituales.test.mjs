import test from 'node:test';
import assert from 'node:assert/strict';
import {makeInitialState,generateShoppingList,validateBackup,finalizePurchase,exampleRecipes} from '../core.mjs';
import {encodeBackup,decodeBackup} from '../backup.mjs';
import {ensurePlans,createPlan,activatePlan,syncActivePlan,updatePlan} from '../menus.mjs';
import {findConflict,applyHabitualPicks,upsertHabitual,itemFromHabitual} from '../habituales.mjs';

function base(){
  const s=makeInitialState();ensurePlans(s,'2026-11-09');
  updatePlan(s,{name:'Semana ficticia',startDate:'2026-11-09',days:['ejemplo-pollo-calabacitas','ejemplo-atun-nopales','','','','','']});
  s.shopping=generateShoppingList(s.recipes,s.selected,[],[],[],s.sectionOverrides,s.habitualSums);
  return s;
}
const preview=s=>generateShoppingList(s.recipes,s.selected,s.shopping,[],s.pantry||[],s.sectionOverrides,s.habitualSums);
const jitomate=s=>s.shopping.find(i=>i.name==='Jitomate');
const hab=(s,input)=>upsertHabitual(s,input).habitual;

test('guardar un habitual no duplica: si ya existe se actualiza su cantidad',()=>{
  const s=base();
  const a=upsertHabitual(s,{name:'Leche entera',quantity:2,unit:'l',category:'Lácteos'});
  const b=upsertHabitual(s,{name:'  leche ENTERA ',quantity:3,unit:'l',category:'Lácteos'});
  assert.equal(a.added,true);assert.equal(b.added,false);
  assert.equal(s.habituales.length,1);assert.equal(s.habituales[0].quantity,3);
  assert.equal(s.habituales[0].section,'lacteos-huevos');
  assert.throws(()=>upsertHabitual(s,{name:'X',quantity:0,unit:'l',category:'Lácteos'}),/habitual/i);
});

test('elegir un habitual sin coincidencia lo agrega como renglón propio y NO se agrega solo',()=>{
  const s=base(),before=s.shopping.length;
  const leche=hab(s,{name:'Leche entera',quantity:2,unit:'l',category:'Lácteos'});
  assert.equal(s.shopping.length,before,'guardarlo no lo mete a la lista');
  const regenerated=generateShoppingList(s.recipes,s.selected,s.shopping,[],[],s.sectionOverrides,s.habitualSums);
  assert.equal(regenerated.some(i=>i.name==='Leche entera'),false,'regenerar tampoco lo agrega');
  applyHabitualPicks(s,[{habitual:leche,choice:''}],preview(s));
  const item=s.shopping.find(i=>i.name==='Leche entera');
  assert.equal(item.plannedQty,2);assert.equal(item.habitualId,leche.id);assert.equal(item.source,'manual');assert.equal(item.section,'lacteos-huevos');
});

test('si coincide con un ingrediente del menú, obliga a elegir y no cambia nada hasta entonces',()=>{
  const s=base();
  const jit=hab(s,{name:'Jitomate',quantity:1,unit:'kg',category:'Verduras y frutas'});
  const snapshot=JSON.stringify(s.shopping);
  assert.ok(findConflict(preview(s),jit),'se detecta la coincidencia');
  assert.throws(()=>applyHabitualPicks(s,[{habitual:jit,choice:''}],preview(s)),/ya está en tu lista/);
  assert.equal(JSON.stringify(s.shopping),snapshot);assert.deepEqual(s.habitualSums,[]);
});

test('«Dejar dos renglones» y «No agregar»',()=>{
  const s=base();
  const jit=hab(s,{name:'Jitomate',quantity:1,unit:'kg',category:'Verduras y frutas'});
  applyHabitualPicks(s,[{habitual:jit,choice:'skip'}],preview(s));
  assert.equal(s.shopping.filter(i=>i.name==='Jitomate').length,1);
  applyHabitualPicks(s,[{habitual:jit,choice:'two'}],preview(s));
  const rows=s.shopping.filter(i=>i.name==='Jitomate');
  assert.equal(rows.length,2);assert.equal(rows.find(i=>i.source==='manual').plannedQty,1);assert.equal(rows.find(i=>i.source==='recipe').plannedQty,0.65);
});

test('«Sumar» con un ingrediente del menú suma una vez, sobrevive a regenerar y no se cuenta doble',()=>{
  const s=base();
  assert.equal(jitomate(s).plannedQty,0.65);
  const jit=hab(s,{name:'Jitomate',quantity:500,unit:'g',category:'Verduras y frutas'});
  applyHabitualPicks(s,[{habitual:jit,choice:'sum'}],preview(s));
  s.shopping=generateShoppingList(s.recipes,s.selected,s.shopping,[],[],s.sectionOverrides,s.habitualSums);
  assert.equal(jitomate(s).plannedQty,1.15,'0,65 kg del menú + 500 g');
  assert.ok(jitomate(s).recipeIds.includes('habitual:'+jit.id));
  // Regenerar de nuevo y elegir «sumar» otra vez no acumula.
  applyHabitualPicks(s,[{habitual:jit,choice:'sum'}],preview(s));
  s.shopping=generateShoppingList(s.recipes,s.selected,s.shopping,[],[],s.sectionOverrides,s.habitualSums);
  assert.equal(jitomate(s).plannedQty,1.15);
  assert.equal(s.habitualSums.length,1);
  // La despensa descuenta del total ya sumado.
  const conCasa=generateShoppingList(s.recipes,s.selected,s.shopping,[],[{name:'Jitomate',quantity:150,unit:'g'}],s.sectionOverrides,s.habitualSums);
  assert.equal(conCasa.find(i=>i.name==='Jitomate').plannedQty,1);
});

test('compra parcial de un ingrediente con habitual sumado: lo comprado se descuenta una sola vez',()=>{
  const s=base();
  const jit=hab(s,{name:'Jitomate',quantity:0.5,unit:'kg',category:'Verduras y frutas'});
  applyHabitualPicks(s,[{habitual:jit,choice:'sum'}],preview(s));
  s.shopping=generateShoppingList(s.recipes,s.selected,s.shopping,[],[],s.sectionOverrides,s.habitualSums);
  const item=jitomate(s);item.checked=true;item.actualQty=0.5;item.totalPaid=20;item.priceMode='total';
  const {purchase}=finalizePurchase(s,'2026-11-07','Tienda ficticia');
  const regenerated=generateShoppingList(s.recipes,s.selected,s.shopping,[purchase],[],s.sectionOverrides,s.habitualSums);
  assert.equal(regenerated.find(i=>i.name==='Jitomate').plannedQty,0.65,'1,15 kg - 0,5 kg comprados');
});

test('«Sumar» con un renglón manual existente suma a ese renglón',()=>{
  const s=base();
  s.shopping.push({id:'m1',name:'Leche entera',category:'Lácteos',section:'lacteos-huevos',unit:'l',plannedQty:1,actualQty:'',unitPrice:'',totalPaid:'',priceMode:'unit',checked:false,store:'',source:'manual',recipeIds:[]});
  const leche=hab(s,{name:'Leche entera',quantity:2,unit:'l',category:'Lácteos'});
  applyHabitualPicks(s,[{habitual:leche,choice:'sum'}],preview(s));
  assert.equal(s.shopping.filter(i=>i.name==='Leche entera').length,1);
  assert.equal(s.shopping.find(i=>i.id==='m1').plannedQty,3);
});

test('los habituales sumados son por semana: la semana nueva empieza limpia',()=>{
  const s=base();
  const jit=hab(s,{name:'Jitomate',quantity:0.5,unit:'kg',category:'Verduras y frutas'});
  applyHabitualPicks(s,[{habitual:jit,choice:'sum'}],preview(s));
  syncActivePlan(s);const first=s.activePlanId;
  createPlan(s,{name:'Siguiente',startDate:'2026-11-16',days:[]});
  assert.deepEqual(s.habitualSums,[]);assert.equal(s.habituales.length,1,'la biblioteca se conserva');
  activatePlan(s,first);assert.equal(s.habitualSums.length,1,'la semana anterior conserva lo suyo');
});

test('exportar y restaurar conserva habituales y los sumados al menú; respaldo viejo sin ellos se abre',()=>{
  const s=base();
  const jit=hab(s,{name:'Jitomate',quantity:0.5,unit:'kg',category:'Verduras y frutas'});
  applyHabitualPicks(s,[{habitual:jit,choice:'sum'}],preview(s));syncActivePlan(s);
  const back=validateBackup(decodeBackup(JSON.parse(encodeBackup(s))),'2026-11-10');
  assert.deepEqual(back.habitualSums,s.habitualSums);assert.deepEqual(back.habituales,s.habituales);
  assert.deepEqual(back.plans[0].habitualSums,s.habitualSums);
  assert.deepEqual(validateBackup(structuredClone(back),'2026-11-10'),back);
  const old=JSON.parse(encodeBackup(s));delete old.habitualSums;for(const p of old.plans)delete p.habitualSums;
  assert.deepEqual(validateBackup(decodeBackup(old),'2026-11-10').habitualSums,[]);
  assert.throws(()=>validateBackup({...JSON.parse(encodeBackup(s)),habitualSums:[{habitualId:'x',name:'A',quantity:-1,unit:'kg'}]},'2026-11-10'),/inválido/);
});

test('sumar sin que el ingrediente siga en el menú no inventa productos',()=>{
  const s=base();
  const jit=hab(s,{name:'Jitomate',quantity:0.5,unit:'kg',category:'Verduras y frutas'});
  applyHabitualPicks(s,[{habitual:jit,choice:'sum'}],preview(s));
  s.selected=[];                       // se quita todo el menú
  const regenerated=generateShoppingList(s.recipes,s.selected,s.shopping,[],[],s.sectionOverrides,s.habitualSums);
  assert.equal(regenerated.filter(i=>i.source==='recipe').length,0);
});
