export const CATEGORIES = ['Verduras y frutas','Proteínas','Cereales y legumbres','Lácteos','Despensa','Limpieza','Higiene','Otros'];
export const UNITS = ['kg','g','l','ml','pza','paquete'];
export const PACK_VERSION = 1;
export const numeric = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const normalized = String(value ?? '').trim().replace(/\s/g,'').replace(',','.');
  if (!normalized) return NaN;
  return Number(normalized);
};
export const positive = value => Number.isFinite(numeric(value)) && numeric(value) > 0;
export const nonnegative = value => Number.isFinite(numeric(value)) && numeric(value) >= 0;
export const round = (n,places=3) => Number(n.toFixed(places));
export const money = amount => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(amount)||0);
export const uid = () => typeof crypto!=='undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const normalizedName = name => String(name||'').trim().toLocaleLowerCase('es-MX').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
export const unitGroup = unit => ({kg:'weight',g:'weight',l:'volume',ml:'volume',pza:'pza',paquete:'paquete'})[unit]||null;
export const factor = unit => ({kg:1000,g:1,l:1000,ml:1,pza:1,paquete:1})[unit]||0;
export const convert = (quantity,from,to) => unitGroup(from)===unitGroup(to) && factor(to)>0 ? (Number(quantity)*factor(from)/factor(to)) : NaN;
export const sameProduct = (a,b) => normalizedName(a.name)===normalizedName(b.name) && unitGroup(a.unit)===unitGroup(b.unit);
export const keyOf = item => `${normalizedName(item.name)}|${unitGroup(item.unit)}`;
export const exampleRecipes = [
  {id:'ejemplo-pollo-calabacitas',image:'./images/pollo-calabacitas.webp',title:'Pollo con calabacitas y frijoles',servings:3,minutes:35,tags:['Ejemplo'],ingredients:[
    {name:'Pechuga de pollo',quantity:0.6,unit:'kg',category:'Proteínas'},
    {name:'Calabacita',quantity:0.6,unit:'kg',category:'Verduras y frutas'},
    {name:'Jitomate',quantity:0.35,unit:'kg',category:'Verduras y frutas'},
    {name:'Cebolla',quantity:0.15,unit:'kg',category:'Verduras y frutas'},
    {name:'Aceite de oliva',quantity:15,unit:'ml',category:'Despensa'},
    {name:'Frijoles cocidos sin manteca',quantity:0.3,unit:'kg',category:'Cereales y legumbres'}],
   steps:['Lava y desinfecta las verduras. Corta el pollo en cubos y pica la calabacita, jitomate y cebolla.','Calienta el aceite en un sartén. Cocina el pollo por completo, hasta alcanzar 74 °C en su centro.','Agrega la cebolla y luego el jitomate y la calabacita; cocina hasta que queden suaves.','Calienta los frijoles cocidos y distribuye todo en tres platos. Ajusta las porciones de carbohidratos según el plan de alimentación individual.']},
  {id:'ejemplo-atun-nopales',image:'./images/atun-nopales.webp',title:'Ensalada de atún con nopales',servings:3,minutes:20,tags:['Ejemplo'],ingredients:[
    {name:'Atún en agua',quantity:3,unit:'pza',category:'Proteínas'},
    {name:'Nopales',quantity:0.5,unit:'kg',category:'Verduras y frutas'},
    {name:'Jitomate',quantity:0.3,unit:'kg',category:'Verduras y frutas'},
    {name:'Cebolla',quantity:0.1,unit:'kg',category:'Verduras y frutas'},
    {name:'Aguacate',quantity:1,unit:'pza',category:'Verduras y frutas'},
    {name:'Limón',quantity:2,unit:'pza',category:'Verduras y frutas'}],
   steps:['Lava y desinfecta las verduras. Cuece los nopales y escúrrelos.','Escurre el atún y mezcla con nopales, jitomate y cebolla picados.','Añade jugo de limón. Sirve en tres platos con una porción de aguacate en cada uno.','Acompaña con la porción de carbohidratos indicada en el plan alimentario de la persona, si corresponde.']}
];
export const makeInitialState = () => ({schemaVersion:1, budgetWeekly:0, defaultStore:'Mi tienda', recipes:structuredClone(exampleRecipes), selected:[], shopping:[], purchases:[], menuPurchaseIds:[], theme:'system'});
export function validateImage(image){
  if(image===undefined||image===null||image==='')return '';
  if(typeof image!=='string')throw new Error('La imagen de receta debe ser un archivo compatible.');
  if(['./images/pollo-calabacitas.webp','./images/atun-nopales.webp'].includes(image))return image;
  const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if(!match||match[2].length>450000||match[2].length%4!==0)throw new Error('Imagen inválida: usa PNG, JPEG o WebP de hasta 330 KB, incluida en el archivo.');
  let head;try{head=atob(match[2].slice(0,24));}catch{throw new Error('La imagen está dañada.');}
  if((match[1]==='png'&&!head.startsWith('\x89PNG\r\n\x1a\n'))||(match[1]==='jpeg'&&!head.startsWith('\xff\xd8\xff'))||(match[1]==='webp'&&!(head.startsWith('RIFF')&&head.slice(8,12)==='WEBP')))throw new Error('El contenido de la imagen no coincide con su formato.');
  return image;
}
export function validateRecipe(raw){
  if (!raw || typeof raw!=='object') throw new Error('Receta inválida.');
  const title=String(raw.title??raw.nombre??'').trim();
  if (!title || title.length>120) throw new Error('Cada receta necesita un título de 1 a 120 caracteres.');
  const servings = numeric(raw.servings??raw.porciones??3);
  if (!Number.isInteger(servings)||servings<1||servings>50) throw new Error(`Porciones inválidas en «${title}».`);
  const inputIngredients=raw.ingredients??raw.ingredientes;
  if (!Array.isArray(inputIngredients)||inputIngredients.length<1||inputIngredients.length>80) throw new Error(`La receta «${title}» necesita entre 1 y 80 ingredientes.`);
  const ingredients=inputIngredients.map(ing=>{
    const name=String(ing.name??ing.nombre??'').trim();
    const quantity=numeric(ing.quantity??ing.cantidad);
    const unit=String(ing.unit??ing.unidad??'').toLowerCase().trim();
    const category=String(ing.category??ing.categoria??'Despensa').trim();
    if(!name||name.length>90||!Number.isFinite(quantity)||quantity<=0||quantity>100000||!UNITS.includes(unit)) throw new Error(`Ingrediente inválido en «${title}»: revisa nombre, cantidad y unidad (kg, g, l, ml, pza o paquete).`);
    return {name,quantity,unit,category:CATEGORIES.includes(category)?category:'Despensa'};
  });
  const rawSteps=raw.steps??raw.pasos??[];
  if(!Array.isArray(rawSteps)||!rawSteps.length||rawSteps.length>40) throw new Error(`La receta «${title}» necesita instrucciones paso a paso.`);
  const steps=rawSteps.map(s=>String(s).trim()).filter(Boolean);
  if(!steps.length || steps.some(s=>s.length>1500)) throw new Error(`Instrucciones inválidas en «${title}».`);
  const minutes = numeric(raw.minutes??raw.minutos??30);
  const tags=Array.isArray(raw.tags) ? raw.tags.slice(0,8).map(v=>String(v).slice(0,60)) : [];
  const fallback=exampleRecipes.find(r=>r.id===raw.id&&r.title===title)?.image||'';
  const image=validateImage(raw.image===undefined?fallback:raw.image);
  return {image,archived:raw.archived===true,id:typeof raw.id==='string'&&raw.id.length<100?raw.id:uid(),title,servings,minutes:Number.isFinite(minutes)&&minutes>=0?minutes:30,tags,ingredients,steps};
}
export function parseRecipePack(raw){
  const recipes=Array.isArray(raw)?raw:raw?.recipes;
  if(!Array.isArray(recipes)||recipes.length<1||recipes.length>100) throw new Error('Este archivo debe tener una lista «recipes» con 1 a 100 recetas.');
  return recipes.map(validateRecipe);
}
export function mergeRecipes(existing,incoming){
  const names=new Set(existing.filter(r=>!r.archived).map(r=>normalizedName(r.title)));
  const ids=new Set(existing.map(r=>r.id));
  const added=[];
  for(const recipe of incoming){
    const name=normalizedName(recipe.title);
    if(names.has(name))continue;
    const id=ids.has(recipe.id)?uid():recipe.id;
    names.add(name);ids.add(id);added.push({...recipe,id});
  }
  return {recipes:[...existing,...added],count:added.length,skipped:incoming.length-added.length};
}
export function generateShoppingList(recipes,selected,existing=[],purchases=[],pantry=[]){
  const byId=new Map(recipes.map(r=>[r.id,r]));
  const generated=new Map();
  for(const sel of selected){
    const recipe=byId.get(sel.recipeId);if(!recipe)continue;
    const times=Number(sel.times)||1;
    for(const ing of recipe.ingredients){
      const key=keyOf(ing);
      if(generated.has(key)){
        const item=generated.get(key);
        item.plannedQty=round(Number(item.plannedQty)+convert(ing.quantity*times,ing.unit,item.unit),5);
        if(!item.recipeIds.includes(recipe.id))item.recipeIds.push(recipe.id);
      } else generated.set(key,{id:uid(),name:ing.name,category:ing.category,unit:ing.unit,plannedQty:round(ing.quantity*times,5),actualQty:'',unitPrice:'',totalPaid:'',priceMode:'unit',checked:false,store:'',source:'recipe',recipeIds:[recipe.id]});
    }
  }
  // Restar solo compras registradas del menú activo, con unidades compatibles.
  for(const [key,item] of generated){
    let bought=0;
    for(const entry of pantry)if(sameProduct(entry,item)&&positive(entry.quantity))bought+=convert(numeric(entry.quantity),entry.unit,item.unit);
    for(const purchase of purchases)for(const entry of purchase.items){
      if(entry.source==='recipe'&&sameProduct(entry,item)&&positive(entry.actualQty))bought+=convert(numeric(entry.actualQty),entry.unit,item.unit);
    }
    item.plannedQty=round(Math.max(0,item.plannedQty-bought),5);
    if(item.plannedQty===0)generated.delete(key);
  }
  const oldByKey=new Map(existing.filter(i=>i.source==='recipe').map(i=>[keyOf(i),i]));
  const recipeItems=[...generated].map(([key,item])=>{
    const previous=oldByKey.get(key);
    if(!previous)return item;
    const changed=previous.unit!==item.unit;
    return {...item,id:previous.id,
      actualQty:changed&&nonnegative(previous.actualQty)?round(convert(numeric(previous.actualQty),previous.unit,item.unit),5):previous.actualQty,
      unitPrice:changed&&nonnegative(previous.unitPrice)?round(numeric(previous.unitPrice)*convert(1,item.unit,previous.unit),6):previous.unitPrice,
      totalPaid:previous.totalPaid,priceMode:previous.priceMode||'unit',checked:previous.checked,store:previous.store};
  });
  return [...recipeItems,...existing.filter(i=>i.source==='manual')];
}
export function applyShoppingEdit(item,field,value){
  if(!['plannedQty','actualQty','unitPrice','totalPaid'].includes(field))return item;
  item[field]=String(value??'').trim();
  if(field==='unitPrice')item.priceMode='unit';
  if(field==='totalPaid')item.priceMode='total';
  const qty=numeric(item.actualQty),perUnit=numeric(item.unitPrice),paid=numeric(item.totalPaid);
  if(item.priceMode==='unit'&&(!Number.isFinite(perUnit)||perUnit<0||!(qty>0)))item.totalPaid='';
  if(item.priceMode==='total'&&(!Number.isFinite(paid)||paid<0||!(qty>0)))item.unitPrice='';
  if(field==='actualQty'){
    if(item.priceMode==='total' && Number.isFinite(paid) && paid>=0 && qty>0)item.unitPrice=String(round(paid/qty,4));
    else if(qty>0 && Number.isFinite(perUnit) && perUnit>=0)item.totalPaid=String(round(qty*perUnit,2));
  }else if(field==='unitPrice' && qty>0 && Number.isFinite(perUnit) && perUnit>=0){
    item.totalPaid=String(round(qty*perUnit,2));
  }else if(field==='totalPaid' && qty>0 && Number.isFinite(paid) && paid>=0){
    item.unitPrice=String(round(paid/qty,4));
  }
  return item;
}
export function priceOf(item){
  const total=numeric(item.totalPaid);
  if(Number.isFinite(total)&&total>=0)return total;
  const qty=numeric(item.actualQty),price=numeric(item.unitPrice);
  if(Number.isFinite(qty)&&qty>0 && Number.isFinite(price)&&price>=0)return round(qty*price,2);
  return NaN;
}
export function unitPriceHistory(purchases,item){
  for(const purchase of [...purchases].sort((a,b)=>String(b.date).localeCompare(String(a.date))||Number(b.createdAt||0)-Number(a.createdAt||0))){
    for(const bought of [...purchase.items].reverse()){
      if(!sameProduct(bought,item))continue;
      const qty=convert(numeric(bought.actualQty),bought.unit,item.unit);
      if(!(qty>0))continue;
      return (numeric(bought.totalPaid)||0)/qty;
    }
  }
  return NaN;
}
export function totalsForShopping(shopping,purchases=[]){
  let estimate=0,paid=0,boughtCount=0;
  for(const item of shopping){
    const unitCost=unitPriceHistory(purchases,item);
    if(Number.isFinite(unitCost))estimate += (numeric(item.plannedQty)||0)*unitCost;
    if(item.checked){boughtCount++;const cost=priceOf(item);if(Number.isFinite(cost))paid+=cost;}
  }
  return {estimate:round(estimate,2),paid:round(paid,2),boughtCount,remaining:shopping.length-boughtCount};
}
export function finalizePurchase(state,date,store){
  const items=state.shopping.filter(item=>item.checked);
  if(!items.length)throw new Error('Marca por lo menos un artículo como comprado.');
  for(const item of items){
    if(!positive(item.actualQty)) throw new Error(`Falta la cantidad real de «${item.name}».`);
    if(!nonnegative(priceOf(item))) throw new Error(`Falta el importe pagado por «${item.name}».`);
  }
  if(!validDate(date))throw new Error('Fecha inválida.');
  const purchase={id:uid(),date,createdAt:Date.now(),store:String(store||'Sin especificar').trim().slice(0,80),budget:Number(state.budgetWeekly)||0,items:items.map(i=>({id:uid(),name:i.name,category:i.category,unit:i.unit,plannedQty:numeric(i.plannedQty)||0,actualQty:numeric(i.actualQty),totalPaid:round(priceOf(i),2),store:i.store||store||'',source:i.source} ))};
  const total=round(purchase.items.reduce((s,i)=>s+i.totalPaid,0),2);
  return {purchase,total};
}
export const purchaseTotal = purchase => round((purchase.items||[]).reduce((sum,item)=>sum+(numeric(item.totalPaid)||0),0),2);
export const monthOf = date => String(date||'').slice(0,7);
export function validDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function weekRange(date){
  const [year,month,day]=String(date).split('-').map(Number);
  const d=new Date(year,month-1,day,12);
  if(!Number.isFinite(d.getTime()))throw new Error('Fecha inválida.');
  const dayIndex=(d.getDay()+6)%7;
  d.setDate(d.getDate()-dayIndex);
  const iso=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
  const start=iso(d);d.setDate(d.getDate()+6);
  return {start,end:iso(d)};
}
export function weekSummary(purchases,date){
  const {start,end}=weekRange(date);
  const selected=purchases.filter(p=>p.date>=start&&p.date<=end);
  return {start,end,count:selected.length,total:round(selected.reduce((a,p)=>a+purchaseTotal(p),0),2)};
}

