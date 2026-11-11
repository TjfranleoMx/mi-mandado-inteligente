import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const v04=JSON.parse(fs.readFileSync(new URL('../fixtures/respaldo-v04-ficticio.json',import.meta.url),'utf8'));
async function ready(page){
  await page.goto('./');
  await expect(page.locator('.hero')).toBeVisible();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
}
// Lista larga y ficticia: 12 productos de la entrega + 36 artículos manuales repartidos en secciones, algunos ya marcados.
const LARGA=`
  const cats=[['Verduras y frutas','Fruta'],['Proteínas','Carne'],['Lácteos','Lácteo'],['Despensa','Pan de caja'],['Limpieza','Limpiador'],['Higiene','Jabón'],['Otros','Cosa']];
  for(let i=0;i<36;i++){const [category,base]=cats[i%cats.length];
    s.shopping.push({id:'largo-'+i,name:base+' ficticio '+(i+1),category,unit:'pza',plannedQty:1+i%3,actualQty:'',unitPrice:'',totalPaid:'',priceMode:'unit',checked:i%4===0,store:'',source:'manual',recipeIds:[]});}
  s.prefs={...s.prefs,purchasedFolded:false};`;
const preparar=async(page,mutate)=>{
  await ready(page);
  await page.evaluate(async([raw,mutate])=>{
    const {decodeBackup}=await import('./backup.mjs');const {validateBackup}=await import('./core.mjs');const {persistState}=await import('./storage.mjs');
    const s=validateBackup(decodeBackup(raw));if(mutate)new Function('s',mutate)(s);await persistState(s);
  },[v04,mutate]);
  await page.reload();await expect(page.locator('.hero')).toBeVisible();
  await page.locator('.hero [data-action="go-super"]').click();await expect(page.locator('.super')).toBeVisible();
};
// Recorre la página como lo haría una persona y, para cada fila, busca una posición de desplazamiento en la que
// quede COMPLETAMENTE visible y en la que lo que está encima de la casilla y del nombre sea la propia fila (no el botón
// «Registrar compra» ni la navegación). También mide la holgura de la última fila al llegar al final.
const auditar=page=>page.evaluate(async()=>{
  const esperar=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const filas=[...document.querySelectorAll('.super-row')];
  const vh=window.innerHeight,max=document.documentElement.scrollHeight-vh;
  const libres=new Map(filas.map(f=>[f,false]));
  const tapa=(f)=>{
    const r=f.getBoundingClientRect();
    if(r.top<0||r.bottom>vh||r.left<0||r.right>innerWidth)return 'fuera de pantalla';
    const puntos=[['casilla',f.querySelector('.super-check')],['nombre',f.querySelector('.super-info')]].map(([n,e])=>{const b=e.getBoundingClientRect();return [n,b.left+b.width/2,b.top+b.height/2];});
    puntos.push(['esquina sup',r.left+16,r.top+10],['esquina inf',r.left+16,r.bottom-10],['esquina inf der',r.right-16,r.bottom-10]);
    for(const [n,x,y] of puntos){const e=document.elementFromPoint(x,y);if(!e||!f.contains(e))return `${n} tapado por <${e?.tagName?.toLowerCase()} class="${e?.className}">`;}
    return '';
  };
  for(let y=0;y<=max+60;y+=30){
    window.scrollTo(0,Math.min(y,max));await esperar();
    for(const f of filas)if(!libres.get(f)&&tapa(f)==='')libres.set(f,true);
  }
  window.scrollTo(0,max);await esperar();
  const ultima=filas[filas.length-1];
  const nav=document.querySelector('.mobile-nav'),navVisible=nav&&getComputedStyle(nav).display!=='none'?nav.getBoundingClientRect().top:vh;
  const registrar=document.querySelector('.super-register .button').getBoundingClientRect();
  const r=ultima.getBoundingClientRect();
  return {total:filas.length,inalcanzables:filas.filter(f=>!libres.get(f)).map(f=>f.querySelector('.super-name').textContent),
    final:{scrollMax:max,ultima:ultima.querySelector('.super-name').textContent,huecoSobreNavegacion:Math.round(navVisible-r.bottom),huecoSobreRegistrar:Math.round(registrar.top-r.bottom),tapadaAlFinal:tapa(ultima)}};
});

for(const [nombre,viewport] of [['teléfono estándar',null],['teléfono pequeño',{width:360,height:640}],['teléfono horizontal',{width:800,height:360}]])
  test(`lista larga en ${nombre}: todos los productos, incluido el último, se alcanzan sin que los tape nada`,async({page})=>{
    test.skip(test.info().project.name.startsWith('escritorio')&&viewport!==null,'solo móvil');
    if(viewport)await page.setViewportSize(viewport);
    await preparar(page,LARGA);
    const a=await auditar(page);
    console.log(`[${test.info().project.name}] ${nombre}: ${JSON.stringify(a)}`);
    if(viewport===null)await page.screenshot({path:`test-results/super-final-lista-${test.info().project.name}.png`});   // la auditoría deja la pantalla al final
    expect(a.total).toBeGreaterThanOrEqual(48);
    expect(a.inalcanzables).toEqual([]);
    expect(a.final.tapadaAlFinal).toBe('');
    expect(a.final.huecoSobreNavegacion).toBeGreaterThanOrEqual(8);
    expect(a.final.huecoSobreRegistrar).toBeGreaterThanOrEqual(8);
  });

test('con los comprados plegados y la lista corta también quedan todos alcanzables',async({page})=>{
  await preparar(page,'');
  const a=await auditar(page);
  console.log(`[${test.info().project.name}] lista corta: ${JSON.stringify(a)}`);
  expect(a.inalcanzables).toEqual([]);expect(a.final.tapadaAlFinal).toBe('');
});
