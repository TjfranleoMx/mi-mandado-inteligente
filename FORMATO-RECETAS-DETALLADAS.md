# Formato de recetas con detalles (opcional)

Sirve para importar recetas que se puedan seguir paso a paso, también por quien empieza a cocinar. **Todos los campos nuevos son opcionales.** Una receta con `steps` de texto, como las de siempre, se importa y se ve igual que antes.

La app **solo muestra lo que el archivo trae**. Si falta un campo, simplemente no aparece. La app nunca deduce ni inventa utensilios, cantidades por paso, tiempos ni temperaturas a partir del texto.

## Campos de la receta

| Campo | Tipo | Qué es |
|---|---|---|
| `title`, `servings`, `minutes`, `ingredients`, `steps`, `image`, `tags` | igual que antes | Ver `README.md`. |
| `utensils` | lista de textos (hasta 30, 80 caracteres c/u) | Utensilios. Alias: `utensilios`. |
| `prep` | lista de textos (hasta 20, 300 c/u) | «Antes de empezar»: lo que se lava, corta o prepara antes. Alias: `preparacion_previa`. |
| `notes` | lista de textos (hasta 10, 600 c/u) | Notas aparte de los pasos. Alias: `notas`. |
| `limitations` | lista de textos (hasta 10, 300 c/u) | Información esencial que la receta **no** trae (por ejemplo fuego, tiempo o una comprobación de seguridad). Si existe, la app muestra «Esta receta tiene información pendiente» y no la presenta como completa. Alias: `limitaciones`. |

## Cada elemento de `steps`

Puede ser un **texto** (formato antiguo) o un **objeto**:

| Campo del paso | Tipo | Qué es |
|---|---|---|
| `text` | texto (obligatorio, hasta 1500) | La acción. Alias: `texto`. |
| `ingredients` | lista de `{name, quantity, unit}` (hasta 20) | Cantidades que se usan **en este paso**. `unit`: kg, g, l, ml, pza o paquete. Alias: `ingredientes`, `nombre`, `cantidad`, `unidad`. |
| `heat` | texto (hasta 60) | Fuego, por ejemplo «medio». Solo si fue revisado. Alias: `fuego`. |
| `time` | texto (hasta 60) | Tiempo aproximado, por ejemplo «de 8 a 10 minutos». Solo si fue revisado. Alias: `tiempo`. |
| `check` | texto (hasta 300) | Cómo comprobar el resultado (a la vista, olor, textura). Alias: `comprobar`. |
| `safetyCheck` | texto (hasta 300) | Comprobación de **seguridad** necesaria (por ejemplo una temperatura). Se muestra aparte, destacada. No se sustituye por reloj, color o textura. Alias: `seguridad`. |
| `terms` | lista de `{term, meaning}` (hasta 6) | Palabras de cocina explicadas en español cotidiano, solo las de ese paso. Alias: `terminos`, `termino`, `significado`. |

Cada paso sin esos campos se ve como siempre.

## Cómo se guarda

Dentro de la app, `steps` sigue siendo la lista de textos y los detalles quedan en `stepDetails` (misma posición que cada paso). Los respaldos, los menús guardados, repetir un menú, exportar y restaurar conservan todos los campos.

- Importar **nunca sobrescribe** una receta tuya: si ya tienes una con el mismo título, se omite.
- Al editar una receta con detalles, se conservan mientras no cambies la **cantidad de pasos**. Si la cambias, la app avisa antes de quitar los detalles por paso.

## Archivos de ejemplo (datos ficticios, con imagen)

- `ejemplo-receta-detallada.json`: paquete de recetas (2 recetas). En «Menús › Recetario» usa «Importar recetas».
- `ejemplo-menu-detallado.json`: el mismo contenido como menú con días. Se importa desde «Menús» con «Importar menú con imágenes».

Una receta (la ensalada) trae utensilios, preparación previa, cantidades por paso, términos y notas. La otra (el pollo) usa solo datos que la receta de ejemplo ya decía, e incluye `limitations` y `safetyCheck` para ver cómo se muestra una receta con información pendiente.

Qué contenido es nuevo y necesita revisión antes de usarlo para cocinar: ver `CONTENIDO-PENDIENTE-DE-REVISION.md`.

## Al pedir recetas a ChatGPT

Pide que use solo datos reales: que **omita** un campo si no lo sabe y que **no invente** tiempos, temperaturas ni cantidades. Si falta algo esencial para cocinar con seguridad, que lo declare en `limitations`.
