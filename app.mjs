import {CATEGORIES,UNITS,numeric,positive,nonnegative,round,money,uid,normalizedName,convert,exampleRecipes,validateRecipe,parseRecipePack,mergeRecipes,generateShoppingList,applyShoppingEdit,priceOf,unitPriceHistory,totalsForShopping,finalizePurchase,purchaseTotal,spendingSummary,weekSummary,validateBackup,validDate} from './core.mjs';
import {loadState,persistState,storageMode} from './storage.mjs';

let state,view='inicio',searchText='',monthFilter='',saveTimer,saveQueue=Promise.resolve(),toastTimer;
const $=id=>document.getElementById(id);
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attr=escapeHTML;
const currentDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const currentMonth=()=>currentDate().slice(0,7);
const numberValue=v=>Number.isFinite(numeric(v))?numeric(v):0;
const formattedQuantity=v=>Number.isFinite(numeric(v))?String(round(numeric(v),4)):'';
const optionList=(values,selected)=>values.map(x=>`<option value="${attr(x)}" ${selected===x?'selected':''}>${escapeHTML(x)}</option>`).join('');
const subtitle=(title,desc,right='')=>`<div class="section-title"><div><h2>${title}</h2>${desc?`<p>${desc}</p>`:''}</div>${right}</div>`;
const button=(label,action,kind='outline',extra='')=>`<button type="button" class="button ${kind}" data-action="${action}" ${extra}>${label}</button>`;
const nav=[['inicio','⌂','Inicio'],['recetas','♨','Recetas'],['mandado','▤','Mandado'],['gastos','▥','Gastos'],['ajustes','⚙','Ajustes']];
const getRecipe=id=>state.recipes.find(r=>r.id===id);
const selectedEntry=id=>state.selected.find(s=>s.recipeId===id);
const showToast=(message,error=false)=>{const el=$('toast');el.textContent=message;el.className=`show${error?' error':''}`;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.className='',4200);};
const safeError=error=>showToast(error?.message||'No se pudo completar esta operación.',true);
function saveSoon(immediate=false){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{
    const snapshot=structuredClone(state);
    saveQueue=saveQueue.catch(()=>{}).then(()=>persistState(snapshot)).catch(e=>{console.error(e);safeError(new Error('No se pudo guardar. Exporta un respaldo y revisa el almacenamiento.'));});
  },immediate?0:220);
}
function updateNetwork(){const el=$('network-status');if(!el)return;el.textContent=navigator.onLine?'● En línea':'◉ Sin internet';el.className=`network-label${navigator.onLine?'':' offline'}`;}
function render(){
  $('page-title').textContent={inicio:'Inicio',recetas:'Mis recetas',mandado:'Lista del mandado',gastos:'Mis gastos',ajustes:'Configuración'}[view];
  const links=nav.map(([id,icon,label])=>`<button class="nav-link ${view===id?'active':''}" type="button" data-action="navigate" data-view="${id}" ${view===id?'aria-current="page"':''}><span class="nav-icon">${icon}</span><span>${label}</span></button>`).join('');
  $('desktop-nav').innerHTML=links;$('mobile-nav').innerHTML=links;
  $('content').innerHTML=({inicio:homeView,recetas:recipesView,mandado:shoppingView,gastos:expensesView,ajustes:settingsView})[view]();
  updateNetwork();
}
function go(next){view=next;window.scrollTo({top:0,behavior:'instant'});render();}
function stat(label,value,sub,emoji){return `<div class="stat"><span class="mini-icon">${emoji}</span><div class="big currency">${value}</div><div class="stat-label">${label}</div><div class="sub">${sub}</div></div>`;}
function homeView(){
  const month=spendingSummary(state.purchases,currentMonth());
  const week=weekSummary(state.purchases,currentDate());
  const shopping=totalsForShopping(state.shopping,state.purchases);
  const menu=state.selected.map(x=>getRecipe(x.recipeId)).filter(Boolean);
  return `<div class="hero"><div><p class="eyebrow" style="color:#a8ead0">TU HOGAR, MEJOR ORGANIZADO</p><h2>Comer bien y cuidar tu presupuesto puede ser sencillo.</h2><p>Planea tus comidas, lleva tu lista a la tienda y anota lo que realmente pagas, incluso sin internet.</p>${button('Ver mi mandado →','go-shopping','cream')}</div><span class="hero-art" aria-hidden="true">🥦</span></div>
  <div class="stats">${stat('Presupuesto semanal',money(state.budgetWeekly),'Editable en Configuración','⌁')}${stat('Gastos de este mes',money(month.total),`${month.count} compras registradas`,'▥')}${stat('Gasto esta semana',money(week.total),`${week.count} compras · ${week.start} a ${week.end}`,'🛒')}</div>
  <div class="grid-2"><section class="card"><div class="row between"><h3>Menú de esta semana</h3><span class="pill">${menu.length} recetas</span></div><div class="line"></div>${menu.length?menu.map(r=>`<div class="row between" style="padding:8px 0"><span><strong>${escapeHTML(r.title)}</strong><br><small>${r.servings} porciones · ${selectedEntry(r.id)?.times||1} vez/veces</small></span><span>🍽️</span></div>`).join(''):`<p class="hint">Todavía no has elegido recetas. Selecciona algunas y crea tu lista automáticamente.</p>`}<div style="margin-top:15px">${button('Elegir mis comidas','go-recipes','outline')}</div></section>
  <section class="card"><div class="row between"><h3>Resumen del mandado</h3><span class="pill orange">${shopping.remaining} pendientes</span></div><div class="line"></div><div class="row between"><span class="muted">Comprado y anotado</span><strong>${money(shopping.paid)}</strong></div><div style="height:11px"></div><div class="row between"><span class="muted">Saldo del presupuesto</span><strong class="${state.budgetWeekly-shopping.paid<0?'warning':'success'}">${money(state.budgetWeekly-shopping.paid)}</strong></div><div style="height:13px"></div><div class="progress"><div style="width:${Math.min(100,shopping.paid/Math.max(1,state.budgetWeekly)*100)}%"></div></div><div style="margin-top:18px">${button('Abrir lista del mandado','go-shopping','primary')}</div></section></div>
  ${subtitle('Cómo comenzar','Solo necesitas estos tres pasos.')}
  <div class="grid-2"><div class="callout"><strong>1. Elige tus recetas</strong><br>Marca las comidas que deseas preparar según las porciones de cada receta. También puedes importar nuevas recetas en un archivo JSON.</div><div class="callout"><strong>2. Compra y registra</strong><br>Genera la lista, cambia gramos o kilos, apunta el precio pagado y registra la compra para consultar tus gastos.</div></div>`;
}
function recipesView(){
  const recipes=state.recipes.filter(r=>normalizedName(r.title).includes(normalizedName(searchText)));
  return `<div class="callout">💡 Cuando te prepare recetas en ChatGPT, podrás importarlas desde un archivo JSON sin volver a escribir todos sus ingredientes y pasos. Los ejemplos incluidos son demostrativos.</div>
  ${subtitle('Tu recetario',`${state.recipes.length} recetas guardadas · ${state.selected.length} elegidas para esta semana`,`${button('＋ Nueva receta','new-recipe','outline')} ${button('⇧ Importar recetas','import-recipes','primary')}`)}
  <div class="toolbar" style="margin-bottom:17px"><div class="field"><label for="recipe-search">Buscar receta</label><input id="recipe-search" type="search" placeholder="Ej. pollo, nopales..." value="${attr(searchText)}"/></div>${button('Generar lista del menú','generate-list','outline')}</div>
  <div class="recipe-grid">${recipes.map(recipe=>{
    const selected=selectedEntry(recipe.id);return `<article class="recipe-card ${selected?'selected':''}"><div class="row between"><div class="art" aria-hidden="true">${recipe.title.toLowerCase().includes('atún')?'🥗':'🍲'}</div><span class="pill ${selected?'':'neutral'}">${selected?'✓ En menú':'Disponible'}</span></div><div><h3>${escapeHTML(recipe.title)}</h3><p>⏱ ${recipe.minutes} min · ${recipe.servings} porciones · ${recipe.ingredients.length} ingredientes</p></div><div class="row between"><label class="toggle-line"><input type="checkbox" data-action="toggle-recipe" data-id="${attr(recipe.id)}" ${selected?'checked':''}/> Esta semana</label>${selected?`<div class="field" style="width:95px"><label>Veces</label><select data-action="recipe-times" data-id="${attr(recipe.id)}">${[1,2,3,4,5,6,7].map(n=>`<option value="${n}" ${selected.times===n?'selected':''}>${n}</option>`).join('')}</select></div>`:''}</div><div class="row wrap">${button('Ver preparación','view-recipe','outline',`data-id="${attr(recipe.id)}"`)}${button('Editar','edit-recipe','ghost sm',`data-id="${attr(recipe.id)}"`)}</div></article>`;
  }).join('')||'<div class="empty">No encontramos recetas con ese nombre.</div>'}</div>`;
}
function shoppingView(){
  const summary=totalsForShopping(state.shopping,state.purchases);
  return `<div class="callout">🧾 <strong>Receta ≠ compra real.</strong> Aquí ajustas lo que pediste, lo que efectivamente recibiste y cuánto pagaste. La receta original no se modifica.</div>
  <div class="stats">${stat('Presupuesto',money(state.budgetWeekly),'Límite orientativo','⌁')}${stat('Total marcado',`<span id="shopping-marked">${money(summary.paid)}</span>`,'Lo pagado por productos marcados','▤')}${stat('Disponible',`<span id="shopping-available">${money(state.budgetWeekly-summary.paid)}</span>`,`${summary.boughtCount} de ${state.shopping.length} comprados`,'✓')}</div>
  ${subtitle('Lista de esta semana',`${state.shopping.length} productos. Ajusta la cantidad y el precio real en la tienda.`,`${button('↻ Desde mis recetas','generate-list','outline')} ${button('＋ Agregar artículo','add-item','primary')}`)}
  <div class="row between wrap" style="margin:-5px 0 16px"><p class="hint" style="margin:0">Estimado según precios de compras anteriores: <strong>${money(summary.estimate)}</strong> (sin precio previo: no contabilizado).</p>${button('Empezar una semana nueva','new-week','ghost sm')}</div>
  ${!state.shopping.length?`<div class="empty"><div class="emoji">🛒</div><h3>Tu lista está vacía</h3><p>Elige recetas o agrega un artículo manualmente.</p>${button('Seleccionar recetas','go-recipes','primary')}</div>`:
  `<div class="shopping-list">${state.shopping.map(renderShoppingItem).join('')}</div>
  <div class="card" style="margin-top:18px"><div class="row between wrap"><div><h3>Total registrado: <span id="shopping-paid">${money(summary.paid)}</span></h3><p class="hint" id="shopping-remaining">Restante del presupuesto: ${money(state.budgetWeekly-summary.paid)}</p></div>${button('✓ Registrar compra','finalize-shopping','primary')}</div><div class="line"></div><p class="hint">Solo se guardarán en el historial los artículos marcados como comprados y con cantidad y precio reales. Los pendientes permanecerán en tu lista.</p></div>`}
  <div class="callout warn" style="margin-top:16px">Los precios reales no se consultan automáticamente en tiendas: tú los capturas con el ticket o en la tienda. La próxima vez utilizaremos tu último precio registrado como referencia.</div>`;
}
function renderShoppingItem(item){
  const lastPrice=unitPriceHistory(state.purchases,item);
  const price=priceOf(item);
  const planned=numberValue(item.plannedQty),actual=numberValue(item.actualQty);
  const extra=actual>0?round(actual-planned,4):0;
  return `<article class="shopping-item ${item.checked?'done':''}" data-shopping-row="${attr(item.id)}"><div class="shopping-heading"><div class="left"><input type="checkbox" aria-label="Marcar ${attr(item.name)} como comprado" data-action="check-item" data-id="${attr(item.id)}" ${item.checked?'checked':''}/><div><div class="name">${escapeHTML(item.name)}</div><div class="small">${escapeHTML(item.category)} · ${item.source==='manual'?'Agregado por ti':'Desde receta'}</div></div></div>${button('Quitar','delete-item','ghost sm',`data-id="${attr(item.id)}" aria-label="Quitar ${attr(item.name)}"`)}</div>
  <div class="edit-grid"><div class="field"><label>Cantidad planeada (${item.unit})</label><input type="text" inputmode="decimal" data-item-field="plannedQty" data-id="${attr(item.id)}" aria-label="Cantidad planeada de ${attr(item.name)}" value="${attr(formattedQuantity(item.plannedQty))}"/></div>
  <div class="field"><label>Cantidad real (${item.unit})</label><input type="text" inputmode="decimal" placeholder="Ej. 1,300" data-item-field="actualQty" data-id="${attr(item.id)}" aria-label="Cantidad comprada de ${attr(item.name)}" value="${attr(item.actualQty)}"/></div>
  <div class="field"><label>Precio por ${item.unit} ($)</label><input type="text" inputmode="decimal" placeholder="Ej. 120" data-item-field="unitPrice" data-id="${attr(item.id)}" aria-label="Precio por ${item.unit} de ${attr(item.name)}" value="${attr(item.unitPrice)}"/></div>
  <div class="field"><label>Total pagado ($)</label><input type="text" inputmode="decimal" placeholder="Ej. 156" data-item-field="totalPaid" data-id="${attr(item.id)}" aria-label="Total pagado por ${attr(item.name)}" value="${attr(item.totalPaid)}"/></div></div>
  <div class="item-footer"><span>${Number.isFinite(lastPrice)?`Último precio: ${money(lastPrice)}/${escapeHTML(item.unit)} · `:''}<span data-extra="${attr(item.id)}">${actual>planned?`Compraste ${formattedQuantity(extra)} ${escapeHTML(item.unit)} extra`:actual>0&&actual<planned?'Compraste menos de lo planeado':'Cantidad editable'}</span></span><strong data-item-total="${attr(item.id)}">${Number.isFinite(price)?money(price):'Sin precio real'}</strong></div></article>`;
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
  <div class="stack">${purchases.map(p=>`<details class="purchase"><summary class="row between"><div><strong>${escapeHTML(p.store||'Tienda sin nombre')}</strong><div class="hint">${escapeHTML(p.date)} · ${p.items.length} artículos · ${money(purchaseTotal(p))}</div></div><span aria-hidden="true">⌄</span></summary><table class="purchase-items"><thead><tr><th>Artículo</th><th>Cantidad</th><th>Pagado</th></tr></thead><tbody>${p.items.map(i=>`<tr><td>${escapeHTML(i.name)}<br><small>${escapeHTML(i.category)}</small></td><td>${formattedQuantity(i.actualQty)} ${escapeHTML(i.unit)}</td><td>${money(i.totalPaid)}</td></tr>`).join('')}</tbody></table><div class="row wrap">${button('Corregir compra','edit-purchase','outline sm',`data-id="${attr(p.id)}"`)}${button('Eliminar','delete-purchase','danger sm',`data-id="${attr(p.id)}"`)}</div></details>`).join('')||'<div class="empty"><div class="emoji">📒</div><h3>Sin compras registradas en este mes</h3><p>Cuando termines una compra en «Mandado», aparecerá aquí.</p></div>'}</div>`;
}
function settingsView(){
  return `${subtitle('Tus preferencias','Estos datos se guardan solo en este dispositivo.')}
  <div class="grid-2"><section class="card"><h3>Presupuesto y tienda</h3><div class="line"></div><form id="settings-form" class="stack"><div class="field"><label for="budget">Presupuesto semanal (MXN)</label><input id="budget" name="budget" type="number" min="0" step="0.01" required value="${attr(state.budgetWeekly)}"/></div><div class="field"><label for="default-store">Tienda por defecto</label><input id="default-store" name="store" maxlength="80" value="${attr(state.defaultStore)}"/></div><button class="button primary" type="submit">Guardar preferencias</button></form></section>
  <section class="card"><h3>Respaldo de tus datos</h3><div class="line"></div><p class="hint">Descarga un respaldo completo en JSON. Si cambias de celular o borras el navegador, podrás restaurarlo.</p><div class="stack">${button('↓ Descargar respaldo','export-backup','primary')}${button('↑ Restaurar respaldo','restore-backup','outline')}${button('↓ Exportar gastos a CSV','export-csv','outline')}</div></section></div>
  ${subtitle('Cómo funciona sin internet','Primero abre la aplicación con internet al menos una vez.')}
  <div class="grid-2"><div class="callout"><strong>📴 Trabajo sin conexión</strong><br>La interfaz se guarda en el dispositivo cuando se instala el servicio offline. Las recetas, el mandado y los gastos se almacenan localmente. No hace falta conexión para modificarlos.</div><div class="callout"><strong>🔒 Tu información</strong><br>No enviamos tus tickets ni tus recetas a ningún servidor. En esta versión no hay cuentas ni sincronización entre equipos. Haz respaldos regularmente.</div></div>
  <div class="callout warn" style="margin-top:20px"><strong>⚕️ Sobre las recetas</strong><br>Las recetas incluidas son ejemplos generales. Puedes cambiar ingredientes, porciones y pasos según tus preferencias.</div>
  <div style="margin-top:22px">${button('Borrar todos los datos de esta app','reset-data','danger sm')}</div>`;
}
function openModal(content){$('modal-content').innerHTML=content;$('modal').showModal();}
function closeModal(){if($('modal').open)$('modal').close();$('modal-content').innerHTML='';}
function modalTitle(title,description=''){return `<div class="modal-heading"><div><h2>${title}</h2>${description?`<p class="hint" style="margin:6px 0 0">${description}</p>`:''}</div><button type="button" class="icon-close" data-action="close-modal" aria-label="Cerrar">×</button></div>`;}
function showRecipe(id){
  const r=getRecipe(id);if(!r)return;
  openModal(`${modalTitle(escapeHTML(r.title),`${r.servings} porciones · ${r.minutes} minutos`)}<div class="recipe-details"><div class="callout">Estas instrucciones se guardan en tu teléfono y puedes consultarlas sin conexión.</div><h3 style="margin:22px 0 12px">Ingredientes</h3><ul class="ingredient-list">${r.ingredients.map(i=>`<li><strong>${escapeHTML(i.name)}</strong><span>${formattedQuantity(i.quantity)} ${escapeHTML(i.unit)}</span></li>`).join('')}</ul><h3 style="margin:22px 0 12px">Preparación paso a paso</h3><ol>${r.steps.map(s=>`<li>${escapeHTML(s)}</li>`).join('')}</ol><div class="row wrap">${button('Editar esta receta','edit-recipe','outline',`data-id="${attr(r.id)}"`)}${button('Cerrar','close-modal','ghost')}</div></div>`);
}
function ingredientRow(i={name:'',quantity:1,unit:'kg',category:'Verduras y frutas'}){
  return `<div class="ingredient-editor"><input aria-label="Ingrediente" placeholder="Ingrediente" data-ingredient="name" maxlength="90" required value="${attr(i.name)}"/><input aria-label="Cantidad" type="text" inputmode="decimal" data-ingredient="quantity" placeholder="1" required value="${attr(i.quantity)}"/><select aria-label="Unidad" data-ingredient="unit">${optionList(UNITS,i.unit)}</select><select class="category-field" aria-label="Categoría" data-ingredient="category">${optionList(CATEGORIES,i.category)}</select><button type="button" data-action="remove-ingredient-row" aria-label="Quitar ingrediente">×</button></div>`;
}
function editRecipe(id){
  const r=id?getRecipe(id):null;
  openModal(`${modalTitle(r?'Editar receta':'Nueva receta','La cantidad de la receta es independiente de lo que compras en la tienda.')}
  <form id="recipe-form" class="stack" data-id="${attr(r?.id||'')}"><div class="form-row"><div class="field"><label>Nombre</label><input name="title" maxlength="120" required placeholder="Ej. Pollo con verduras" value="${attr(r?.title||'')}"/></div><div class="field"><label>Porciones</label><input name="servings" type="number" min="1" max="50" required value="${r?.servings||3}"/></div></div>
  <div class="field"><label>Tiempo aproximado (minutos)</label><input name="minutes" type="number" min="0" value="${r?.minutes||30}"/></div>
  <div><h3>Ingredientes</h3><p class="hint">Puedes usar kg, g, l, ml, piezas o paquetes. Cada artículo lleva su categoría.</p><div class="ingredient-editor ingredient-editor-head"><strong>Nombre</strong><strong>Cantidad</strong><strong>Unidad</strong><strong>Categoría</strong></div><div id="ingredient-rows">${(r?.ingredients||[{name:'',quantity:1,unit:'kg',category:'Verduras y frutas'}]).map(ingredientRow).join('')}</div>${button('＋ Otro ingrediente','add-ingredient-row','outline sm')}</div>
  <div class="field"><label>Preparación (un paso por línea)</label><textarea name="steps" required rows="7" placeholder="Lava las verduras.&#10;Corta los ingredientes.&#10;Cocina y sirve.">${escapeHTML(r?.steps.join('\n')||'')}</textarea></div>
  <div class="row wrap"><button class="button primary" type="submit">Guardar receta</button>${r?button('Eliminar receta','delete-recipe','danger',`data-id="${attr(r.id)}"`):''}</div></form>`);
}
function addItem(){
  openModal(`${modalTitle('Agregar artículo al mandado','Puedes agregar alimentos, limpieza, higiene y todo lo que necesites.')}
  <form id="manual-item-form" class="stack"><div class="field"><label>Nombre del artículo</label><input name="name" required maxlength="90" placeholder="Ej. Detergente"/></div><div class="form-row"><div class="field"><label>Cantidad planeada</label><input name="plannedQty" type="text" inputmode="decimal" required value="1"/></div><div class="field"><label>Unidad</label><select name="unit">${optionList(UNITS,'pza')}</select></div></div><div class="field"><label>Categoría</label><select name="category">${optionList(CATEGORIES,'Limpieza')}</select></div><button class="button primary" type="submit">Agregar a la lista</button></form>`);
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
  openModal(`${modalTitle('Corregir compra',`${escapeHTML(p.store)} · ${escapeHTML(p.date)}`)}<form id="purchase-edit-form" data-id="${attr(p.id)}" class="stack"><div class="field"><label>Fecha</label><input type="date" name="date" value="${attr(p.date)}" required/></div><div class="field"><label>Tienda principal</label><input name="store" value="${attr(p.store)}" maxlength="80"/></div><div class="line"></div>${p.items.map((i,j)=>`<div class="card" style="padding:12px"><strong>${escapeHTML(i.name)}</strong><p class="hint">Precio y cantidad reales del ticket</p><div class="form-row"><div class="field"><label>Cantidad (${escapeHTML(i.unit)})</label><input data-purchase-quantity="${j}" type="text" inputmode="decimal" value="${attr(i.actualQty)}"/></div><div class="field"><label>Total pagado ($)</label><input data-purchase-total="${j}" type="text" inputmode="decimal" value="${attr(i.totalPaid)}"/></div></div></div>`).join('')}<button type="submit" class="button primary">Guardar correcciones</button></form>`);
}
function downloadFile(text,filename,mime='application/json'){
  const blob=new Blob([text],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function exportBackup(){downloadFile(JSON.stringify(state,null,2),`respaldo-mi-mandado-${currentDate()}.json`);showToast('Respaldo generado. Guárdalo en un lugar seguro.');}
function exportCSV(){
  const rows=[['Fecha','Tienda principal','Tienda artículo','Artículo','Categoría','Cantidad','Unidad','Total MXN']];
  for(const p of state.purchases)for(const i of p.items)rows.push([p.date,p.store,i.store||p.store,i.name,i.category,i.actualQty,i.unit,i.totalPaid]);
  const csv='\uFEFF'+rows.map(row=>row.map(cell=>`"${String(cell??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
  downloadFile(csv,`gastos-mi-mandado-${currentDate()}.csv`,'text/csv;charset=utf-8');showToast('CSV de gastos exportado.');
}
async function readJSON(file){if(!file||file.size>5_000_000)throw new Error('El archivo debe ser JSON y pesar menos de 5 MB.');try{return JSON.parse(await file.text());}catch{throw new Error('No se pudo leer el JSON. Revisa el formato.');}}
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
  const text=el.value.trim();
  if(!['plannedQty','actualQty','unitPrice','totalPaid'].includes(field))return;
  applyShoppingEdit(item,field,text);
  const row=el.closest('.shopping-item');
  for(const f of ['unitPrice','totalPaid'])if(f!==field){const target=row?.querySelector(`[data-item-field="${f}"]`);if(target)target.value=item[f];}
  const target=row?.querySelector('[data-item-total]');if(target)target.textContent=Number.isFinite(priceOf(item))?money(priceOf(item)):'Sin precio real';
  const extra=row?.querySelector('[data-extra]');
  if(extra){const actual=numberValue(item.actualQty),planned=numberValue(item.plannedQty);extra.textContent=actual>planned?`Compraste ${formattedQuantity(actual-planned)} ${item.unit} extra`:actual>0&&actual<planned?'Compraste menos de lo planeado':'Cantidad editable';}
  updateShoppingNumbers();saveSoon();
}
function createShopping(){
  if(!state.selected.length){showToast('Primero elige una o más recetas.',true);go('recetas');return;}
  if(state.shopping.some(x=>x.checked) && !confirm('Hay artículos marcados como comprados. ¿Quieres recalcular el menú? Se conservarán los precios de productos coincidentes, pero pueden reaparecer artículos de recetas si ya finalizaste otra compra.'))return;
  state.shopping=generateShoppingList(state.recipes,state.selected,state.shopping);
  saveSoon(true);go('mandado');showToast('Lista generada. Los artículos agregados manualmente se conservaron.');
}
function saveRecipeFromForm(form){
  const ingredientRows=[...form.querySelectorAll('#ingredient-rows .ingredient-editor')];
  if(!ingredientRows.length)throw new Error('Agrega por lo menos un ingrediente.');
  const ingredients=ingredientRows.map(row=>Object.fromEntries(['name','quantity','unit','category'].map(k=>[k,row.querySelector(`[data-ingredient="${k}"]`)?.value])));
  const current=form.dataset.id?getRecipe(form.dataset.id):null;
  const r=validateRecipe({id:current?.id||uid(),title:form.elements.title.value,servings:form.elements.servings.value,minutes:form.elements.minutes.value,ingredients,steps:form.elements.steps.value.split('\n').map(s=>s.trim()).filter(Boolean),tags:current?.tags||[]});
  if(current){Object.assign(current,r);showToast('Receta actualizada.');}
  else{state.recipes.push(r);showToast('Receta agregada.');}
  saveSoon(true);closeModal();go('recetas');
}
function deleteRecipe(id){
  const r=getRecipe(id);if(!r||!confirm(`¿Eliminar la receta «${r.title}»? La lista actual no cambiará hasta regenerarla.`))return;
  state.recipes=state.recipes.filter(x=>x.id!==id);state.selected=state.selected.filter(x=>x.recipeId!==id);
  saveSoon(true);closeModal();render();showToast('Receta eliminada.');
}
function handleAction(action,el){
  const id=el.dataset.id;
  switch(action){
    case 'navigate':go(el.dataset.view);break;
    case 'go-shopping':go('mandado');break;
    case 'go-recipes':go('recetas');break;
    case 'view-recipe':showRecipe(id);break;
    case 'edit-recipe':editRecipe(id);break;
    case 'new-recipe':editRecipe(null);break;
    case 'add-item':addItem();break;
    case 'add-ingredient-row':$('ingredient-rows').insertAdjacentHTML('beforeend',ingredientRow());break;
    case 'remove-ingredient-row':{const rows=$('ingredient-rows');if(rows.children.length>1)el.closest('.ingredient-editor').remove();else showToast('La receta necesita un ingrediente.',true);break;}
    case 'delete-recipe':deleteRecipe(id);break;
    case 'close-modal':closeModal();break;
    case 'generate-list':createShopping();break;
    case 'new-week':{if(!confirm('¿Empezar una semana nueva? Se borrará la lista actual y se desmarcarán las recetas elegidas. Tus compras ya registradas seguirán en el historial.'))return;state.shopping=[];state.selected=[];saveSoon(true);go('recetas');showToast('Nueva semana lista. Elige tus recetas.');break;}
    case 'delete-item':{const item=state.shopping.find(x=>x.id===id);if(!item)return;if(!confirm(`¿Quitar «${item.name}» de la lista actual?`))return;state.shopping=state.shopping.filter(x=>x.id!==id);saveSoon(true);render();break;}
    case 'finalize-shopping':startCheckout();break;
    case 'edit-purchase':editPurchase(id);break;
    case 'delete-purchase':{if(!confirm('¿Eliminar este registro de compra? También desaparecerán sus precios del historial.'))return;state.purchases=state.purchases.filter(x=>x.id!==id);saveSoon(true);render();showToast('Compra eliminada.');break;}
    case 'import-recipes':$('import-recipes-input').click();break;
    case 'restore-backup':$('restore-input').click();break;
    case 'export-backup':exportBackup();break;
    case 'export-csv':exportCSV();break;
    case 'reset-data':{
      if(!confirm('¿Borrar todas las recetas, listas y compras? Esta acción no se puede deshacer sin un respaldo.'))return;
      if(!confirm('Última confirmación: ¿estás seguro de querer borrar todo?'))return;
      state={schemaVersion:1,budgetWeekly:0,defaultStore:'Mi tienda',recipes:structuredClone(exampleRecipes),selected:[],shopping:[],purchases:[]};saveSoon(true);go('inicio');showToast('Se restablecieron los datos de ejemplo.');break;
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
  if(el.dataset.action==='toggle-recipe'){
    if(el.checked && !selectedEntry(el.dataset.id))state.selected.push({recipeId:el.dataset.id,times:1});
    if(!el.checked)state.selected=state.selected.filter(x=>x.recipeId!==el.dataset.id);
    saveSoon(true);render();
  }else if(el.dataset.action==='recipe-times'){
    const entry=selectedEntry(el.dataset.id);if(entry){entry.times=Number(el.value);saveSoon(true);render();}
  }else if(el.dataset.action==='check-item'){
    const item=state.shopping.find(x=>x.id===el.dataset.id);if(item){item.checked=el.checked;saveSoon(true);render();}
  }else if(el.id==='month-filter'){monthFilter=el.value;render();}
  else if(el.dataset.itemField){saveSoon(true);}
});
document.addEventListener('submit',event=>{
  const form=event.target;event.preventDefault();
  try{
    if(form.id==='settings-form'){
      if(!nonnegative(form.elements.budget.value)||numeric(form.elements.budget.value)>1000000)throw new Error('El presupuesto debe ser un número positivo válido.');
      state.budgetWeekly=numeric(form.elements.budget.value);state.defaultStore=form.elements.store.value.trim().slice(0,80)||'Mi tienda';saveSoon(true);render();showToast('Preferencias guardadas.');
    }else if(form.id==='recipe-form')saveRecipeFromForm(form);
    else if(form.id==='manual-item-form'){
      const name=form.elements.name.value.trim(),qty=numeric(form.elements.plannedQty.value);
      if(!name||!positive(qty))throw new Error('Escribe un nombre y una cantidad mayor que cero.');
      state.shopping.push({id:uid(),name,category:form.elements.category.value,unit:form.elements.unit.value,plannedQty:qty,actualQty:'',unitPrice:'',totalPaid:'',priceMode:'unit',checked:false,store:'',source:'manual',recipeIds:[]});
      saveSoon(true);closeModal();go('mandado');showToast('Artículo agregado.');
    }else if(form.id==='checkout-form'){
      const {purchase,total}=finalizePurchase(state,form.elements.date.value,form.elements.store.value);
      state.purchases.push(purchase);state.shopping=state.shopping.filter(i=>!i.checked);
      saveSoon(true);closeModal();go('gastos');monthFilter=purchase.date.slice(0,7);render();showToast(`Compra guardada: ${money(total)}.`);
    }else if(form.id==='purchase-edit-form'){
      const p=state.purchases.find(x=>x.id===form.dataset.id);if(!p)throw new Error('No se encontró la compra.');
      const updates=p.items.map((_,j)=>({qty:numeric(form.querySelector(`[data-purchase-quantity="${j}"]`).value),paid:numeric(form.querySelector(`[data-purchase-total="${j}"]`).value)}));
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
    const newRecipes=parseRecipePack(await readJSON(input.files[0]));
    const result=mergeRecipes(state.recipes,newRecipes);
    state.recipes=result.recipes;saveSoon(true);go('recetas');showToast(`${result.count} recetas importadas${result.skipped?`; ${result.skipped} ya existían`:''}.`);
  }catch(e){safeError(e);}finally{input.value='';}
});
$('restore-input').addEventListener('change',async event=>{
  const input=event.target;if(!input.files?.length)return;
  try{
    const restored=validateBackup(await readJSON(input.files[0]));
    if(!confirm('Restaurar reemplazará todas las recetas, listas y gastos de este dispositivo. ¿Deseas continuar?'))return;
    state=restored;saveSoon(true);go('inicio');showToast('Respaldo restaurado.');
  }catch(e){safeError(e);}finally{input.value='';}
});
window.addEventListener('online',updateNetwork);
window.addEventListener('offline',updateNetwork);
window.addEventListener('pagehide',()=>{if(state){clearTimeout(saveTimer);persistState(structuredClone(state)).catch(console.error);}});
$('modal').addEventListener('click',event=>{if(event.target===$('modal'))closeModal();});

async function initialize(){
  try{state=await loadState();if(!state)throw new Error('El guardado está vacío.');}
  catch(e){console.error(e);$('content').innerHTML=`<div class="empty"><h3>No pudimos abrir los datos guardados</h3><p>${escapeHTML(e.message)}</p><p>Evita borrar el almacenamiento; intenta volver a cargar.</p></div>`;return;}
  render();
  if('serviceWorker' in navigator && location.protocol!=='file:')navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(err=>console.warn('No se pudo habilitar caché offline',err));
  if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
}
initialize();
