import {validateImage} from './core.mjs';
function eachRecipe(state,visit){
  if(Array.isArray(state.recipes))for(const recipe of state.recipes)visit(recipe);
  if(Array.isArray(state.savedMenus))for(const menu of state.savedMenus)if(Array.isArray(menu?.recipes))for(const recipe of menu.recipes)visit(recipe);
}
export function encodeBackup(state){
  const raw=structuredClone(state),images=[],ids=new Map();
  eachRecipe(raw,recipe=>{
    if(!recipe||typeof recipe.image!=='string'||!recipe.image.startsWith('data:'))return;
    if(!ids.has(recipe.image)){ids.set(recipe.image,images.length);images.push(recipe.image);}
    recipe.image=`local-image:${ids.get(recipe.image)}`;
  });
  raw.backupImages=images;return JSON.stringify(raw);
}
export function decodeBackup(raw){
  if(raw?.backupImages===undefined)return raw;
  if(!Array.isArray(raw.backupImages)||raw.backupImages.length>12000)throw new Error('Biblioteca de imágenes inválida en el respaldo.');
  const images=raw.backupImages.map(image=>validateImage(image));
  const expanded=structuredClone(raw);
  eachRecipe(expanded,recipe=>{
    if(!recipe||typeof recipe.image!=='string'||!recipe.image.startsWith('local-image:'))return;
    const match=/^local-image:(\d+)$/.exec(recipe.image),id=match?Number(match[1]):-1;
    if(!Number.isSafeInteger(id)||id<0||id>=images.length)throw new Error('Falta una imagen referenciada por el respaldo.');
    recipe.image=images[id];
  });
  delete expanded.backupImages;return expanded;
}
