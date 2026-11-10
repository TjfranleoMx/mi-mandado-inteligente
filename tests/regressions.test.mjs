import test from 'node:test';
import assert from 'node:assert/strict';
import {makeInitialState,generateShoppingList,mergeRecipes,finalizePurchase,validateBackup,applyShoppingEdit,priceOf} from '../core.mjs';

test('regenerar con gramos conserva el peso real y precio equivalentes',()=>{
  const recipes=[{id:'r',ingredients:[{name:'Arroz',quantity:1,unit:'kg',category:'Despensa'}]}];
  const selected=[{recipeId:'r',times:1}];
  const list=generateShoppingList(recipes,selected);
  Object.assign(list[0],{actualQty:1.3,unitPrice:120,totalPaid:156,checked:true});
  recipes[0].ingredients[0]={...recipes[0].ingredients[0],quantity:1000,unit:'g'};
  const [result]=generateShoppingList(recipes,selected,list);
  assert.equal(Number(result.actualQty),1300);
  assert.equal(Number(result.unitPrice),0.12);
  assert.equal(Number(result.totalPaid),156);
});
test('recetas importadas con IDs repetidos se pueden seleccionar por separado',()=>{
  const result=mergeRecipes([],[{id:'igual',title:'Arroz'},{id:'igual',title:'Sopa'}]);
  assert.equal(new Set(result.recipes.map(r=>r.id)).size,2);
});
test('no se registran fechas inexistentes',()=>{
  const state=makeInitialState();
  state.shopping=[{name:'Arroz',checked:true,actualQty:1,totalPaid:10}];
  assert.throws(()=>finalizePurchase(state,'2026-02-31','Tienda'),/Fecha/);
});
test('no se restauran compras con fechas inexistentes',()=>{
  const state=makeInitialState();state.purchases=[{date:'2026-02-31',items:[]}];
  assert.throws(()=>validateBackup(state),/compra inválida/);
});
test('borrar precio unitario invalida el total calculado previamente',()=>{
  const item={actualQty:2,unitPrice:10,totalPaid:20,priceMode:'unit'};
  applyShoppingEdit(item,'unitPrice','');
  assert.ok(Number.isNaN(priceOf(item)));
});
