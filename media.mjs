import {validateImage} from './core.mjs';

async function decodeImage(src){
  const image=new Image();image.src=src;
  try{await image.decode();}catch{throw new Error('No pudimos abrir la imagen. Usa PNG, JPEG o WebP.');}
  if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>12000000)throw new Error('La imagen supera el tamaño admitido (12 megapíxeles).');
  return image;
}
export async function prepareLocalImage(file){
  if(!file||file.size>10000000||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Elige una foto PNG, JPEG o WebP de menos de 10 MB.');
  const url=URL.createObjectURL(file);
  try{
    const image=await decodeImage(url),scale=Math.min(1,960/image.naturalWidth,720/image.naturalHeight);
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    const data=canvas.toDataURL('image/webp',0.82);return validateImage(data);
  }finally{URL.revokeObjectURL(url);}
}
export async function validateRecipeImages(recipes){
  // Solo decodificar fotos incluidas; las dos imágenes locales están empaquetadas.
  for(const recipe of recipes)if(recipe.image?.startsWith('data:'))await decodeImage(validateImage(recipe.image));
}
