import test from 'node:test';
import assert from 'node:assert/strict';
import {makeInitialState,generateShoppingList,validateRecipe,validateBackup} from '../core.mjs';
const recipe={id:'arroz',title:'Arroz de prueba',servings:3,minutes:20,ingredients:[{name:'Arroz',quantity:1,unit:'kg',category:'Despensa'}],steps:['Lavar el arroz.','Cocinar.']};
test('despensa manual se descuenta con gramos, sin acumular al regenerar',()=>{
 const pantry=[{name:'Arroz',quantity:400,unit:'g'}];
 const a=generateShoppingList([recipe],[{recipeId:'arroz',times:1}],[],[],pantry);
 assert.equal(a[0].plannedQty,0.6);
 assert.equal(generateShoppingList([recipe],[{recipeId:'arroz',times:1}],a,[],pantry)[0].plannedQty,0.6);
});
test('despensa y compra se descuentan una sola vez por menú',()=>{
 const bought=[{items:[{name:'Arroz',unit:'kg',actualQty:0.3,source:'recipe'}]}];
 assert.equal(generateShoppingList([recipe],[{recipeId:'arroz',times:1}],[],bought,[{name:'Arroz',quantity:400,unit:'g'}])[0].plannedQty,0.3);
});
test('receta conserva imagen local segura y rechaza imágenes externas o SVG',()=>{
 const valid={...recipe,image:'./images/pollo-calabacitas.webp'};
 assert.equal(validateRecipe(valid).image,'./images/pollo-calabacitas.webp');
 for(const image of ['https://example.test/foto.png','data:image/svg+xml;base64,PHN2Zz4=','javascript:alert(1)'])assert.throws(()=>validateRecipe({...recipe,image}),/imagen/i);
});
