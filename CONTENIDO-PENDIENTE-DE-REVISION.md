# Contenido de cocina pendiente de revisión

Los archivos `ejemplo-receta-detallada.json` y `ejemplo-menu-detallado.json` son para **probar la importación**. Todo el contenido de cocina está **pendiente de tu revisión** antes de usarlo para cocinar. Aquí se separa lo que ya existía de lo nuevo.

## Receta «Pollo con calabacitas y frijoles (ejemplo con límites)»

**Ya existía** (tomado tal cual de la receta de ejemplo de la app): ingredientes y cantidades, los textos de los 4 pasos (el paso 4 sin la frase de carbohidratos), «74 °C en su centro», porciones y minutos.

**Nuevo, por revisar:**
- El paso 4 pierde la frase «Ajusta las porciones de carbohidratos según el plan de alimentación individual», que pasa a **Notas** con el mismo texto. Decidir si este cambio te parece bien.
- Las cantidades que aparecen dentro de cada paso: salen de la lista de ingredientes y de qué ingredientes menciona cada paso. Revisar que coincidan con lo que quieres.
- «Sartén» como único utensilio (es la única palabra de utensilio que ya estaba en el texto).
- La comprobación de seguridad del paso 2 repite el dato que ya estaba («74 °C en su centro»).
- La sección «información pendiente» (`limitations`): dice qué **no** trae la receta (fuego, tiempo, otra comprobación del pollo, tamaño de cubos, cómo desinfectar). No agrega instrucciones.

**Sigue faltando** (no se inventó): nivel de fuego, tiempo, señal de que el aceite está caliente, tamaño de los cubos, cómo desinfectar, qué cantidad va en cada plato.

## Receta «Ensalada de jitomate y aguacate (ejemplo con detalles)»

Es una receta **nueva escrita para el ejemplo**; no existía antes. Todo su contenido necesita revisión:
- Ingredientes y cantidades (jitomate 300 g, aguacate 1 pieza, cebolla 50 g, limón 1 pieza, aceite 10 ml, sal 2 g).
- Utensilios: tabla, cuchillo, plato hondo, cuchara.
- Preparación previa: lavar con agua potable.
- Pasos, comprobaciones («los trozos de tamaño parecido», «prueba y ajusta la sal») y explicaciones de palabras (cubos, cuadritos, hueso, pulpa).
- No lleva fuego, tiempo ni temperaturas, porque no se cocina.

## Recetas ya guardadas en tu app

No se modificó ninguna. Las recetas que ya tienes siguen abriéndose igual y pueden usarse en «Cocinar paso a paso», con el texto de sus pasos. Si alguna necesita avisar que le falta información esencial (por ejemplo la de pollo de la app), hay que agregar `limitations` a esa receta: la app no lo deduce sola.
