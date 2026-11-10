import test from 'node:test';
import assert from 'node:assert/strict';
import {makeInitialState,generateShoppingList,validateBackup} from '../core.mjs';
const recipes=[{id:'r',ingredients:[{name:'Arroz',quantity:1,unit:'kg',category:'Despensa'}]}];
const selected=[{recipeId:'r',times:1}];
const receipt=(qty=1,unit='kg')=>({id:'compra',date:'2026-11-10',items:[{name:'Arroz',unit,actualQty:qty,totalPaid:20,source:'recipe'}]});
test('comprado completo no reaparece al regenerar el menú',()=>{
 assert.equal(generateShoppingList(recipes,selected,[],[receipt()]).length,0);
});
test('compra parcial solo deja la cantidad que falta, incluso en gramos',()=>{
 assert.equal(generateShoppingList(recipes,selected,[],[receipt(400,'g')])[0].plannedQty,0.6);
});
test('aumentar menú descuenta lo comprado y conserva artículos manuales',()=>{
 const manual={id:'extra',name:'Jabón',source:'manual'};
 const result=generateShoppingList(recipes,[{recipeId:'r',times:2}],[manual],[receipt()]);
 assert.equal(result[0].plannedQty,1);assert.equal(result[1],manual);
});
test('compras manuales no consumen el menú y unidades distintas no se mezclan',()=>{
 const a=receipt();a.items[0].source='manual';
 assert.equal(generateShoppingList(recipes,selected,[],[a])[0].plannedQty,1);
 assert.equal(generateShoppingList(recipes,selected,[],[receipt(1,'pza')])[0].plannedQty,1);
});
test('respaldo conserva referencias del menú y tema, incluido menú nuevo vacío',()=>{
 const state=makeInitialState();state.purchases=[receipt()];state.menuPurchaseIds=['compra'];state.theme='dark';
 const restored=validateBackup(JSON.parse(JSON.stringify(state)),'2026-11-10');
 assert.deepEqual(restored.menuPurchaseIds,['compra']);assert.equal(restored.theme,'dark');
 state.menuPurchaseIds=[];
 assert.deepEqual(validateBackup(state,'2026-11-10').menuPurchaseIds,[]);
});
test('v0.2 conserva historial sin asociar compras automáticamente',()=>{
 const state=makeInitialState();delete state.menuPurchaseIds;delete state.theme;
 state.purchases=[receipt(),{...receipt(),id:'anterior',date:'2026-11-01'}];
 const restored=validateBackup(state,'2026-11-10');
 assert.deepEqual(restored.menuPurchaseIds,[]);assert.equal(restored.purchases.length,2);assert.equal(restored.theme,'system');
});
