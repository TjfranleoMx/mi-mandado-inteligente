import {makeInitialState,validateBackup} from './core.mjs';
const DB_NAME='mi-mandado-inteligente';
const STORE='datos';
const KEY='estado';
const FALLBACK_KEY='mi-mandado-respaldo';
const FALLBACK_FLAG='mi-mandado-storage-fallback-active';
export let storageMode='indexeddb';
function openDb(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window))return reject(new Error('IndexedDB no disponible'));
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('Error de almacenamiento'));
  });
}
async function idbGet(){
  const db=await openDb();
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly');const req=tx.objectStore(STORE).get(KEY);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  finally{db.close();}
}
async function idbPut(data){
  const db=await openDb();
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(data,KEY);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
  finally{db.close();}
}
function getFallback(){
  const json=localStorage.getItem(FALLBACK_KEY);
  if(!json)return makeInitialState();
  try{return validateBackup(JSON.parse(json));}
  catch{throw new Error('El respaldo local necesita revisión. Evita borrar datos o reiniciar la aplicación.');}
}
export async function loadState(){
  let fallbackActive=false;
  try{fallbackActive=localStorage.getItem(FALLBACK_FLAG)==='1';}catch{/* IndexedDB puede seguir disponible. */}
  if(fallbackActive){
    storageMode='localstorage';
    return getFallback();
  }
  let data;
  try{data=await idbGet();}
  catch(error){
    console.warn('IndexedDB no disponible:',error);
    storageMode='localstorage';
    return getFallback();
  }
  storageMode='indexeddb';
  if(!data)return makeInitialState();
  try{return validateBackup(data);}
  catch{throw new Error('Hay un problema con el guardado en IndexedDB. No reinicies los datos; intenta recuperar una copia de respaldo.');}
}
export async function persistState(state){
  if(storageMode==='indexeddb'){
    try {await idbPut(state);return;}
    catch(e){console.warn('Fallo IndexedDB',e);storageMode='localstorage';}
  }
  localStorage.setItem(FALLBACK_KEY,JSON.stringify(state));
  localStorage.setItem(FALLBACK_FLAG,'1');
}
