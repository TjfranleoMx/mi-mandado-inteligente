import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
function worker(existing){
  const handlers={},deleted=[],opened=[];
  const self={registration:{scope:'https://example.test/mi-mandado-inteligente/'},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(type,fn)=>handlers[type]=fn};
  const caches={keys:async()=>existing,delete:async key=>deleted.push(key),open:async name=>{opened.push(name);return {addAll:async()=>{}};}};
  vm.runInNewContext(source,{self,caches,URL,Request,Response,location:{origin:'https://example.test'},fetch:async()=>{throw Error('offline');}});
  return {handlers,deleted,opened};
}
test('actualizar desde la caché v0.4 la reemplaza sin tocar otras aplicaciones',async()=>{
  const old='mi-mandado:/mi-mandado-inteligente/:0.4.0',other='mi-mandado:/otra-ruta/:0.4.0',foreign='otra-app-v1';
  const {handlers,deleted,opened}=worker([old,other,foreign]);let task;
  handlers.install({waitUntil:p=>task=p});await task;
  assert.ok(opened[0].endsWith(':0.5.0')&&opened[0]!==old,'la caché nueva tiene otro nombre');
  handlers.activate({waitUntil:p=>task=p});await task;
  assert.deepEqual(deleted,[old],'solo se borra la caché vieja de esta misma ruta');
});
test('el servicio offline guarda todos los módulos que la app importa',()=>{
  const dir=new URL('../',import.meta.url);
  const listed=[...source.match(/const ASSETS=\[(.*?)\];/s)[1].matchAll(/'\.\/([^']+)'/g)].map(m=>m[1]);
  for(const file of fs.readdirSync(dir).filter(f=>/\.mjs$/.test(f)&&f!=='playwright.config.mjs'))assert.ok(listed.includes(file),`${file} falta en la caché offline`);
});