export function spendingSummary(purchases,month){
  const selected=purchases.filter(p=>monthOf(p.date)===month);
  const categoryTotals=Object.fromEntries(CATEGORIES.map(c=>[c,0]));
  for(const p of selected)for(const item of p.items){const c=CATEGORIES.includes(item.category)?item.category:'Otros';categoryTotals[c]+=numeric(item.totalPaid)||0;}
  return {count:selected.length,total:round(selected.reduce((s,p)=>s+purchaseTotal(p),0),2),categories:categoryTotals};
}
const localDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export function validateBackup(raw,today=localDate()){
  if(!raw||typeof raw!=='object'||raw.schemaVersion!==1||!Array.isArray(raw.recipes)||!Array.isArray(raw.selected)||!Array.isArray(raw.shopping)||!Array.isArray(raw.purchases))throw new Error('El archivo no es un respaldo compatible de Mi Mandado Inteligente.');
  if(raw.recipes.length>2000||raw.shopping.length>3000||raw.purchases.length>10000)throw new Error('El respaldo supera los límites de seguridad.');
  const recipes=raw.recipes.map(validateRecipe);
  const budget=numeric(raw.budgetWeekly);
  if(!nonnegative(budget)||budget>1000000)throw new Error('Presupuesto inválido.');
  function safeSelected(input,available=recipes){
    if(!Array.isArray(input)||input.length>100)throw new Error('Selección de recetas inválida.');
    return input.filter(s=>s&&available.some(r=>r.id===s.recipeId)&&Number.isInteger(Number(s.times))&&Number(s.times)>=1&&Number(s.times)<=30).map(s=>{
      const result={recipeId:s.recipeId,times:Number(s.times)};
      if(Array.isArray(s.days)){const days=[...new Set(s.days.filter(d=>Number.isInteger(d)&&d>=0&&d<=6))];if(days.length===result.times)result.days=days;}
      return result;
    });
  }
  const selected=safeSelected(raw.selected);
  function safeItem(i){
    if(!i||typeof i!=='object'||!String(i.name||'').trim()||String(i.name).length>100||!UNITS.includes(i.unit))throw new Error('El respaldo tiene un producto inválido.');
    const cat=CATEGORIES.includes(i.category)?i.category:'Otros';
    return {id:String(i.id||uid()).slice(0,100),name:String(i.name).slice(0,100),category:cat,unit:i.unit,plannedQty:nonnegative(i.plannedQty)?numeric(i.plannedQty):0,actualQty:nonnegative(i.actualQty)?numeric(i.actualQty):'',unitPrice:nonnegative(i.unitPrice)?numeric(i.unitPrice):'',totalPaid:nonnegative(i.totalPaid)?numeric(i.totalPaid):'',priceMode:i.priceMode==='total'?'total':'unit',checked:!!i.checked,store:String(i.store||'').slice(0,80),source:i.source==='recipe'?'recipe':'manual',recipeIds:Array.isArray(i.recipeIds)?i.recipeIds.slice(0,80).map(String):[]};
  }
  const shopping=raw.shopping.map(safeItem);
  const purchases=raw.purchases.map(p=>{
    if(!p||!validDate(p.date)||!Array.isArray(p.items)||p.items.length>1000)throw new Error('El respaldo contiene una compra inválida.');
    return {id:String(p.id||uid()).slice(0,100),date:p.date,createdAt:Number(p.createdAt)||0,store:String(p.store||'').slice(0,80),budget:nonnegative(p.budget)?numeric(p.budget):0,items:p.items.map(i=>{
      if(!i||!String(i.name||'').trim()||!UNITS.includes(i.unit)||!positive(i.actualQty)||!nonnegative(i.totalPaid))throw new Error('Producto de compra inválido en el respaldo.');
      return {id:String(i.id||uid()).slice(0,100),name:String(i.name).slice(0,100),category:CATEGORIES.includes(i.category)?i.category:'Otros',unit:i.unit,plannedQty:nonnegative(i.plannedQty)?numeric(i.plannedQty):0,actualQty:numeric(i.actualQty),totalPaid:numeric(i.totalPaid),store:String(i.store||'').slice(0,80),source:i.source==='recipe'?'recipe':'manual'};
    })};
  });
  // v0.2 no identificaba el menú: conservar compras sin asociarlas por fecha.
  const range=weekRange(today);
  const knownIds=new Set(purchases.map(p=>p.id));
  const menuPurchaseIds=Array.isArray(raw.menuPurchaseIds)
    ? [...new Set(raw.menuPurchaseIds.filter(id=>typeof id==='string'&&knownIds.has(id)))]
    : [];
  const menuMigrationPending=raw.menuMigrationPending===true||(!Array.isArray(raw.menuPurchaseIds)&&selected.length>0&&purchases.some(p=>p.date>=range.start&&p.date<=range.end&&p.items.some(i=>i.source==='recipe')));
  const theme=['light','dark','system'].includes(raw.theme)?raw.theme:'system';
  function safePantry(input=[]){
    if(!Array.isArray(input)||input.length>3000)throw new Error('Revisión de casa inválida.');
    return input.map(i=>{if(!i||!String(i.name||'').trim()||!UNITS.includes(i.unit)||!nonnegative(i.quantity)||numeric(i.quantity)>100000)throw new Error('Cantidad de casa inválida.');return {name:String(i.name).slice(0,100),unit:i.unit,quantity:numeric(i.quantity),category:CATEGORIES.includes(i.category)?i.category:'Despensa'};});
  }
  function safePlan(p){
    if(!p||typeof p.id!=='string'||!validDate(p.startDate)||new Date(`${p.startDate}T12:00:00Z`).getUTCDay()!==1||!Array.isArray(p.shopping)||p.shopping.length>3000)throw new Error('Menú semanal inválido en el respaldo.');
    return {id:p.id.slice(0,100),name:String(p.name||'Menú semanal').slice(0,100),startDate:p.startDate,selected:safeSelected(p.selected),shopping:p.shopping.map(safeItem),pantry:safePantry(p.pantry),menuPurchaseIds:Array.isArray(p.menuPurchaseIds)?[...new Set(p.menuPurchaseIds.filter(id=>knownIds.has(id)))]:[]};
  }
  if(raw.plans!==undefined&&(!Array.isArray(raw.plans)||raw.plans.length>100))throw new Error('Biblioteca de semanas inválida.');
  if(raw.savedMenus!==undefined&&(!Array.isArray(raw.savedMenus)||raw.savedMenus.length>100))throw new Error('Biblioteca de menús inválida.');
  const plans=(raw.plans||[]).map(safePlan);
  if(new Set(plans.map(p=>p.id)).size!==plans.length)throw new Error('El respaldo repite semanas.');
  const activePlanId=plans.some(p=>p.id===raw.activePlanId)?raw.activePlanId:'';
  const savedMenus=(raw.savedMenus||[]).map(m=>{
    if(!m||typeof m.id!=='string'||!Array.isArray(m.recipes)||m.recipes.length>100)throw new Error('Menú guardado inválido.');
    const snapshots=m.recipes.map(validateRecipe);
    return {id:m.id.slice(0,100),name:String(m.name||'Menú guardado').slice(0,100),createdAt:nonnegative(m.createdAt)?numeric(m.createdAt):0,recipes:snapshots,selected:safeSelected(m.selected,snapshots)};
  });
  const pantry=safePantry(raw.pantry);
  return {plans,activePlanId,savedMenus,pantry,schemaVersion:1,budgetWeekly:budget,defaultStore:String(raw.defaultStore||'Mi tienda').slice(0,80),recipes,selected,shopping,purchases,menuPurchaseIds,menuMigrationPending,theme};
}
