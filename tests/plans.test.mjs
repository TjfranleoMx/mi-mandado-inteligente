import test from 'node:test';
import assert from 'node:assert/strict';
import {makeInitialState,validateBackup,generateShoppingList} from '../core.mjs';
import {ensurePlans,syncActivePlan,createPlan,activatePlan,saveMenuTemplate,repeatMenu,selectionFromDays,importMenuPack} from '../menus.mjs';
function initial(){const s=makeInitialState();ensurePlans(s,'2026-11-10');return s;}
test('plan lunes conserva lista y compras al preparar otra semana',()=>{
 const s=initial(),first=s.activePlanId;s.selected=[{recipeId:s.recipes[0].id,times:1}];s.shopping=generateShoppingList(s.recipes,s.selected);s.menuPurchaseIds=['ticket-sabado'];s.pantry=[{name:'Cebolla',quantity:50,unit:'g'}];
 createPlan(s,{name:'Semana siguiente',startDate:'2026-11-23',days:[]});
 assert.equal(s.selected.length,0);assert.equal(s.shopping.length,0);assert.deepEqual(s.menuPurchaseIds,[]);assert.deepEqual(s.pantry,[]);
 activatePlan(s,first);assert.equal(s.shopping.length,6);assert.deepEqual(s.menuPurchaseIds,['ticket-sabado']);assert.equal(s.pantry[0].quantity,50);
});
test('fecha de inicio debe ser lunes; error no cambia el plan',()=>{
 const s=initial(),id=s.activePlanId;
 assert.throws(()=>createPlan(s,{name:'Inválido',startDate:'2026-11-17',days:[]}),/lunes/i);
 assert.equal(s.activePlanId,id);assert.equal(s.plans.length,1);
});
test('plantilla guarda receta y repetir no hereda compras ni despensa',()=>{
 const s=initial();s.selected=[{recipeId:s.recipes[0].id,times:1,days:[0]}];
 const title=s.recipes[0].title;const template=saveMenuTemplate(s,'Favorito');s.recipes[0].steps=['Otra preparación'];s.menuPurchaseIds=['anterior'];s.pantry=[{name:'Pollo',quantity:1,unit:'kg'}];
 repeatMenu(s,template.id,{name:'Repetición',startDate:'2026-11-23'});
 const r=s.recipes.find(r=>r.id===s.selected[0].recipeId);
 assert.equal(r.title,title);assert.notDeepEqual(r.steps,['Otra preparación']);assert.deepEqual(s.menuPurchaseIds,[]);assert.deepEqual(s.pantry,[]);
});
test('respaldar y restaurar conserva biblioteca, planes y días',()=>{
 const s=initial();s.selected=selectionFromDays([s.recipes[0].id,'',s.recipes[0].id]);saveMenuTemplate(s,'Dos días');syncActivePlan(s);
 const restored=validateBackup(JSON.parse(JSON.stringify(s)));
 assert.equal(restored.savedMenus.length,1);assert.equal(restored.plans.length,1);assert.deepEqual(restored.selected[0].days,[0,2]);
});
test('importar menú es atómico y acepta recetas con sus días',()=>{
 const s=initial(),before=JSON.stringify(s);
 assert.throws(()=>importMenuPack(s,{name:'Error',startDate:'2026-11-17',recipes:[s.recipes[0]],days:[s.recipes[0].id]}),/lunes/i);
 assert.equal(JSON.stringify(s),before);
 const plan=importMenuPack(s,{name:'Importado',startDate:'2026-11-16',recipes:[s.recipes[0]],days:[s.recipes[0].id]});
 assert.equal(plan.startDate,'2026-11-16');assert.equal(s.selected[0].times,1);
});

test('repetir un menú heredado conserva todas las cantidades aunque exceda siete comidas',()=>{
 const s=initial();s.selected=[{recipeId:s.recipes[0].id,times:7},{recipeId:s.recipes[1].id,times:7}];
 const menu=saveMenuTemplate(s,'Menú heredado');repeatMenu(s,menu.id,{name:'Repetir completo',startDate:'2026-11-23'});
 assert.equal(s.selected.reduce((total,e)=>total+e.times,0),14);
});
