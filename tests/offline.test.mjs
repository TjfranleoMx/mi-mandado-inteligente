import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../sw.js',import.meta.url),'utf8');
function worker(){
  const handlers={},deleted=[];
  const self={registration:{scope:'https://example.test/mi-mandado-inteligente/'},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(type,fn)=>handlers[type]=fn};
  const caches={match:async()=>new Response('cached'),keys:async()=>['otra-app-v1','mi-mandado-v1'],delete:async key=>deleted.push(key),open:async()=>({addAll:async()=>{}})};
  vm.runInNewContext(source,{self,caches,URL,Response,location:{origin:'https://example.test'},fetch:async()=>{throw Error('offline');}});
  return {handlers,deleted};
}
test('activar offline no borra las cachés de otras aplicaciones del mismo dominio',async()=>{
  const {handlers,deleted}=worker();let task;
  handlers.activate({waitUntil:p=>task=p});await task;
  assert.deepEqual(deleted,[]);
});
test('el servicio offline no intercepta respaldos ni otras aplicaciones',()=>{
  const {handlers}=worker();let intercepted=false;
  for(const path of ['/otra-app/','/mi-mandado-inteligente/respaldo-privado.json']){
    handlers.fetch({request:{method:'GET',url:'https://example.test'+path,mode:'cors'},respondWith:()=>intercepted=true});
  }
  assert.equal(intercepted,false);
});
