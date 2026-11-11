import {uid,round,numeric,convert,positive,sameProduct,sectionFor,safeHabituales,generateShoppingListDetailed,UNITS} from './core.mjs';
// Mis habituales: biblioteca local. Nada se agrega a la lista sin que la persona lo elija.
export const findConflict=(items,habitual)=>items.find(item=>sameProduct(item,habitual))||null;
export function itemFromHabitual(habitual){
  return {id:uid(),name:habitual.name,category:habitual.category,section:habitual.section,unit:habitual.unit,plannedQty:habitual.quantity,actualQty:'',unitPrice:'',totalPaid:'',priceMode:'unit',checked:false,store:'',source:'manual',recipeIds:[],habitualId:habitual.id};
}
// picks: [{habitual, choice, quantity?}]; `quantity` (en la unidad del habitual) vale solo para esta semana y NO cambia el habitual guardado.
// choice 'sum' | 'two' | 'skip' (obligatoria solo si el producto ya está en la lista).
// preview: la lista tal como quedaría al generarla. Si falta una respuesta, no se cambia nada.
export function applyHabitualPicks(state,picks,preview){
  const plan=picks.map(({habitual:saved,choice,quantity})=>{
    const qty=quantity===undefined?saved.quantity:numeric(quantity);
    if(!positive(qty)||qty>100000)throw new Error(`Revisa la cantidad de «${saved.name}» para esta semana.`);
    const habitual={...saved,quantity:round(qty,5)};   // copia: el habitual guardado no se toca
    const match=findConflict(preview,habitual);
    if(match&&!['sum','two','skip'].includes(choice))throw new Error(`«${habitual.name}» ya está en tu lista: elige si sumar, dejar dos renglones o no agregar.`);
    return {habitual,match,choice};
  });
  for(const {habitual,match,choice} of plan){
    if(match&&choice==='skip')continue;
    if(!match||choice==='two'){state.shopping.push(itemFromHabitual(habitual));continue;}
    if(match.source==='recipe'){
      state.habitualSums=[...(state.habitualSums||[]).filter(x=>x.habitualId!==habitual.id),{habitualId:habitual.id,name:habitual.name,quantity:habitual.quantity,unit:habitual.unit,category:habitual.category}];
    }else{
      const target=state.shopping.find(i=>i.id===match.id)||match;
      target.plannedQty=round(numeric(target.plannedQty)+convert(habitual.quantity,habitual.unit,target.unit),5);
    }
  }
  return plan.length;
}
// Guardar un producto como habitual (si ya hay uno igual, se actualiza su cantidad en vez de duplicarlo).
export function upsertHabitual(state,{name,quantity,unit,category}){
  if(!UNITS.includes(unit))throw new Error('Unidad inválida.');
  const overrides=state.sectionOverrides||{},list=state.habituales||(state.habituales=[]);
  const candidate={name,quantity,unit,category};
  const existing=list.find(h=>sameProduct(h,candidate));
  if(existing){
    const [clean]=safeHabituales([{...existing,quantity,category}],overrides);
    Object.assign(existing,{quantity:clean.quantity,category:clean.category,section:clean.section});
    return {added:false,habitual:existing};
  }
  const [clean]=safeHabituales([{...candidate,id:uid(),section:sectionFor(name,category,overrides)}],overrides);
  state.habituales=safeHabituales([...list,clean],overrides);
  return {added:true,habitual:clean};
}
// Regenera la lista del menú activo. Si una cantidad sumada de un habitual ya no tiene su ingrediente en el menú,
// se conserva como artículo independiente (una sola vez) y se devuelve en `orphans` para avisar a la persona.
export function regenerateShopping(state){
  const purchases=state.purchases.filter(p=>(state.menuPurchaseIds||[]).includes(p.id));
  const result=generateShoppingListDetailed(state.recipes,state.selected,state.shopping,purchases,state.pantry||[],state.sectionOverrides||{},state.habitualSums||[]);
  state.shopping=result.items;
  const settled=new Set(result.orphans.map(o=>o.habitualId));
  state.habitualSums=(state.habitualSums||[]).filter(x=>!settled.has(x.habitualId));
  return result.orphans;
}
