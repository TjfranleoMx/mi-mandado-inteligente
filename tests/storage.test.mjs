import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {makeInitialState} from '../core.mjs';
test('IndexedDB funciona aunque localStorage esté bloqueado',async()=>{
  globalThis.window={indexedDB};globalThis.indexedDB=indexedDB;
  globalThis.localStorage={getItem(){throw Error('Acceso bloqueado');}};
  const {loadState,persistState}=await import('../storage.mjs');
  const initial=await loadState();
  initial.defaultStore='Tienda de prueba';
  await persistState(initial);
  assert.equal((await loadState()).defaultStore,'Tienda de prueba');
});
