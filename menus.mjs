import {uid,validDate,weekRange,validateRecipe,parseRecipePack} from './core.mjs';

const clone=value=>structuredClone(value);
const todayLocal=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export const DAYS=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
export function nextMonday(date=todayLocal()){
  if(!validDate(date))throw new Error('Fecha inválida.');
  const d=new Date(`${date}T12:00:00Z`),offset=(8-d.getUTCDay())%7||7;
  d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);
}
function planInput(input){
  const name=String(input.name||'').trim();
  if(!name||name.length>100)throw new Error('Pon un nombre al menú (hasta 100 caracteres).');
  if(!validDate(input.startDate)||new Date(`${input.startDate}T12:00:00Z`).getUTCDay()!==1)throw new Error('El menú debe empezar un lunes.');
  return {name,startDate:input.startDate};
}
export function selectionFromDays(days=[]){
  if(!Array.isArray(days)||days.length>7)throw new Error('El menú admite siete días.');
  const selected=new Map();
  days.forEach((recipeId,day)=>{
    if(!recipeId)return;
    if(typeof recipeId!=='string')throw new Error('Receta de menú inválida.');
    if(!selected.has(recipeId))selected.set(recipeId,{recipeId,times:0,days:[]});
    const entry=selected.get(recipeId);entry.times++;entry.days.push(day);
  });
  return [...selected.values()];
}
export function scheduleDays(selected=[]){
  const days=Array(7).fill('');
  for(const entry of selected)if(Array.isArray(entry.days))for(const day of entry.days)if(day>=0&&day<7&&!days[day])days[day]=entry.recipeId;
  for(const entry of selected){
    let remaining=entry.times-days.filter(id=>id===entry.recipeId).length;
    for(let day=0;day<7&&remaining>0;day++)if(!days[day]){days[day]=entry.recipeId;remaining--;}
  }
  return days;
}
export function ensurePlans(state,today=todayLocal()){
  state.plans??=[];state.savedMenus??=[];state.pantry??=[];state.habitualSums??=[];
  let plan=state.plans.find(p=>p.id===state.activePlanId);
  if(!plan){
    const startDate=state.selected.length||state.shopping.length?weekRange(today).start:nextMonday(today);
    plan={id:uid(),name:`Menú del ${startDate}`,startDate,selected:clone(state.selected),shopping:clone(state.shopping),menuPurchaseIds:clone(state.menuPurchaseIds||[]),pantry:clone(state.pantry),habitualSums:clone(state.habitualSums)};
    state.plans.push(plan);state.activePlanId=plan.id;
  }
  return plan;
}
export function syncActivePlan(state){
  const plan=state.plans?.find(p=>p.id===state.activePlanId);
  if(plan)for(const field of ['selected','shopping','menuPurchaseIds','pantry','habitualSums'])plan[field]=clone(state[field]||[]);
}
export function activatePlan(state,id){
  const plan=state.plans?.find(p=>p.id===id);
  if(!plan)throw new Error('No se encontró ese menú semanal.');
  syncActivePlan(state);state.activePlanId=id;
  for(const field of ['selected','shopping','menuPurchaseIds','pantry','habitualSums'])state[field]=clone(plan[field]||[]);
  return plan;
}
export function saveMenuTemplate(state,name){
  const checked=planInput({name,startDate:ensurePlans(state).startDate});
  if(!state.selected.length)throw new Error('Elige al menos una receta antes de guardar el menú.');
  const ids=new Set(state.selected.map(s=>s.recipeId));
  const recipes=state.recipes.filter(r=>ids.has(r.id)).map(validateRecipe);
  if(recipes.length!==ids.size)throw new Error('Falta una receta del menú.');
  const payload={name:checked.name,recipes,selected:clone(state.selected)};
  const previous=state.savedMenus.find(m=>JSON.stringify({name:m.name,recipes:m.recipes,selected:m.selected})===JSON.stringify(payload));
  if(previous)return previous;
  if(state.savedMenus.length>=100)throw new Error('La biblioteca admite hasta 100 menús.');
  const menu={id:uid(),createdAt:Date.now(),...clone(payload)};
  state.savedMenus.push(menu);return menu;
}
export function updatePlan(state,input){
  const checked=planInput(input),selected=selectionFromDays(input.days||[]);
  if(selected.some(s=>!state.recipes.some(r=>r.id===s.recipeId)))throw new Error('Una receta del menú no está en tu recetario.');
  const plan=ensurePlans(state);plan.name=checked.name;plan.startDate=checked.startDate;state.selected=selected;syncActivePlan(state);return plan;
}
export function createPlan(state,input){
  const checked=planInput(input),selected=selectionFromDays(input.days||[]);
  if(selected.some(s=>!state.recipes.some(r=>r.id===s.recipeId)))throw new Error('Una receta del menú no está en tu recetario.');
  ensurePlans(state);
  if(state.plans.length>=100)throw new Error('Puedes conservar hasta 100 semanas.');
  if(state.selected.length&&!state.savedMenus.some(m=>JSON.stringify(m.selected)===JSON.stringify(state.selected)&&m.recipes.every(r=>state.recipes.some(live=>recipeFingerprint(live)===recipeFingerprint(r)))))saveMenuTemplate(state,state.plans.find(p=>p.id===state.activePlanId).name);
  syncActivePlan(state);
  const plan={id:uid(),...checked,selected,shopping:[],menuPurchaseIds:[],pantry:[],habitualSums:[]};
  state.plans.push(plan);state.activePlanId=plan.id;
  for(const field of ['selected','shopping','menuPurchaseIds','pantry','habitualSums'])state[field]=clone(plan[field]);
  return plan;
}
function recipeFingerprint(recipe){const {id,...data}=validateRecipe(recipe);return JSON.stringify(data);}
function addSnapshots(state,recipes){
  const map=new Map();
  for(const snapshot of recipes){
    const match=state.recipes.find(r=>recipeFingerprint(r)===recipeFingerprint(snapshot));
    if(match)map.set(snapshot.id,match.id);
    else{const copied={...clone(snapshot),id:uid()};state.recipes.push(copied);map.set(snapshot.id,copied.id);}
  }
  return map;
}
export function repeatMenu(state,id,input){
  planInput(input);
  const template=state.savedMenus?.find(m=>m.id===id);
  if(!template)throw new Error('No se encontró el menú guardado.');
  const draft=clone(state),map=addSnapshots(draft,template.recipes);
  const plan=createPlan(draft,{...input,days:scheduleDays(template.selected).map(id=>map.get(id)||'')});
  draft.selected=template.selected.map(entry=>({...clone(entry),recipeId:map.get(entry.recipeId)}));syncActivePlan(draft);
  Object.assign(state,draft);return plan;
}
export function importMenuPack(state,raw){
  if(!raw||typeof raw!=='object')throw new Error('Archivo de menú inválido.');
  const input=planInput({name:raw.name,startDate:raw.startDate});
  const recipes=parseRecipePack(raw),ids=new Set(recipes.map(r=>r.id));
  if(ids.size!==recipes.length)throw new Error('El archivo de menú repite identificadores de receta.');
  const days=raw.days;
  const selected=selectionFromDays(days);
  if(!selected.length||selected.some(s=>!ids.has(s.recipeId)))throw new Error('Revisa los días y las recetas del menú importado.');
  const draft=clone(state),map=addSnapshots(draft,recipes);
  const plan=createPlan(draft,{...input,days:days.map(id=>map.get(id)||'')});
  Object.assign(state,draft);return plan;
}
