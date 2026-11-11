import {generateShoppingListDetailed,CATEGORIES,UNITS,SECTIONS,SECTION_IDS,sectionFor,safeHabituales,sameProduct,numeric,positive,nonnegative,round,money,uid,normalizedName,convert,exampleRecipes,validateRecipe,parseRecipePack,mergeRecipes,generateShoppingList,applyShoppingEdit,priceOf,unitPriceHistory,totalsForShopping,finalizePurchase,purchaseTotal,spendingSummary,weekSummary,weekRange,validateBackup,validDate,makeInitialState} from './core.mjs';
import {loadState,persistState,storageMode} from './storage.mjs';
import {ensurePlans,syncActivePlan,createPlan,updatePlan,activatePlan,saveMenuTemplate,repeatMenu,selectionFromDays,importMenuPack,nextMonday} from './menus.mjs';
import {menusView,recipeImage,planForm,nameMenuForm,repeatMenuForm,importMenuForm,pantryForm,habitualesForm} from './menu-ui.mjs';
import {findConflict,applyHabitualPicks,upsertHabitual,regenerateShopping} from './habituales.mjs';
import {cookingModel,firstScreen,limitationsHTML,utensilsHTML,prepHTML,notesHTML,stepsHTML,cookScreenHTML,changedDetailSteps,detailReviewHTML} from './cocina-ui.mjs';
import {prepareLocalImage,validateRecipeImages} from './media.mjs';
import {encodeBackup,decodeBackup} from './backup.mjs';

