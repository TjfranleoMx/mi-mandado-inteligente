// Presentación de los detalles de una receta y del modo opcional «Cocinar paso a paso».
// Funciones puras: reciben la receta y unas ayudas `h` = {esc, amountText, button}. Solo muestran lo que la receta trae:
// los campos opcionales ausentes se omiten y nunca se deduce ni se inventa nada.

export function cookingModel(recipe){
  const details=recipe.stepDetails||[];
  return {
    title:recipe.title,
    utensils:recipe.utensils||[],
    prep:recipe.prep||[],
    notes:recipe.notes||[],
    limitations:recipe.limitations||[],
    steps:recipe.steps.map((text,i)=>({n:i+1,text,...(details[i]||{}),uses:details[i]?.ingredients||[],terms:details[i]?.terms||[]}))
  };
}
// La pantalla «Antes de empezar» solo existe si hay algo que mostrar en ella.
export const hasIntro=model=>model.utensils.length>0||model.prep.length>0||model.limitations.length>0;
export const firstScreen=model=>hasIntro(model)?-1:0;

export function limitationsHTML(model,h){
  if(!model.limitations.length)return '';
  return `<div class="callout warn recipe-limits" role="note"><strong>Esta receta tiene información pendiente</strong><p>No la uses como guía completa. Lo que no indica:</p><ul>${model.limitations.map(x=>`<li>${h.esc(x)}</li>`).join('')}</ul></div>`;
}
export function utensilsHTML(model,h){
  return model.utensils.length?`<section class="recipe-utensils"><h3>Utensilios</h3><ul class="utensil-list">${model.utensils.map(x=>`<li>${h.esc(x)}</li>`).join('')}</ul></section>`:'';
}
export function prepHTML(model,h){
  return model.prep.length?`<section class="recipe-prep"><h3>Antes de empezar</h3><ul class="prep-before">${model.prep.map(x=>`<li>${h.esc(x)}</li>`).join('')}</ul></section>`:'';
}
export function notesHTML(model,h){
  return model.notes.length?`<section class="recipe-notes"><h3>Notas</h3><ul class="prep-before">${model.notes.map(x=>`<li>${h.esc(x)}</li>`).join('')}</ul></section>`:'';
}
// Cantidades, fuego, tiempo, cómo comprobar, seguridad y términos de UN paso. Cadena vacía si el paso no trae nada de eso.
export function stepExtrasHTML(step,h){
  const parts=[];
  // La comprobación de seguridad va primero: es lo que no se puede pasar por alto, aunque haya que desplazar la pantalla.
  if(step.safetyCheck)parts.push(`<p class="step-safety"><strong>Seguridad:</strong> ${h.esc(step.safetyCheck)}</p>`);
  if(step.uses.length)parts.push(`<div class="step-uses"><strong>Usas</strong><ul class="uses">${step.uses.map(i=>`<li><span>${h.esc(i.name)}</span><b>${h.esc(h.amountText(i.quantity,i.unit))}</b></li>`).join('')}</ul></div>`);
  if(step.heat)parts.push(`<p class="step-line"><strong>Fuego:</strong> ${h.esc(step.heat)}</p>`);
  if(step.time)parts.push(`<p class="step-line"><strong>Tiempo aproximado:</strong> ${h.esc(step.time)}</p>`);
  if(step.check)parts.push(`<p class="step-line"><strong>Cómo comprobar:</strong> ${h.esc(step.check)}</p>`);
  if(step.terms.length)parts.push(`<div class="step-terms">${step.terms.map(t=>`<p><strong>${h.esc(t.term)}:</strong> ${h.esc(t.meaning)}</p>`).join('')}</div>`);
  return parts.length?`<div class="step-extra">${parts.join('')}</div>`:'';
}
export function stepsHTML(model,h){
  return model.steps.map(step=>`<li class="prep-step"><span class="prep-number" aria-hidden="true">${step.n}</span><div><h4>Paso ${step.n}</h4><p>${h.esc(step.text)}</p>${stepExtrasHTML(step,h)}</div></li>`).join('');
}

