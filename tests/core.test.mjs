import test from 'node:test';
import assert from 'node:assert/strict';
import {makeInitialState,numeric,convert,generateShoppingList,priceOf,finalizePurchase,spendingSummary,validateBackup,parseRecipePack,mergeRecipes,unitPriceHistory,totalsForShopping,weekSummary,applyShoppingEdit} from '../core.mjs';

test('cantidades en español y conversión de gramos a kilos',()=>{
 assert.equal(numeric('1,300'),1.3);
 assert.equal(convert(300,'g','kg'),0.3);
 assert.equal(convert(1.3,'kg','g'),1300);
 assert.ok(Number.isNaN(convert(1,'pza','kg')));
});
test('ingredientes repetidos se consolidan y conservan los extras manuales',()=>{
 const s=makeInitialState();
 const r1=s.recipes[0],r2=s.recipes[1];
 const extras=[{id:'extra1',name:'Detergente',category:'Limpieza',unit:'pza',plannedQty:1,actualQty:'',unitPrice:'',totalPaid:'',checked:false,source:'manual',recipeIds:[]}];
 const list=generateShoppingList(s.recipes,[{recipeId:r1.id,times:1},{recipeId:r2.id,times:1}],extras);
 const tomato=list.find(x=>x.name==='Jitomate');
 assert.equal(tomato.plannedQty,0.65);
 assert.equal(list.filter(x=>x.name==='Jitomate').length,1);
 assert.ok(list.find(x=>x.name==='Detergente'));
});
test('1.300 kg a 120 por kg: costo 156; preserva meta de receta',()=>{
 const s=makeInitialState();
 s.selected=[{recipeId:s.recipes[0].id,times:1}];
 s.shopping=generateShoppingList(s.recipes,s.selected,[]);
 const chicken=s.shopping.find(i=>i.name==='Pechuga de pollo');
 const recipeQty=s.recipes[0].ingredients[0].quantity;
 chicken.actualQty='1,300';chicken.unitPrice='120';chicken.totalPaid='156';chicken.checked=true;
 assert.equal(priceOf(chicken),156);
 assert.equal(recipeQty,0.6);
 const {purchase,total}=finalizePurchase(s,'2026-11-10','Tienda de prueba');
 assert.equal(total,156);assert.equal(purchase.items[0].actualQty,1.3);
 assert.equal(purchase.items[0].plannedQty,0.6);
 const summary=spendingSummary([purchase],'2026-11');
 assert.equal(summary.total,156);assert.equal(summary.categories['Proteínas'],156);
 assert.equal(unitPriceHistory([purchase],chicken),120);
 assert.equal(totalsForShopping(s.shopping,[purchase]).paid,156);
});
test('marca productos pero no permite registrar artículos sin precio y peso',()=>{
 const s=makeInitialState();s.shopping=[{id:'x',name:'Calabacita',unit:'kg',category:'Verduras y frutas',plannedQty:1,checked:true,actualQty:'',unitPrice:'',totalPaid:''}];
 assert.throws(()=>finalizePurchase(s,'2026-11-10','Tienda'),/cantidad real/);
 s.shopping[0].actualQty='1.3';
 assert.throws(()=>finalizePurchase(s,'2026-11-10','Tienda'),/importe pagado/);
 s.shopping[0].totalPaid='0';assert.equal(finalizePurchase(s,'2026-11-10','Tienda').total,0);
});
test('respaldo completo valido conserva datos y se restaura',()=>{
 const s=makeInitialState();s.shopping=[{id:'x',name:'Detergente',unit:'pza',category:'Limpieza',plannedQty:1,actualQty:'',unitPrice:'',totalPaid:'',checked:false,store:'',source:'manual',recipeIds:[]}];
 const cleaned=validateBackup(JSON.parse(JSON.stringify(s)));
 assert.deepEqual(cleaned.recipes.map(r=>r.title),s.recipes.map(r=>r.title));
 assert.equal(cleaned.shopping[0].name,'Detergente');
});
test('importación y evitar duplicación por nombre',()=>{
 const source={recipes:[{title:'Caldo de pollo',servings:3,minutes:30,ingredients:[{name:'Pollo',quantity:1,unit:'kg',category:'Proteínas'}],steps:['Cocinar bien el pollo.']}]};
 const parsed=parseRecipePack(source),once=mergeRecipes([],parsed),twice=mergeRecipes(once.recipes,parsed);
 assert.equal(once.count,1);assert.equal(twice.count,0);assert.equal(twice.skipped,1);
 assert.throws(()=>parseRecipePack({recipes:[{...source.recipes[0],ingredients:[{name:'Pollo',quantity:0,unit:'kg'}]}]}),/Ingrediente inválido/);
});

test('gastos semanales con cruce de mes',()=>{
 const purchases=[{date:'2026-11-01',items:[{totalPaid:50}]},{date:'2026-11-02',items:[{totalPaid:100}]},{date:'2026-11-07',items:[{totalPaid:125}]},{date:'2026-11-09',items:[{totalPaid:300}]}];
 const summary=weekSummary(purchases,'2026-11-07');
 assert.equal(summary.start,'2026-11-02');assert.equal(summary.end,'2026-11-08');assert.equal(summary.total,225);
});

test('importe del ticket se mantiene cuando cambia el peso real',()=>{
 const item={actualQty:'1.300',unitPrice:'120',totalPaid:'156',priceMode:'unit'};
 applyShoppingEdit(item,'totalPaid','150');
 assert.equal(item.priceMode,'total');
 applyShoppingEdit(item,'actualQty','1.5');
 assert.equal(item.totalPaid,'150');
 assert.equal(item.unitPrice,'100');
 applyShoppingEdit(item,'unitPrice','120');
 assert.equal(item.totalPaid,'180');
});
