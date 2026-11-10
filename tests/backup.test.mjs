import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeInitialState,validateBackup} from '../core.mjs';
import {encodeBackup,decodeBackup} from '../backup.mjs';
test('respaldo deduplica fotos y restaura biblioteca sin perder imágenes',async()=>{
 const state=makeInitialState();const image='data:image/webp;base64,'+(await readFile(new URL('../images/pollo-calabacitas.webp',import.meta.url))).toString('base64');
 state.recipes[0].image=image;
 state.savedMenus=Array.from({length:60},(_,i)=>({id:'menu-'+i,name:'Menú '+i,recipes:[structuredClone(state.recipes[0])],selected:[{recipeId:state.recipes[0].id,times:1}]}));
 const packed=encodeBackup(state);assert.ok(packed.length<200000);
 const restored=validateBackup(decodeBackup(JSON.parse(packed)));
 assert.equal(restored.savedMenus.length,60);assert.equal(restored.recipes[0].image,image);assert.equal(restored.savedMenus[59].recipes[0].image,image);
 assert.equal(state.recipes[0].image,image);
});
test('referencias de imagen inválidas se rechazan antes de restaurar',()=>{
 const state=makeInitialState();state.recipes[0].image='local-image:999';state.backupImages=[];
 assert.throws(()=>decodeBackup(state),/imagen/i);
});