// Pantalla del modo de cocina. index = -1: «Antes de empezar»; 0..n-1: paso correspondiente.
export function cookScreenHTML(model,index,h,recipeId){
  const total=model.steps.length,intro=index<0,id=h.esc(recipeId);
  const first=index<=firstScreen(model),last=index===total-1;
  const progress=`<div class="cook-progress" role="progressbar" aria-label="Avance de la receta" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${Math.max(1,index+1)}">${model.steps.map((s,i)=>`<i class="${i<=index?'on':''}"></i>`).join('')}</div>`;
  const warn=model.limitations.length&&!intro?`<p class="cook-warn" role="note">⚠ Esta receta tiene información pendiente. ${h.button('Ver','cook-recipe','ghost sm',`data-id="${id}"`)}</p>`:'';
  let body;
  if(intro){
    body=`${limitationsHTML(model,h)}${utensilsHTML(model,h)}${prepHTML(model,h)}`;
  }else{
    const step=model.steps[index];
    body=`<p class="cook-text">${h.esc(step.text)}</p>${stepExtrasHTML(step,h)}`;
  }
  return `<div class="cook" data-cook-step="${index}"><div class="cook-head"><strong class="cook-title">${h.esc(model.title)}</strong>${h.button('Salir','cook-exit','ghost sm')}</div>${progress}<div class="cook-count">${intro?'Antes de empezar':`Paso ${index+1} de ${total}`}</div>${warn}<div class="cook-body">${body}</div><div class="cook-foot">${h.button('← Anterior','cook-prev','outline',`data-id="${id}" ${first?'disabled':''}`)}${h.button(last?'Terminar ✓':intro?'Empezar →':'Siguiente →','cook-next','primary',`data-id="${id}"`)}${h.button('Ver receta completa','cook-recipe','ghost cook-full',`data-id="${id}"`)}</div></div>`;
}

// ---- Revisión de detalles al editar el texto de un paso ----
const normaliza=s=>String(s??'').replace(/\s+/g,' ').trim();
// Posiciones de pasos que tienen detalles y cuyo texto cambió (misma cantidad de pasos). Un cambio solo de espacios no cuenta.
export function changedDetailSteps(recipe,newSteps){
  if(!recipe.stepDetails||newSteps.length!==recipe.steps.length)return [];
  return recipe.steps.map((_,i)=>i).filter(i=>recipe.stepDetails[i]&&normaliza(recipe.steps[i])!==normaliza(newSteps[i]));
}
export function detailReviewHTML(model,changed,newSteps,h){
  return `<form id="detail-review-form" class="stack"><div class="callout warn">Cambiaste el texto de ${changed.length===1?'un paso que tiene':`${changed.length} pasos que tienen`} detalles (cantidades, fuego, tiempo, comprobaciones o términos). Podrían corresponder al texto anterior. <strong>Elige qué hacer con cada uno</strong>; no se guarda nada hasta que decidas.</div>${changed.map(i=>`<fieldset class="detail-review" data-step="${i}"><legend>Paso ${i+1}</legend><p class="hint">Texto anterior</p><p>${h.esc(model.steps[i].text)}</p><p class="hint">Texto nuevo</p><p><strong>${h.esc(newSteps[i])}</strong></p><p class="hint">Detalles que tiene ahora</p>${stepExtrasHTML(model.steps[i],h)}<label class="toggle-line"><input type="radio" name="detalle-${i}" value="keep"/> Los detalles siguen correspondiendo</label><label class="toggle-line"><input type="radio" name="detalle-${i}" value="remove"/> Quitar los detalles de este paso</label></fieldset>`).join('')}<button type="submit" class="button primary">Guardar receta</button>${h.button('Volver a editar','review-back','ghost')}</form>`;
}