const systemTheme=window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme(){
  const dark=state?.theme==='dark'||(state?.theme==='system'&&systemTheme.matches);
  document.documentElement.dataset.theme=dark?'dark':'light';
  document.querySelector('meta[name="theme-color"]').content=dark?'#17201e':'#08665a';
}
systemTheme.addEventListener('change',()=>{if(state?.theme==='system')applyTheme();});
let menuExpanded=false,menuTab='menu',pendingRecipeImage='',pendingMenuPack=null,pantryItems=[],habitualPreview=[];
let state,view='inicio',searchText='',monthFilter='',saveTimer,saveQueue=Promise.resolve(),toastTimer;
const $=id=>document.getElementById(id);
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attr=escapeHTML;
const currentDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const currentMonth=()=>currentDate().slice(0,7);
const numberValue=v=>Number.isFinite(numeric(v))?numeric(v):0;
const formattedQuantity=v=>Number.isFinite(numeric(v))?String(round(numeric(v),4)):'';
// Las cantidades se muestran en g/kg; los valores y precios conservan su unidad almacenada.
function quantityView(value,unit){
  const amount=numeric(value);
  if(['kg','g'].includes(unit)&&Number.isFinite(amount)&&amount>=0){
    const kg=convert(amount,unit,'kg'),shownUnit=kg<1?'g':'kg';
    return {value:formattedQuantity(convert(amount,unit,shownUnit)),unit:shownUnit};
  }
  return {value:formattedQuantity(value),unit};
}
const amountText=(value,unit)=>{const shown=quantityView(value,unit);return `${shown.value} ${shown.unit}`;};
const priceUnit=item=>['kg','g'].includes(item.unit)?'kg':item.unit;
const shownPrice=item=>nonnegative(item.unitPrice)?formattedQuantity(numeric(item.unitPrice)*convert(1,priceUnit(item),item.unit)):item.unitPrice;
function finishQuantityInput(el,item,field){
  const shown=quantityView(nonnegative(item[field])?item[field]:item.plannedQty,item.unit);
  el.dataset.inputUnit=shown.unit;
  el.value=nonnegative(item[field])?shown.value:item[field];
  const label=el.closest('.field')?.querySelector('label');
  if(label)label.textContent=`${field==='actualQty'?'Cantidad real':'Cantidad planeada'} (${shown.unit})`;
}
function resolveMenuMigration(){
  if(!state.menuMigrationPending)return;
  const range=weekRange(currentDate());
  const candidates=state.purchases.filter(p=>p.date>=range.start&&p.date<=range.end&&p.items.some(i=>i.source==='recipe'));
  if(candidates.length&&confirm('Actualizamos tu lista del mandado. ¿Las compras de recetas de esta semana pertenecen al menú que tienes seleccionado? Aceptar: descontarlas del menú actual. Cancelar: conservarlas solo en el historial. No se borrará ninguna compra.'))state.menuPurchaseIds=candidates.map(p=>p.id);
  state.menuMigrationPending=false;saveSoon(true);
}
const optionList=(values,selected)=>values.map(x=>`<option value="${attr(x)}" ${selected===x?'selected':''}>${escapeHTML(x)}</option>`).join('');
const subtitle=(title,desc,right='')=>`<div class="section-title"><div><h2>${title}</h2>${desc?`<p>${desc}</p>`:''}</div>${right}</div>`;
const button=(label,action,kind='outline',extra='')=>`<button type="button" class="button ${kind}" data-action="${action}" ${extra}>${label}</button>`;
const nav=[['inicio','⌂','Inicio'],['recetas','♨','Menús'],['mandado','▤','Mandado'],['gastos','▥','Gastos'],['ajustes','⚙','Ajustes']];
const getRecipe=id=>state.recipes.find(r=>r.id===id);
const selectedEntry=id=>state.selected.find(s=>s.recipeId===id);
const showToast=(message,error=false,ms=4200)=>{const el=$('toast');el.textContent=message;el.className=`show${error?' error':''}`;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.className='',ms);};
const safeError=error=>showToast(error?.message||'No se pudo completar esta operación.',true);
function saveSoon(immediate=false){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{
    syncActivePlan(state);
    const snapshot=structuredClone(state);
    saveQueue=saveQueue.catch(()=>{}).then(()=>persistState(snapshot)).catch(e=>{console.error(e);safeError(new Error('No se pudo guardar. Exporta un respaldo y revisa el almacenamiento.'));});
  },immediate?0:220);
}
function updateNetwork(){const el=$('network-status');if(!el)return;el.textContent=navigator.onLine?'● En línea':'◉ Sin internet';el.className=`network-label${navigator.onLine?'':' offline'}`;}
const isNavActive=id=>view===id||(view==='super'&&id==='mandado');
function render(){
  $('page-title').textContent={inicio:'Inicio',recetas:'Menús',mandado:'Lista del mandado',super:'Estoy en el súper',gastos:'Mis gastos',ajustes:'Configuración'}[view];
  const links=nav.map(([id,icon,label])=>`<button class="nav-link ${isNavActive(id)?'active':''}" type="button" data-action="navigate" data-view="${id}" ${isNavActive(id)?'aria-current="page"':''}><span class="nav-icon">${icon}</span><span>${label}</span></button>`).join('');
  $('desktop-nav').innerHTML=links;$('mobile-nav').innerHTML=links;
  $('content').innerHTML=({inicio:homeView,recetas:recipesView,mandado:shoppingView,super:superView,gastos:expensesView,ajustes:settingsView})[view]();
  updateNetwork();
}
function go(next){view=next;window.scrollTo({top:0,behavior:'instant'});render();}
function stat(label,value,sub,emoji){return `<div class="stat"><span class="mini-icon">${emoji}</span><div class="big currency">${value}</div><div class="stat-label">${label}</div><div class="sub">${sub}</div></div>`;}
function homeView(){
  const month=spendingSummary(state.purchases,currentMonth());
  const week=weekSummary(state.purchases,currentDate());
  const shopping=totalsForShopping(state.shopping,state.purchases);
  const menu=state.selected.map(x=>getRecipe(x.recipeId)).filter(Boolean);
  return `<div class="hero"><div><p class="eyebrow" style="color:#a8ead0">TU HOGAR, MEJOR ORGANIZADO</p><h2>Comer bien y cuidar tu presupuesto puede ser sencillo.</h2><p>Planea tus comidas, lleva tu lista a la tienda y anota lo que realmente pagas, incluso sin internet.</p>${button('Ver mi mandado →','go-shopping','cream')} ${button('🛒 Estoy en el súper','go-super','cream')}</div><span class="hero-art" aria-hidden="true">🥦</span></div>
  <div class="stats">${stat('Presupuesto semanal',money(state.budgetWeekly),'Editable en Configuración','⌁')}${stat('Gastos de este mes',money(month.total),`${month.count} compras registradas`,'▥')}${stat('Gasto esta semana',money(week.total),`${week.count} compras · ${week.start} a ${week.end}`,'🛒')}</div>
  <div class="grid-2"><section class="card"><div class="row between"><h3>Menú seleccionado</h3><span class="pill">${menu.length} recetas</span></div><div class="line"></div>${menu.length?menu.map(r=>`<div class="row between" style="padding:8px 0"><span><strong>${escapeHTML(r.title)}</strong><br><small>${r.servings} porciones · ${selectedEntry(r.id)?.times||1} vez/veces</small></span><span>🍽️</span></div>`).join(''):`<p class="hint">Todavía no has elegido recetas. Selecciona algunas y crea tu lista automáticamente.</p>`}<div style="margin-top:15px">${button('Elegir mis comidas','go-recipes','outline')}</div></section>
  <section class="card"><div class="row between"><h3>Resumen del mandado</h3><span class="pill orange">${shopping.remaining} pendientes</span></div><div class="line"></div><div class="row between"><span class="muted">Comprado y anotado</span><strong>${money(shopping.paid)}</strong></div><div style="height:11px"></div><div class="row between"><span class="muted">Saldo del presupuesto</span><strong class="${state.budgetWeekly-shopping.paid<0?'warning':'success'}">${money(state.budgetWeekly-shopping.paid)}</strong></div><div style="height:13px"></div><div class="progress"><div style="width:${Math.min(100,shopping.paid/Math.max(1,state.budgetWeekly)*100)}%"></div></div><div style="margin-top:18px">${button('Abrir lista del mandado','go-shopping','primary')}</div></section></div>
  ${subtitle('Cómo comenzar','Solo necesitas estos tres pasos.')}
  <div class="grid-2"><div class="callout"><strong>1. Elige tus recetas</strong><br>Marca las comidas que deseas preparar según las porciones de cada receta. También puedes importar nuevas recetas en un archivo JSON.</div><div class="callout"><strong>2. Compra y registra</strong><br>Genera la lista, cambia gramos o kilos, apunta el precio pagado y registra la compra para consultar tus gastos.</div></div>`;
}
function recipesView(){return menusView(state,menuTab,menuExpanded)+(menuTab==='recipes'?catalogView():'');}
function catalogView(){
  const recipes=state.recipes.filter(r=>!r.archived&&normalizedName(r.title).includes(normalizedName(searchText)));
  return `<div class="callout">💡 Cuando te prepare recetas en ChatGPT, podrás importarlas desde un archivo JSON sin volver a escribir todos sus ingredientes y pasos. Los ejemplos incluidos son demostrativos.</div>
  ${subtitle('Tu recetario',`${state.recipes.filter(r=>!r.archived).length} recetas guardadas · ${state.selected.length} elegidas para esta semana`,`${button('＋ Nueva receta','new-recipe','outline')} ${button('⇧ Importar recetas','import-recipes','primary')}`)}
  <div class="toolbar" style="margin-bottom:17px"><div class="field"><label for="recipe-search">Buscar receta</label><input id="recipe-search" type="search" placeholder="Ej. pollo, nopales..." value="${attr(searchText)}"/></div>${button('Generar lista del menú','generate-list','outline')}</div>
  <div class="recipe-grid">${recipes.map(recipe=>{
    const selected=selectedEntry(recipe.id);return `<article class="recipe-card ${selected?'selected':''}"><div class="row between">${recipeImage(recipe,'catalog-photo')}<span class="pill ${selected?'':'neutral'}">${selected?'✓ En menú':'Disponible'}</span></div><div><h3>${escapeHTML(recipe.title)}</h3><p>⏱ ${recipe.minutes} min · ${recipe.servings} porciones · ${recipe.ingredients.length} ingredientes</p></div><div class="row between"><label class="toggle-line"><input type="checkbox" data-action="toggle-recipe" data-id="${attr(recipe.id)}" ${selected?'checked':''}/> Esta semana</label>${selected?`<div class="field" style="width:95px"><label>Veces</label><select data-action="recipe-times" data-id="${attr(recipe.id)}">${[1,2,3,4,5,6,7].map(n=>`<option value="${n}" ${selected.times===n?'selected':''}>${n}</option>`).join('')}</select></div>`:''}</div><div class="row wrap">${button('Ver preparación','view-recipe','outline',`data-id="${attr(recipe.id)}"`)}${button('Editar','edit-recipe','ghost sm',`data-id="${attr(recipe.id)}"`)}</div></article>`;
  }).join('')||'<div class="empty">No encontramos recetas con ese nombre.</div>'}</div>`;
}
function shoppingView(){
  const summary=totalsForShopping(state.shopping,state.purchases);
  return `<div class="callout">🧾 <strong>Receta ≠ compra real.</strong> Aquí ajustas lo que pediste, lo que efectivamente recibiste y cuánto pagaste. La receta original no se modifica. Los pesos menores a un kilo se muestran en gramos y el precio se captura por kilo. Al regenerar descontamos las compras registradas de este menú.</div>
  <div class="stats">${stat('Presupuesto',money(state.budgetWeekly),'Límite orientativo','⌁')}${stat('Total marcado',`<span id="shopping-marked">${money(summary.paid)}</span>`,'Lo pagado por productos marcados','▤')}${stat('Disponible',`<span id="shopping-available">${money(state.budgetWeekly-summary.paid)}</span>`,`${summary.boughtCount} de ${state.shopping.length} comprados`,'✓')}</div>
  ${subtitle('Lista del menú',`${escapeHTML(state.plans.find(p=>p.id===state.activePlanId)?.name||'Menú seleccionado')} · ${state.shopping.length} productos. Ajusta la cantidad y el precio real en la tienda.`,`${button('🛒 Estoy en el súper','go-super','primary')} ${button('★ Mis habituales','open-habituales','outline')} ${button('↻ Desde mis recetas','generate-list','outline')} ${button('＋ Agregar artículo','add-item','primary')}`)}
  <div class="row between wrap" style="margin:-5px 0 16px"><p class="hint" style="margin:0">Estimado según precios de compras anteriores: <strong>${money(summary.estimate)}</strong> (sin precio previo: no contabilizado).</p>${button('Empezar una semana nueva','new-week','ghost sm')}</div>
  ${!state.shopping.length?`<div class="empty"><div class="emoji">🛒</div><h3>Tu lista está vacía</h3><p>Ya cubriste el menú o aún no has elegido recetas. Puedes agregar artículos o empezar una semana nueva.</p>${button('Seleccionar recetas','go-recipes','primary')}</div>`:
  `<div class="shopping-list">${shoppingSections()}</div>
  <div class="card" style="margin-top:18px"><div class="row between wrap"><div><h3>Total registrado: <span id="shopping-paid">${money(summary.paid)}</span></h3><p class="hint" id="shopping-remaining">Restante del presupuesto: ${money(state.budgetWeekly-summary.paid)}</p></div>${button('✓ Registrar compra','finalize-shopping','primary')}</div><div class="line"></div><p class="hint">Solo se guardarán en el historial los artículos marcados como comprados y con cantidad y precio reales. Los pendientes permanecerán en tu lista.</p></div>`}
  <div class="callout warn" style="margin-top:16px">Los precios reales no se consultan automáticamente en tiendas: tú los capturas con el ticket o en la tienda. La próxima vez utilizaremos tu último precio registrado como referencia.</div>`;
}
const sectionOf=item=>SECTION_IDS.includes(item.section)?item.section:sectionFor(item.name,item.category,state.sectionOverrides||{});
function shoppingSections(){
  return SECTIONS.map(section=>({section,items:state.shopping.filter(i=>sectionOf(i)===section.id)})).filter(g=>g.items.length).map(({section,items})=>{
    const pending=items.filter(i=>!i.checked).length;
    return `<section class="shopping-section" data-section="${section.id}"><h3 class="section-head"><span>${escapeHTML(section.label)}</span><span class="section-count">${pending?`${pending} pendiente${pending===1?'':'s'}`:'Todo comprado'}</span></h3>${items.map(renderShoppingItem).join('')}</section>`;
  }).join('');
}
function renderShoppingItem(item){
  const lastPrice=unitPriceHistory(state.purchases,item);
  const price=priceOf(item);
  const planned=numberValue(item.plannedQty),actual=numberValue(item.actualQty);
  const extra=actual>0?round(actual-planned,4):0;
  const plannedView=quantityView(item.plannedQty,item.unit);
  const actualView=quantityView(nonnegative(item.actualQty)?item.actualQty:item.plannedQty,item.unit);
  return `<article class="shopping-item ${item.checked?'done':''}" data-shopping-row="${attr(item.id)}"><div class="shopping-heading"><div class="left"><input type="checkbox" aria-label="Marcar ${attr(item.name)} como comprado" data-action="check-item" data-id="${attr(item.id)}" ${item.checked?'checked':''}/><div><div class="name">${escapeHTML(item.name)}</div><div class="small">${escapeHTML(item.category)} · ${item.habitualId?'De mis habituales':item.source==='manual'?'Agregado por ti':'Desde receta'}</div></div></div>${button('Quitar','delete-item','ghost sm',`data-id="${attr(item.id)}" aria-label="Quitar ${attr(item.name)}"`)}</div>
  <div class="edit-grid"><div class="field"><label>Cantidad planeada (${plannedView.unit})</label><input type="text" inputmode="decimal" data-item-field="plannedQty" data-input-unit="${plannedView.unit}" data-id="${attr(item.id)}" aria-label="Cantidad planeada de ${attr(item.name)}" value="${attr(plannedView.value)}"/></div>
  <div class="field"><label>Cantidad real (${actualView.unit})</label><input type="text" inputmode="decimal" placeholder="Ej. 1,300" data-item-field="actualQty" data-input-unit="${actualView.unit}" data-id="${attr(item.id)}" aria-label="Cantidad comprada de ${attr(item.name)}" value="${attr(nonnegative(item.actualQty)?actualView.value:item.actualQty)}"/></div>
  <div class="field"><label>Precio por ${priceUnit(item)} ($)</label><input type="text" inputmode="decimal" placeholder="Ej. 120" data-item-field="unitPrice" data-id="${attr(item.id)}" aria-label="Precio por ${priceUnit(item)} de ${attr(item.name)}" value="${attr(shownPrice(item))}"/></div>
  <div class="field"><label>Total pagado ($)</label><input type="text" inputmode="decimal" placeholder="Ej. 156" data-item-field="totalPaid" data-id="${attr(item.id)}" aria-label="Total pagado por ${attr(item.name)}" value="${attr(item.totalPaid)}"/></div></div>
  <div class="field section-field"><label>Sección del súper</label><select data-item-section data-id="${attr(item.id)}" aria-label="Sección del súper de ${attr(item.name)}">${SECTIONS.map(s=>`<option value="${s.id}" ${s.id===sectionOf(item)?'selected':''}>${escapeHTML(s.label)}</option>`).join('')}</select></div>${item.source==='manual'&&!(state.habituales||[]).some(h=>sameProduct(h,item))?`<div>${button('★ Guardar como habitual','save-habitual','ghost sm',`data-id="${attr(item.id)}"`)}</div>`:''}
  <div class="item-footer"><span>${Number.isFinite(lastPrice)?`Último precio: ${money(lastPrice*convert(1,priceUnit(item),item.unit))}/${escapeHTML(priceUnit(item))} · `:''}<span data-extra="${attr(item.id)}">${actual>planned?`Compraste ${amountText(extra,item.unit)} extra`:actual>0&&actual<planned?'Compraste menos de lo planeado':'Cantidad editable'}</span></span><strong data-item-total="${attr(item.id)}">${Number.isFinite(price)?money(price):'Sin precio real'}</strong></div></article>`;
}
function expensesView(){
  const months=[...new Set([currentMonth(),...state.purchases.map(x=>x.date.slice(0,7))])].sort().reverse();
  if(!monthFilter || !months.includes(monthFilter))monthFilter=currentMonth();
  const overview=spendingSummary(state.purchases,monthFilter);
  const thisWeek=weekSummary(state.purchases,currentDate());
  const purchases=state.purchases.filter(x=>x.date.slice(0,7)===monthFilter).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt-a.createdAt);
  const max=Math.max(1,...Object.values(overview.categories));
  return `${subtitle('Tu historial de compras','Cada compra queda guardada con sus cantidades y precios reales.',button('↓ Descargar CSV','export-csv','outline'))}
  <div class="toolbar"><div class="field"><label for="month-filter">Mes que quieres consultar</label><select id="month-filter">${months.map(m=>`<option value="${m}" ${m===monthFilter?'selected':''}>${m}</option>`).join('')}</select></div></div>
  <div class="stats">${stat('Total del mes',money(overview.total),`${overview.count} compras registradas`,'▥')}${stat('Alimentos',money(Object.entries(overview.categories).filter(([k])=>!['Limpieza','Higiene','Otros'].includes(k)).reduce((a,[,v])=>a+v,0)),'Categorías de comida','🥦')}${stat('Hogar y otros',money(['Limpieza','Higiene','Otros'].reduce((a,k)=>a+overview.categories[k],0)),'Limpieza, higiene y otros','⌂')}</div>
  <div class="grid-2"><section class="card"><h3>Gasto por categoría</h3><div class="line"></div>${Object.entries(overview.categories).filter(([,sum])=>sum>0).sort((a,b)=>b[1]-a[1]).map(([category,sum])=>`<div class="category-bar"><span>${escapeHTML(category)}</span><div class="track"><div class="fill" style="width:${Math.round(sum/max*100)}%"></div></div><strong>${money(sum)}</strong></div>`).join('')||'<p class="hint">Registra tu primera compra para ver las categorías.</p>'}</section>
  <section class="card"><h3>Resumen del mes</h3><div class="line"></div><div class="row between"><span class="muted">Gasto de esta semana</span><strong>${money(thisWeek.total)}</strong></div><p class="hint">${thisWeek.start} al ${thisWeek.end} · ${thisWeek.count} compras</p><div class="line"></div><div class="row between"><span class="muted">Visitas a la tienda</span><strong>${overview.count}</strong></div><div class="line"></div><div class="row between"><span class="muted">Gasto promedio por visita</span><strong>${money(overview.count?overview.total/overview.count:0)}</strong></div><div class="line"></div><p class="hint">Los precios históricos se calculan a partir de los productos que registras. No se inventan ni se consultan precios de tiendas automáticamente.</p></section></div>
  ${subtitle('Compras guardadas','Toca cualquier compra para revisar su ticket y corregir importes.')}
  <div class="stack">${purchases.map(p=>`<details class="purchase"><summary class="row between"><div><strong>${escapeHTML(p.store||'Tienda sin nombre')}</strong><div class="hint">${escapeHTML(p.date)} · ${p.items.length} artículos · ${money(purchaseTotal(p))}</div></div><span aria-hidden="true">⌄</span></summary><table class="purchase-items"><thead><tr><th>Artículo</th><th>Cantidad</th><th>Pagado</th></tr></thead><tbody>${p.items.map(i=>`<tr><td>${escapeHTML(i.name)}<br><small>${escapeHTML(i.category)}</small></td><td>${amountText(i.actualQty,i.unit)}</td><td>${money(i.totalPaid)}</td></tr>`).join('')}</tbody></table><div class="row wrap">${button('Corregir compra','edit-purchase','outline sm',`data-id="${attr(p.id)}"`)}${button('Eliminar','delete-purchase','danger sm',`data-id="${attr(p.id)}"`)}</div></details>`).join('')||'<div class="empty"><div class="emoji">📒</div><h3>Sin compras registradas en este mes</h3><p>Cuando termines una compra en «Mandado», aparecerá aquí.</p></div>'}</div>`;
}
function settingsView(){
  return `${subtitle('Tus preferencias','Estos datos se guardan solo en este dispositivo.')}
  <div class="grid-2"><section class="card"><h3>Presupuesto y tienda</h3><div class="line"></div><form id="settings-form" class="stack"><div class="field"><label for="budget">Presupuesto semanal (MXN)</label><input id="budget" name="budget" type="number" min="0" step="0.01" required value="${attr(state.budgetWeekly)}"/></div><div class="field"><label for="default-store">Tienda por defecto</label><input id="default-store" name="store" maxlength="80" value="${attr(state.defaultStore)}"/></div><button class="button primary" type="submit">Guardar preferencias</button></form></section>
  <section class="card"><h3>Respaldo de tus datos</h3><div class="line"></div><p class="hint">Descarga un respaldo completo en JSON. Si cambias de celular o borras el navegador, podrás restaurarlo.</p><div class="stack">${button('↓ Descargar respaldo','export-backup','primary')}${button('↑ Restaurar respaldo','restore-backup','outline')}${button('↓ Exportar gastos a CSV','export-csv','outline')}</div></section></div>
  <section class="card" style="margin-top:18px"><h3>Aspecto de la aplicación</h3><p class="hint">Elige el aspecto que te resulte más cómodo. Se guarda solo en este dispositivo.</p><div class="field"><label for="theme-choice">Apariencia</label><select id="theme-choice"><option value="system" ${state.theme==='system'?'selected':''}>Como el celular</option><option value="light" ${state.theme==='light'?'selected':''}>Claro</option><option value="dark" ${state.theme==='dark'?'selected':''}>Oscuro</option></select></div></section>
  ${subtitle('Cómo funciona sin internet','Primero abre la aplicación con internet al menos una vez.')}
  <div class="grid-2"><div class="callout"><strong>📴 Trabajo sin conexión</strong><br>La interfaz se guarda en el dispositivo cuando se instala el servicio offline. Las recetas, el mandado y los gastos se almacenan localmente. No hace falta conexión para modificarlos.</div><div class="callout"><strong>🔒 Tu información</strong><br>No enviamos tus tickets ni tus recetas a ningún servidor. En esta versión no hay cuentas ni sincronización entre equipos. Haz respaldos regularmente.</div></div>
  <div class="callout warn" style="margin-top:20px"><strong>⚕️ Sobre las recetas</strong><br>Las recetas incluidas son ejemplos generales. Puedes cambiar ingredientes, porciones y pasos según tus preferencias.</div>
  <p class="hint app-version" style="margin-top:22px">Versión 0.5 · Datos en tu dispositivo</p>
  <div style="margin-top:22px">${button('Borrar todos los datos de esta app','reset-data','danger sm')}</div>`;
}
function openModal(content,cls=''){$('modal-content').innerHTML=content;$('modal').className=cls;if(!$('modal').open)$('modal').showModal();}
function closeModal(){if($('modal').open)$('modal').close();$('modal-content').innerHTML='';$('modal').className='';}
function modalTitle(title,description=''){return `<div class="modal-heading"><div><h2>${title}</h2>${description?`<p class="hint" style="margin:6px 0 0">${description}</p>`:''}</div><button type="button" class="icon-close" data-action="close-modal" aria-label="Cerrar">×</button></div>`;}
// Modo «Cocinar paso a paso»: el paso actual se recuerda solo mientras la app está abierta (no se guarda en el dispositivo).
const cookSteps=new Map();
const cookHelpers={esc:escapeHTML,amountText,button};
function openCook(id,index){
  const r=getRecipe(id);if(!r)return;
  const model=cookingModel(r),min=firstScreen(model);
  const screen=Math.min(model.steps.length-1,Math.max(min,Number.isInteger(index)?index:min));
  cookSteps.set(id,screen);
  openModal(cookScreenHTML(model,screen,cookHelpers,id),'cooking');
}
function showRecipe(id){
  const r=getRecipe(id);if(!r)return;
  const model=cookingModel(r),saved=cookSteps.get(id);
  const label=saved===undefined?'▶ Cocinar paso a paso':`▶ Continuar: ${saved<0?'antes de empezar':`paso ${saved+1} de ${model.steps.length}`}`;
  openModal(`${modalTitle('Tu receta')}<div class="recipe-details">${r.image?`${recipeImage(r,'recipe-photo')}<p class="image-caption">Imagen ilustrativa</p>`:''}<h2 class="recipe-name">${escapeHTML(r.title)}</h2><div class="recipe-meta"><span>◷ ${r.minutes} minutos</span><span>${r.servings} porciones</span>${button('Ir a la preparación','show-steps','ghost sm')}</div><div class="row wrap cook-entry">${button(label,'cook-start','primary',`data-id="${attr(r.id)}"`)}${saved===undefined?'':button('Empezar de nuevo','cook-restart','ghost sm',`data-id="${attr(r.id)}"`)}</div>${limitationsHTML(model,cookHelpers)}${utensilsHTML(model,cookHelpers)}${prepHTML(model,cookHelpers)}<section class="recipe-ingredients"><h3>Ingredientes</h3><p class="hint">Para ${r.servings} porciones</p><ul class="ingredient-list">${r.ingredients.map(i=>`<li><strong>${escapeHTML(i.name)}</strong><span>${amountText(i.quantity,i.unit)}</span></li>`).join('')}</ul></section><section id="recipe-steps" class="recipe-preparation" tabindex="-1"><h3>Preparación paso a paso</h3><p class="hint">Sigue cada bloque en orden.</p><ol class="prep-list">${stepsHTML(model,cookHelpers)}</ol></section>${notesHTML(model,cookHelpers)}<div class="row wrap">${button('Editar esta receta','edit-recipe','outline',`data-id="${attr(r.id)}"`)}${button('Cerrar','close-modal','ghost')}</div></div>`);
}
function ingredientRow(i={name:'',quantity:1,unit:'kg',category:'Verduras y frutas'}){
  const shown=quantityView(i.quantity,i.unit);i={...i,quantity:shown.value,unit:shown.unit};
  return `<div class="ingredient-editor"><input aria-label="Ingrediente" placeholder="Ingrediente" data-ingredient="name" maxlength="90" required value="${attr(i.name)}"/><input aria-label="Cantidad" type="text" inputmode="decimal" data-ingredient="quantity" placeholder="1" required value="${attr(i.quantity)}"/><select aria-label="Unidad" data-ingredient="unit">${optionList(UNITS,i.unit)}</select><select class="category-field" aria-label="Categoría" data-ingredient="category">${optionList(CATEGORIES,i.category)}</select><button type="button" data-action="remove-ingredient-row" aria-label="Quitar ingrediente">×</button></div>`;
}
function editRecipe(id,draft=null){
  const saved=id?getRecipe(id):null,r=saved&&draft?{...saved,...draft}:saved;
  if(!draft)pendingRecipeImage=saved?.image||'';
  openModal(`${modalTitle(r?'Editar receta':'Nueva receta','La cantidad de la receta es independiente de lo que compras en la tienda.')}
  <form id="recipe-form" class="stack" data-id="${attr(r?.id||'')}"><div class="form-row"><div class="field"><label>Nombre</label><input name="title" maxlength="120" required placeholder="Ej. Pollo con verduras" value="${attr(r?.title||'')}"/></div><div class="field"><label>Porciones</label><input name="servings" type="number" min="1" max="50" required value="${r?.servings||3}"/></div></div>
  <div class="field"><label for="recipe-image-input">Imagen de la receta</label><div id="recipe-image-preview">${r?.image?recipeImage(r,'edit-photo'):''}</div><input id="recipe-image-input" type="file" accept="image/png,image/jpeg,image/webp"/><small class="hint">Se optimiza y guarda en este dispositivo. También puedes importar la receta con su imagen.</small>${button('Quitar imagen','remove-recipe-image','ghost sm')}</div>
  <div class="field"><label>Tiempo aproximado (minutos)</label><input name="minutes" type="number" min="0" value="${r?.minutes||30}"/></div>
  <div><h3>Ingredientes</h3><p class="hint">Puedes usar kg, g, l, ml, piezas o paquetes. Cada artículo lleva su categoría.</p><div class="ingredient-editor ingredient-editor-head"><strong>Nombre</strong><strong>Cantidad</strong><strong>Unidad</strong><strong>Categoría</strong></div><div id="ingredient-rows">${(r?.ingredients||[{name:'',quantity:1,unit:'kg',category:'Verduras y frutas'}]).map(ingredientRow).join('')}</div>${button('＋ Otro ingrediente','add-ingredient-row','outline sm')}</div>
  <div class="field"><label>Preparación (un paso por línea)</label><textarea name="steps" required rows="7" placeholder="Lava las verduras.&#10;Corta los ingredientes.&#10;Cocina y sirve.">${escapeHTML(r?.steps.join('\n')||'')}</textarea>${r?.stepDetails?'<small class="hint">Esta receta tiene detalles por paso (cantidades, fuego, tiempo, comprobaciones). Si cambias el texto de uno de esos pasos o la cantidad de pasos, te pediremos revisarlos antes de guardar.</small>':''}</div>
  <div class="row wrap"><button class="button primary" type="submit">Guardar receta</button>${r?button('Eliminar receta','delete-recipe','danger',`data-id="${attr(r.id)}"`):''}</div></form>`);
}
function addItem(){
  openModal(`${modalTitle('Agregar artículo al mandado','Puedes agregar alimentos, limpieza, higiene y todo lo que necesites.')}
  <form id="manual-item-form" class="stack"><div class="field"><label>Nombre del artículo</label><input name="name" required maxlength="90" placeholder="Ej. Detergente"/></div><div class="form-row"><div class="field"><label>Cantidad planeada</label><input name="plannedQty" type="text" inputmode="decimal" required value="1"/></div><div class="field"><label>Unidad</label><select name="unit">${optionList(UNITS,'pza')}</select></div></div><div class="field"><label>Categoría</label><select name="category">${optionList(CATEGORIES,'Limpieza')}</select></div><label class="toggle-line"><input type="checkbox" name="saveHabitual"/> Guardar como habitual para elegirlo otras semanas</label><button class="button primary" type="submit">Agregar a la lista</button></form>`);
}
function startCheckout(){
  const chosen=state.shopping.filter(i=>i.checked);
  if(!chosen.length){showToast('Marca al menos un producto como comprado.',true);return;}
  try{finalizePurchase(state,currentDate(),state.defaultStore);}catch(e){safeError(e);return;}
  const amount=chosen.reduce((sum,i)=>sum+priceOf(i),0);
  openModal(`${modalTitle('Registrar esta compra',`${chosen.length} artículos · ${money(amount)} pagados`)}<form id="checkout-form" class="stack"><div class="field"><label>Fecha de la compra</label><input type="date" name="date" value="${currentDate()}" required/></div><div class="field"><label>Tienda principal</label><input type="text" name="store" value="${attr(state.defaultStore)}" maxlength="80" required/></div><div class="callout">Los artículos marcados se guardarán en el historial. Los que no compraste seguirán en la lista. No se descontarán del inventario automáticamente: el excedente calculado es una diferencia de compra, no una medición de lo que ya cocinaste.</div><button type="submit" class="button primary block">Confirmar y guardar la compra</button></form>`);
}
function editPurchase(id){
  const p=state.purchases.find(x=>x.id===id);if(!p)return;
  openModal(`${modalTitle('Corregir compra',`${escapeHTML(p.store)} · ${escapeHTML(p.date)}`)}<form id="purchase-edit-form" data-id="${attr(p.id)}" class="stack"><div class="field"><label>Fecha</label><input type="date" name="date" value="${attr(p.date)}" required/></div><div class="field"><label>Tienda principal</label><input name="store" value="${attr(p.store)}" maxlength="80"/></div><div class="line"></div>${p.items.map((i,j)=>`<div class="card" style="padding:12px"><strong>${escapeHTML(i.name)}</strong><p class="hint">Precio y cantidad reales del ticket</p><div class="form-row"><div class="field"><label>Cantidad (${quantityView(i.actualQty,i.unit).unit})</label><input data-purchase-quantity="${j}" data-input-unit="${quantityView(i.actualQty,i.unit).unit}" type="text" inputmode="decimal" value="${quantityView(i.actualQty,i.unit).value}"/></div><div class="field"><label>Total pagado ($)</label><input data-purchase-total="${j}" type="text" inputmode="decimal" value="${attr(i.totalPaid)}"/></div></div></div>`).join('')}<button type="submit" class="button primary">Guardar correcciones</button></form>`);
}
function downloadFile(text,filename,mime='application/json'){
  const blob=new Blob([text],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function exportBackup(){syncActivePlan(state);downloadFile(encodeBackup(state),`respaldo-mi-mandado-${currentDate()}.json`);showToast('Respaldo generado. Guárdalo en un lugar seguro.');}
function exportCSV(){
  const rows=[['Fecha','Tienda principal','Tienda artículo','Artículo','Categoría','Cantidad','Unidad','Total MXN']];
  for(const p of state.purchases)for(const i of p.items)rows.push([p.date,p.store,i.store||p.store,i.name,i.category,i.actualQty,i.unit,i.totalPaid]);
  const csv='\uFEFF'+rows.map(row=>row.map(cell=>`"${String(cell??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
  downloadFile(csv,`gastos-mi-mandado-${currentDate()}.csv`,'text/csv;charset=utf-8');showToast('CSV de gastos exportado.');
}
async function readJSON(file,limit=5_000_000){if(!file||file.size>limit)throw new Error(`El archivo debe ser JSON y pesar menos de ${Math.round(limit/1_000_000)} MB.`);try{return JSON.parse(await file.text());}catch{throw new Error('No se pudo leer el JSON. Revisa el formato.');}}
function updateShoppingNumbers(){
  const totals=totalsForShopping(state.shopping,state.purchases);
  if($('shopping-marked'))$('shopping-marked').textContent=money(totals.paid);
  if($('shopping-available'))$('shopping-available').textContent=money(state.budgetWeekly-totals.paid);
  if($('shopping-paid'))$('shopping-paid').textContent=money(totals.paid);
  if($('shopping-remaining'))$('shopping-remaining').textContent=`Restante del presupuesto: ${money(state.budgetWeekly-totals.paid)}`;
}
function updateItemFromInput(el){
  const item=state.shopping.find(x=>x.id===el.dataset.id);if(!item)return;
  const field=el.dataset.itemField;
  let text=el.value.trim();
  if(['plannedQty','actualQty'].includes(field)&&Number.isFinite(numeric(text)))text=String(convert(numeric(text),el.dataset.inputUnit||item.unit,item.unit));
  if(field==='unitPrice'&&Number.isFinite(numeric(text)))text=String(numeric(text)*convert(1,item.unit,priceUnit(item)));
  if(!['plannedQty','actualQty','unitPrice','totalPaid'].includes(field))return;
  applyShoppingEdit(item,field,text);
  const row=el.closest('.shopping-item');
  for(const f of ['unitPrice','totalPaid'])if(f!==field){const target=row?.querySelector(`[data-item-field="${f}"]`);if(target)target.value=f==='unitPrice'?shownPrice(item):item[f];}
  const target=row?.querySelector('[data-item-total]');if(target)target.textContent=Number.isFinite(priceOf(item))?money(priceOf(item)):'Sin precio real';
  const extra=row?.querySelector('[data-extra]');
  if(extra){const actual=numberValue(item.actualQty),planned=numberValue(item.plannedQty);extra.textContent=actual>planned?`Compraste ${amountText(actual-planned,item.unit)} extra`:actual>0&&actual<planned?'Compraste menos de lo planeado':'Cantidad editable';}
  updateShoppingNumbers();saveSoon();
}
function createShopping(){
  if(!state.selected.length&&!(state.habitualSums||[]).length){showToast('Primero elige una o más recetas.',true);menuTab='recipes';go('recetas');return;}
  if(state.shopping.some(x=>x.checked) && !confirm('Hay artículos marcados como comprados. ¿Quieres recalcular el menú? Se conservarán los precios de productos coincidentes, pero se descontarán las compras registradas del menú actual.'))return;
  const orphans=regenerateShopping(state);
  const notes=orphans.map(o=>o.kept?`«${o.name}» ya no está en el menú: conservamos ${amountText(o.remaining,o.unit)} que sumaste de tus habituales como artículo aparte.`:`«${o.name}» ya no está en el menú y lo que sumaste de tus habituales ya estaba cubierto con tus compras o lo que tienes en casa; no se agregó.`);
  saveSoon(true);go('mandado');showToast(['Lista actualizada: solo falta lo pendiente. Los artículos manuales se conservaron.',...notes].join(' '),false,notes.length?9000:4200);
}
let detailReview=null;   // edición en espera de que se revisen los detalles de los pasos cuyo texto cambió
function readRecipeForm(form){
  const ingredientRows=[...form.querySelectorAll('#ingredient-rows .ingredient-editor')];
  if(!ingredientRows.length)throw new Error('Agrega por lo menos un ingrediente.');
  return {id:form.dataset.id,image:pendingRecipeImage,title:form.elements.title.value,servings:form.elements.servings.value,minutes:form.elements.minutes.value,
    ingredients:ingredientRows.map(row=>Object.fromEntries(['name','quantity','unit','category'].map(k=>[k,row.querySelector(`[data-ingredient="${k}"]`)?.value]))),
    steps:form.elements.steps.value.split('\n').map(s=>s.trim()).filter(Boolean)};
}
function commitRecipe(current,values,keep){
  const r=validateRecipe({image:values.image,id:current?.id||uid(),title:values.title,servings:values.servings,minutes:values.minutes,ingredients:values.ingredients,steps:values.steps,tags:current?.tags||[],...keep});
  if(current){for(const key of ['utensils','prep','notes','limitations','stepDetails'])if(!(key in r))delete current[key];Object.assign(current,r);cookSteps.delete(current.id);showToast('Receta actualizada.');}
  else{state.recipes.push(r);showToast('Receta agregada.');}
  saveSoon(true);closeModal();menuTab='recipes';go('recetas');
}
function saveRecipeFromForm(form){
  const values=readRecipeForm(form),current=values.id?getRecipe(values.id):null;
  // Los detalles opcionales (utensilios, preparación previa, notas, límites y detalles por paso) no se pierden al editar el texto.
  const keep={};
  if(current){
    for(const key of ['utensils','prep','notes','limitations'])if(current[key])keep[key]=current[key];
    if(current.stepDetails){
      if(values.steps.length!==current.steps.length){
        if(!confirm('Cambiaste la cantidad de pasos. Los detalles de cada paso (cantidades, fuego, tiempo, comprobaciones) ya no coincidirían y se quitarían. ¿Continuar?'))return;
      }else{
        // Si cambió el texto de un paso con detalles, no se conservan ni se borran en silencio: la persona los revisa antes de guardar.
        const changed=changedDetailSteps(current,values.steps);
        if(changed.length){detailReview={id:current.id,values,changed};openDetailReview();return;}
        keep.stepDetails=current.stepDetails;
      }
    }
  }
  commitRecipe(current,values,keep);
}
function openDetailReview(){
  const current=getRecipe(detailReview.id);if(!current)return;
  openModal(`${modalTitle('Revisar los detalles de los pasos','Cambiaste el texto de pasos que tienen detalles.')}${detailReviewHTML(cookingModel(current),detailReview.changed,detailReview.values.steps,cookHelpers)}`);
}
function deleteRecipe(id){
  const r=getRecipe(id);if(!r)return;
  const used=state.selected.some(e=>e.recipeId===id)||state.plans.some(p=>p.selected.some(e=>e.recipeId===id));
  if(!confirm(used?`¿Quitar «${r.title}» del recetario? Se conservará en los menús que ya la utilizan.`:`¿Eliminar la receta «${r.title}» del recetario?`))return;
  if(used)r.archived=true;
  else state.recipes=state.recipes.filter(x=>x.id!==id);
  saveSoon(true);closeModal();render();showToast(used?'Receta retirada del recetario; tus menús anteriores la conservan.':'Receta eliminada.');
}
function showPlanForm(edit=false){openModal(`${modalTitle(edit?'Editar menú semanal':'Preparar un menú nuevo')}${planForm(state,edit)}`);}
function reviewPantry(){
  if(!state.selected.length){showToast('Elige recetas para preparar tu menú.',true);menuTab='recipes';go('recetas');return;}
  pantryItems=generateShoppingList(state.recipes,state.selected);
  openModal(`${modalTitle('Revisar lo que tengo en casa','Solo se descontará lo que indiques para este menú.')}${pantryForm(pantryItems,state.pantry||[],amountText)}`);
}
function openHabituales(){
  const list=state.habituales||[];
  habitualPreview=generateShoppingListDetailed(state.recipes,state.selected,state.shopping,state.purchases.filter(p=>state.menuPurchaseIds.includes(p.id)),state.pantry||[],state.sectionOverrides||{},state.habitualSums||[]).items;
  const conflicts=list.map(h=>findConflict(habitualPreview,h));
  openModal(`${modalTitle('Mis habituales','Productos que guardaste para elegir cada semana.')}${habitualesForm(list,conflicts,amountText,id=>SECTIONS.find(s=>s.id===id)?.label||'Otros')}`);
}
function habitualRow(h){return ingredientRow(h).replace('class="ingredient-editor"',`class="ingredient-editor" data-hid="${attr(h.id)}"`);}
function editHabituales(){
  const list=state.habituales||[];
  openModal(`${modalTitle('Editar mis habituales','Cambia, agrega o quita productos. Esto no modifica tu lista actual.')}<form id="habituales-manager-form" class="stack"><div class="ingredient-editor ingredient-editor-head"><strong>Nombre</strong><strong>Cantidad</strong><strong>Unidad</strong><strong>Categoría</strong></div><div id="ingredient-rows" data-allow-empty="1">${list.map(habitualRow).join('')}</div>${button('＋ Otro producto','add-ingredient-row','outline sm')}<button class="button primary" type="submit">Guardar mis habituales</button></form>`);
}
function afterHabituales(count){
  if(state.selected.length){createShopping();return;}
  saveSoon(true);go('mandado');showToast(count?'Productos agregados a tu lista.':'No elegiste productos.');
}
// ---------- Modo «Estoy en el súper» ----------
let superEditId=null,superReturnReview=false;
function renderKeepScroll(){const y=window.scrollY;render();window.scrollTo({top:y,behavior:'instant'});}
function missingData(item){
  const missing=[];
  if(!(numberValue(item.actualQty)>0))missing.push('cantidad real');
  if(!Number.isFinite(priceOf(item)))missing.push('precio');
  return missing;
}
function superRow(item){
  const price=priceOf(item),actual=numberValue(item.actualQty);
  const missing=item.checked?missingData(item):[];
  const detail=[amountText(item.plannedQty,item.unit)];
  if(actual>0)detail.push(`real ${amountText(item.actualQty,item.unit)}`);
  if(Number.isFinite(price))detail.push(money(price));
  return `<div class="super-row ${item.checked?'done':''}" data-super-row="${attr(item.id)}"><input type="checkbox" class="super-check" aria-label="${item.checked?'Desmarcar':'Marcar'} ${attr(item.name)} como comprado" data-action="check-item" data-id="${attr(item.id)}" ${item.checked?'checked':''}/><button type="button" class="super-info" data-action="super-edit" data-id="${attr(item.id)}" aria-label="Editar cantidad y precio de ${attr(item.name)}"><span class="super-name">${escapeHTML(item.name)}</span><span class="super-qty">${escapeHTML(detail.join(' · '))}</span>${missing.length?`<span class="super-missing">Falta ${missing.join(' y ')}</span>`:''}</button></div>`;
}
function superView(){
  const pending=state.shopping.filter(i=>!i.checked),bought=state.shopping.filter(i=>i.checked);
  if(!state.shopping.length)return `<div class="empty"><div class="emoji">🛒</div><h3>Tu lista está vacía</h3><p>Genera tu lista desde el menú o agrega artículos.</p>${button('Ir al mandado','super-back','primary')}</div>`;
  const totals=totalsForShopping(state.shopping,state.purchases);
  const groups=SECTIONS.map(section=>({section,items:pending.filter(i=>sectionOf(i)===section.id)})).filter(g=>g.items.length);
  const folded=state.prefs?.purchasedFolded!==false;
  return `<div class="super"><div class="super-top"><div><strong>${pending.length} pendiente${pending.length===1?'':'s'}</strong><span class="muted"> · ${bought.length} comprado${bought.length===1?'':'s'}</span></div>${button('Lista completa','super-back','ghost sm')}</div>
  <p class="hint">Marca lo que ya llevas. Toca el nombre para anotar cantidad y precio.</p>
  ${groups.map(({section,items})=>`<section class="super-section" data-super-section="${section.id}"><h3 class="section-head"><span>${escapeHTML(section.label)}</span><span class="section-count">${items.length}</span></h3>${items.map(superRow).join('')}</section>`).join('')||`<div class="callout">Todo marcado. Revisa y registra tu compra.</div>`}
  <details class="super-bought" ${folded?'':'open'}><summary>Comprados (${bought.length})${totals.paid?` · ${money(totals.paid)}`:''}</summary>${bought.map(superRow).join('')||'<p class="hint">Todavía no marcas nada.</p>'}</details>
  <div class="super-register">${button(`Registrar compra${bought.length?` · ${bought.length}`:''}`,'super-review','primary block',bought.length?'':'disabled')}</div></div>`;
}
function openSuperEdit(id,fromReview=false){
  const item=state.shopping.find(x=>x.id===id);if(!item)return;
  if($('modal').open)closeModal();
  superEditId=id;superReturnReview=fromReview;
  const actualView=quantityView(nonnegative(item.actualQty)?item.actualQty:item.plannedQty,item.unit);
  const lastPrice=unitPriceHistory(state.purchases,item),price=priceOf(item);
  openModal(`${modalTitle(escapeHTML(item.name),`Planeado: ${escapeHTML(amountText(item.plannedQty,item.unit))}`)}<article class="shopping-item sheet" data-shopping-row="${attr(item.id)}"><div class="edit-grid">
  <div class="field"><label>Cantidad real (${actualView.unit})</label><input type="text" inputmode="decimal" placeholder="Ej. 1,300" data-item-field="actualQty" data-input-unit="${actualView.unit}" data-id="${attr(item.id)}" aria-label="Cantidad comprada de ${attr(item.name)}" value="${attr(nonnegative(item.actualQty)?actualView.value:item.actualQty)}"/></div>
  <div class="field"><label>Precio por ${priceUnit(item)} ($)</label><input type="text" inputmode="decimal" placeholder="Ej. 120" data-item-field="unitPrice" data-id="${attr(item.id)}" aria-label="Precio por ${priceUnit(item)} de ${attr(item.name)}" value="${attr(shownPrice(item))}"/></div>
  <div class="field"><label>Total pagado ($)</label><input type="text" inputmode="decimal" placeholder="Ej. 156" data-item-field="totalPaid" data-id="${attr(item.id)}" aria-label="Total pagado por ${attr(item.name)}" value="${attr(item.totalPaid)}"/></div></div>
  <div class="item-footer"><span>${Number.isFinite(lastPrice)?`Último precio: ${money(lastPrice*convert(1,priceUnit(item),item.unit))}/${escapeHTML(priceUnit(item))}`:'Sin precio anterior'}<span data-extra="${attr(item.id)}"></span></span><strong data-item-total="${attr(item.id)}">${Number.isFinite(price)?money(price):'Sin precio real'}</strong></div></article>
  <div class="super-done">${button('Listo','close-modal','primary block')}</div>`);
}
function superReview(){
  if($('modal').open)closeModal();
  const chosen=state.shopping.filter(i=>i.checked);
  if(!chosen.length){showToast('Marca al menos un producto como comprado.',true);return;}
  const incomplete=chosen.map(item=>({item,missing:missingData(item)})).filter(x=>x.missing.length);
  if(!incomplete.length){startCheckout();return;}
  openModal(`${modalTitle('Faltan datos','No inventamos cantidades ni precios: complétalos o deja el producto pendiente.')}<div class="stack">${incomplete.map(({item,missing})=>`<div class="card super-missing-card"><strong>${escapeHTML(item.name)}</strong><p class="hint">Falta ${missing.join(' y ')}</p><div class="row wrap">${button('Completar','super-edit','primary sm',`data-id="${attr(item.id)}" data-review="1"`)}${missing.includes('cantidad real')?button(`Usar lo planeado (${escapeHTML(amountText(item.plannedQty,item.unit))})`,'super-use-planned','outline sm',`data-id="${attr(item.id)}"`):''}${button('Dejar pendiente','super-unmark','ghost sm',`data-id="${attr(item.id)}"`)}</div></div>`).join('')}</div><p class="hint">${chosen.length-incomplete.length} de ${chosen.length} productos ya están completos.</p>`);
}
function handleAction(action,el){
  const id=el.dataset.id;
  switch(action){
    case 'expand-menu':menuExpanded=!menuExpanded;render();break;
    case 'menu-tab':menuTab=el.dataset.tab;go('recetas');break;
    case 'create-plan':showPlanForm(false);break;
    case 'edit-plan':showPlanForm(true);break;
    case 'save-menu':openModal(`${modalTitle('Guardar este menú')}${nameMenuForm(state)}`);break;
    case 'repeat-menu':{const menu=state.savedMenus.find(m=>m.id===id);if(menu)openModal(`${modalTitle('Repetir menú guardado')}${repeatMenuForm(menu)}`);break;}
    case 'review-pantry':reviewPantry();break;
    case 'open-habituales':openHabituales();break;
    case 'edit-habituales':editHabituales();break;
    case 'habituales-skip':closeModal();afterHabituales(0);break;
    case 'save-habitual':{const item=state.shopping.find(x=>x.id===id);if(!item)return;const r=upsertHabitual(state,{name:item.name,quantity:numeric(item.plannedQty)||1,unit:item.unit,category:item.category});saveSoon(true);render();showToast(r.added?`«${item.name}» quedó en Mis habituales.`:`Actualizamos «${item.name}» en Mis habituales.`);break;}
    case 'show-steps':$('recipe-steps')?.scrollIntoView({behavior:'smooth',block:'start'});$('recipe-steps')?.focus({preventScroll:true});break;
    case 'remove-recipe-image':pendingRecipeImage='';$('recipe-image-preview').innerHTML='';if($('recipe-image-input'))$('recipe-image-input').value='';break;
    case 'go-super':go('super');break;
    case 'super-back':go('mandado');break;
    case 'super-edit':openSuperEdit(id,el.dataset.review==='1');break;
    case 'super-review':superReview();break;
    case 'super-use-planned':{const item=state.shopping.find(x=>x.id===id);if(!item)return;applyShoppingEdit(item,'actualQty',String(numeric(item.plannedQty)));saveSoon(true);renderKeepScroll();superReview();break;}
    case 'super-unmark':{const item=state.shopping.find(x=>x.id===id);if(!item)return;item.checked=false;saveSoon(true);renderKeepScroll();superReview();break;}
    case 'navigate':go(el.dataset.view);break;
    case 'go-shopping':go('mandado');break;
    case 'go-recipes':go('recetas');break;
    case 'view-recipe':showRecipe(id);break;
    case 'cook-start':openCook(id,cookSteps.get(id));break;
    case 'cook-restart':cookSteps.delete(id);openCook(id,undefined);break;
    case 'cook-prev':openCook(id,(cookSteps.get(id)??0)-1);break;
    case 'cook-next':{const r=getRecipe(id);if(!r)return;const now=cookSteps.get(id)??0;if(now>=r.steps.length-1){cookSteps.delete(id);showRecipe(id);showToast('Terminaste la receta. ¡Buen provecho!');}else openCook(id,now+1);break;}
    case 'cook-recipe':showRecipe(id);break;
    case 'cook-exit':closeModal();break;
    case 'review-back':{const review=detailReview;detailReview=null;if(review)editRecipe(review.id,{...review.values});break;}
    case 'edit-recipe':editRecipe(id);break;
    case 'new-recipe':editRecipe(null);break;
    case 'add-item':addItem();break;
    case 'add-ingredient-row':$('ingredient-rows').insertAdjacentHTML('beforeend',ingredientRow());break;
    case 'remove-ingredient-row':{const rows=$('ingredient-rows');if(rows.children.length>1||rows.dataset.allowEmpty)el.closest('.ingredient-editor').remove();else showToast('La receta necesita un ingrediente.',true);break;}
    case 'delete-recipe':deleteRecipe(id);break;
    case 'close-modal':closeModal();break;
    case 'generate-list':createShopping();break;
    case 'new-week':{if(!confirm('¿Empezar una semana nueva? Se borrará la lista actual y se desmarcarán las recetas elegidas. Tus compras ya registradas seguirán en el historial.'))return;const previous=state.plans.find(p=>p.id===state.activePlanId);createPlan(state,{name:'Menú de la semana',startDate:nextMonday(previous.startDate),days:[]});saveSoon(true);menuTab='recipes';go('recetas');showToast('Nueva semana lista. El menú anterior quedó guardado.');break;}
    case 'delete-item':{const item=state.shopping.find(x=>x.id===id);if(!item)return;if(!confirm(`¿Quitar «${item.name}» de la lista actual?`))return;state.shopping=state.shopping.filter(x=>x.id!==id);saveSoon(true);render();break;}
    case 'finalize-shopping':startCheckout();break;
    case 'edit-purchase':editPurchase(id);break;
    case 'delete-purchase':{if(!confirm('¿Eliminar este registro de compra? También desaparecerán sus precios del historial.'))return;state.purchases=state.purchases.filter(x=>x.id!==id);saveSoon(true);render();showToast('Compra eliminada.');break;}
    case 'import-recipes':$('import-recipes-input').click();break;
    case 'restore-backup':$('restore-input').click();break;
    case 'export-backup':exportBackup();break;
    case 'export-csv':exportCSV();break;
    case 'reset-data':{
      if(!confirm('¿Borrar todas las recetas, listas, compras y productos habituales? Esta acción no se puede deshacer sin un respaldo.'))return;
      if(!confirm('Última confirmación: ¿estás seguro de querer borrar todo?'))return;
      const keepTheme=state.theme;state=makeInitialState();state.theme=keepTheme;ensurePlans(state);saveSoon(true);go('inicio');showToast('Se restablecieron los datos de ejemplo.');break;
    }
  }
}

// Delegación de eventos para evitar dependencias y funcionar sin internet.
document.addEventListener('click',event=>{
  const buttonEl=event.target.closest('button[data-action]');if(!buttonEl)return;
  try{handleAction(buttonEl.dataset.action,buttonEl);}catch(e){console.error(e);safeError(e);}
});
document.addEventListener('input',event=>{
  const el=event.target;
  if(el.dataset.itemField){updateItemFromInput(el);return;}
  if(el.id==='recipe-search'){
    searchText=el.value;
    const start=el.selectionStart;
    render();const field=$('recipe-search');field?.focus();field?.setSelectionRange(start,start);
  }
});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.dataset.itemSection!==undefined){
    const item=state.shopping.find(x=>x.id===el.dataset.id);
    if(item&&SECTION_IDS.includes(el.value)){item.section=el.value;state.sectionOverrides={...(state.sectionOverrides||{}),[normalizedName(item.name)]:el.value};saveSoon(true);render();showToast('Listo: recordaremos esta sección para «'+item.name+'».');}
    return;
  }
  if(el.id==='active-plan'){activatePlan(state,el.value);saveSoon(true);render();return;}
  if(el.id==='theme-choice'){state.theme=el.value;applyTheme();saveSoon(true);return;}
  if(el.dataset.action==='toggle-recipe'){
    if(el.checked && !selectedEntry(el.dataset.id))state.selected.push({recipeId:el.dataset.id,times:1});
    if(!el.checked)state.selected=state.selected.filter(x=>x.recipeId!==el.dataset.id);
    saveSoon(true);render();
  }else if(el.dataset.action==='recipe-times'){
    const entry=selectedEntry(el.dataset.id);if(entry){entry.times=Number(el.value);delete entry.days;saveSoon(true);render();}
  }else if(el.dataset.action==='check-item'){
    const item=state.shopping.find(x=>x.id===el.dataset.id);if(item){item.checked=el.checked;saveSoon(true);renderKeepScroll();}
  }else if(el.id==='month-filter'){monthFilter=el.value;render();}
  else if(el.dataset.itemField){const item=state.shopping.find(i=>i.id===el.dataset.id);if(item&&['plannedQty','actualQty'].includes(el.dataset.itemField))finishQuantityInput(el,item,el.dataset.itemField);saveSoon(true);}
});
document.addEventListener('submit',event=>{
  const form=event.target;event.preventDefault();
  try{
    if(form.id==='plan-form'){
      const days=[...form.querySelectorAll('[data-plan-day]')].map(el=>el.value),input={name:form.elements.name.value,startDate:form.elements.startDate.value,days};
      if(form.dataset.edit==='1'){
        updatePlan(state,input);
      }else createPlan(state,input);
      saveSoon(true);closeModal();menuTab='menu';go('recetas');showToast('Menú semanal preparado.');
    }else if(form.id==='save-menu-form'){
      saveMenuTemplate(state,form.elements.name.value);saveSoon(true);closeModal();menuTab='saved';go('recetas');showToast('Menú guardado con sus recetas e imágenes.');
    }else if(form.id==='repeat-menu-form'){
      repeatMenu(state,form.dataset.id,{name:form.elements.name.value,startDate:form.elements.startDate.value});saveSoon(true);closeModal();menuTab='menu';go('recetas');showToast('Menú repetido en una semana independiente.');
    }else if(form.id==='menu-import-form'){
      if(!pendingMenuPack)throw new Error('Selecciona de nuevo el archivo de menú.');
      importMenuPack(state,{...pendingMenuPack,name:form.elements.name.value,startDate:form.elements.startDate.value});pendingMenuPack=null;saveSoon(true);closeModal();menuTab='menu';go('recetas');showToast('Menú e imágenes importados.');
    }else if(form.id==='pantry-form'){
      const pantry=pantryItems.map((item,index)=>{const input=form.querySelector(`[data-pantry-index="${index}"]`),quantity=numeric(input.value);if(!nonnegative(quantity)||quantity>100000)throw new Error(`Revisa la cantidad disponible de «${item.name}».`);return {name:item.name,category:item.category,unit:item.unit,quantity:convert(quantity,input.dataset.unit,item.unit)};}).filter(i=>i.quantity>0);
      state.pantry=pantry;closeModal();if((state.habituales||[]).length)openHabituales();else createShopping();
    }else if(form.id==='habituales-form'){
      const picks=(state.habituales||[]).map((h,i)=>({habitual:h,checked:form.querySelector(`[data-habitual-pick="${i}"]`)?.checked,choice:form.querySelector(`[data-habitual-choice="${i}"]`)?.value||'',quantity:(()=>{const input=form.querySelector(`[data-habitual-qty="${i}"]`);return convert(numeric(input.value),input.dataset.unit,h.unit);})()})).filter(x=>x.checked);
      applyHabitualPicks(state,picks,habitualPreview);closeModal();afterHabituales(picks.length);
    }else if(form.id==='habituales-manager-form'){
      const rows=[...form.querySelectorAll('#ingredient-rows .ingredient-editor')].map(row=>({...Object.fromEntries(['name','quantity','unit','category'].map(k=>[k,row.querySelector(`[data-ingredient="${k}"]`)?.value])),id:row.dataset.hid||undefined}));
      state.habituales=safeHabituales(rows,state.sectionOverrides||{});saveSoon(true);closeModal();openHabituales();showToast('Mis habituales guardados.');
    }else if(form.id==='settings-form'){
      if(!nonnegative(form.elements.budget.value)||numeric(form.elements.budget.value)>1000000)throw new Error('El presupuesto debe ser un número positivo válido.');
      state.budgetWeekly=numeric(form.elements.budget.value);state.defaultStore=form.elements.store.value.trim().slice(0,80)||'Mi tienda';saveSoon(true);render();showToast('Preferencias guardadas.');
    }else if(form.id==='recipe-form')saveRecipeFromForm(form);
    else if(form.id==='detail-review-form'){
      const review=detailReview,current=review&&getRecipe(review.id);
      if(!current)throw new Error('Vuelve a abrir la receta para editarla.');
      const decisions=review.changed.map(i=>({i,choice:form.querySelector(`input[name="detalle-${i}"]:checked`)?.value}));
      const pending=decisions.find(d=>!d.choice);
      if(pending)throw new Error(`Elige qué hacer con los detalles del paso ${pending.i+1}.`);
      const keep={};
      for(const key of ['utensils','prep','notes','limitations'])if(current[key])keep[key]=current[key];
      keep.stepDetails=current.stepDetails.map((detail,i)=>decisions.find(d=>d.i===i)?.choice==='remove'?null:detail);
      detailReview=null;commitRecipe(current,review.values,keep);
    }
    else if(form.id==='manual-item-form'){
      const name=form.elements.name.value.trim(),qty=numeric(form.elements.plannedQty.value);
      if(!name||!positive(qty))throw new Error('Escribe un nombre y una cantidad mayor que cero.');
      state.shopping.push({id:uid(),name,category:form.elements.category.value,section:sectionFor(name,form.elements.category.value,state.sectionOverrides||{}),unit:form.elements.unit.value,plannedQty:qty,actualQty:'',unitPrice:'',totalPaid:'',priceMode:'unit',checked:false,store:'',source:'manual',recipeIds:[]});
      let note='Artículo agregado.';
      if(form.elements.saveHabitual?.checked){const r=upsertHabitual(state,{name,quantity:qty,unit:form.elements.unit.value,category:form.elements.category.value});note=r.added?'Artículo agregado y guardado en Mis habituales.':'Artículo agregado; actualizamos su cantidad en Mis habituales.';}
      saveSoon(true);closeModal();go('mandado');showToast(note);
    }else if(form.id==='checkout-form'){
      const {purchase,total}=finalizePurchase(state,form.elements.date.value,form.elements.store.value);
      state.purchases.push(purchase);state.menuPurchaseIds.push(purchase.id);state.shopping=state.shopping.flatMap(item=>{
        if(!item.checked)return [item];
        const remaining=round(numeric(item.plannedQty)-numeric(item.actualQty),5);
        if(item.source==='recipe'&&remaining>0)return [{...item,plannedQty:remaining,actualQty:'',unitPrice:'',totalPaid:'',checked:false,priceMode:'unit'}];
        return [];
      });
      saveSoon(true);closeModal();go('gastos');monthFilter=purchase.date.slice(0,7);render();showToast(`Compra guardada: ${money(total)}.`);
    }else if(form.id==='purchase-edit-form'){
      const p=state.purchases.find(x=>x.id===form.dataset.id);if(!p)throw new Error('No se encontró la compra.');
      const updates=p.items.map((item,j)=>{const input=form.querySelector(`[data-purchase-quantity="${j}"]`);return {qty:convert(numeric(input.value),input.dataset.inputUnit||item.unit,item.unit),paid:numeric(form.querySelector(`[data-purchase-total="${j}"]`).value)};});
      if(updates.some(x=>!positive(x.qty)||!nonnegative(x.paid)))throw new Error('Todas las cantidades deben ser mayores que cero y los totales no pueden ser negativos.');
      if(!validDate(form.elements.date.value))throw new Error('La fecha no es válida.');
      p.date=form.elements.date.value;p.store=form.elements.store.value.trim();p.items.forEach((item,j)=>{item.actualQty=updates[j].qty;item.totalPaid=round(updates[j].paid,2);});
      monthFilter=p.date.slice(0,7);saveSoon(true);closeModal();render();showToast('Compra corregida.');
    }
  }catch(e){console.error(e);safeError(e);}
});
$('import-recipes-input').addEventListener('change',async event=>{
  const input=event.target;if(!input.files?.length)return;
  try{
    const raw=await readJSON(input.files[0]);const newRecipes=parseRecipePack(raw);await validateRecipeImages(newRecipes);
    if(raw.format==='mi-mandado-menu'||Array.isArray(raw.days)){pendingMenuPack={...raw,recipes:newRecipes};openModal(`${modalTitle('Importar menú con imágenes')}${importMenuForm(pendingMenuPack)}`);return;}
    const result=mergeRecipes(state.recipes,newRecipes);
    state.recipes=result.recipes;saveSoon(true);menuTab='recipes';go('recetas');showToast(`${result.count} recetas importadas${result.skipped?`; ${result.skipped} ya existían`:''}.`);
  }catch(e){safeError(e);}finally{input.value='';}
});
$('restore-input').addEventListener('change',async event=>{
  const input=event.target;if(!input.files?.length)return;
  try{
    const restored=validateBackup(decodeBackup(await readJSON(input.files[0],Infinity)));
    if(!confirm('Restaurar reemplazará todas las recetas, listas y gastos de este dispositivo. ¿Deseas continuar?'))return;
    state=restored;resolveMenuMigration();ensurePlans(state);menuTab='menu';applyTheme();saveSoon(true);go('inicio');showToast('Respaldo restaurado.');
  }catch(e){safeError(e);}finally{input.value='';}
});
document.addEventListener('change',async event=>{
  if(event.target.id!=='recipe-image-input'||!event.target.files?.length)return;
  const form=$('recipe-form');
  try{const image=await prepareLocalImage(event.target.files[0]);if(form!==$('recipe-form'))return;pendingRecipeImage=image;$('recipe-image-preview').innerHTML=`<img class="edit-photo" src="${image}" alt="Vista previa de la receta"/>`;}
  catch(error){safeError(error);}
});
window.addEventListener('online',updateNetwork);
window.addEventListener('offline',updateNetwork);
window.addEventListener('pagehide',()=>{if(state){clearTimeout(saveTimer);syncActivePlan(state);persistState(structuredClone(state)).catch(console.error);}});
$('modal').addEventListener('click',event=>{if(event.target===$('modal'))closeModal();});
$('modal').addEventListener('close',()=>{
  if($('modal').open||superEditId===null)return;   // si ya se abrió otra ventana, no es el cierre de la hoja de edición
  const reopen=superReturnReview;superEditId=null;superReturnReview=false;
  if(view==='super'||view==='mandado')renderKeepScroll();
  if(reopen)superReview();
});
document.addEventListener('toggle',event=>{
  const el=event.target;
  if(!el.classList?.contains('super-bought')||!state)return;
  const folded=!el.open;
  if((state.prefs?.purchasedFolded!==false)!==folded){state.prefs={...(state.prefs||{}),purchasedFolded:folded};saveSoon(true);}
},true);

async function initialize(){
  try{state=await loadState();if(!state)throw new Error('El guardado está vacío.');}
  catch(e){console.error(e);$('content').innerHTML=`<div class="empty"><h3>No pudimos abrir los datos guardados</h3><p>${escapeHTML(e.message)}</p><p>Evita borrar el almacenamiento; intenta volver a cargar.</p></div>`;return;}
  resolveMenuMigration();ensurePlans(state);applyTheme();render();saveSoon(true);
  if('serviceWorker' in navigator && location.protocol!=='file:')navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(err=>console.warn('No se pudo habilitar caché offline',err));
  if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
}
initialize();
