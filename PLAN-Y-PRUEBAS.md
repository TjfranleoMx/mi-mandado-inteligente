# Estado de verificación — versión 0.4

Pruebas originales: 8/8. Se agregaron regresiones de lógica, almacenamiento y caché.
El detalle de resultados se entrega en el informe de verificación.

## Cobertura automatizada

- Recetas, pasos, importación, creación manual y generación de listas.
- Decimales con coma, peso real, precio por unidad, importe fijo y registro de compras.
- Descarga y restauración de respaldo JSON; persistencia IndexedDB y localStorage alternativo.
- Reapertura sin red y creación de una segunda compra sin conexión.
- Manifest, iconos y criterios de instalación mediante Chrome sin modo incógnito.
- Pantallas móviles y escritorio, sin desbordamiento horizontal.
- El flujo probado no envía solicitudes a dominios externos.

## Android real — confirmado el 10 de noviembre de 2026

Se confirmó desde un teléfono Android la instalación y el uso de recetas y lista
sin conexión, tras cerrar y volver a abrir en modo avión. Evidencia: confirmación
manual del usuario. Las compras, importes y respaldos tienen cobertura automatizada
en Chrome con perfil móvil y escritorio, tanto localmente como contra la URL pública.

## Límites conservados

Sin sincronización, lectura de tickets ni inventario automático. Al regenerar se
descuentan las compras de recetas del menú activo; iniciar una nueva semana
reinicia ese descuento y conserva el historial. Los respaldos y gastos deben permanecer
fuera del repositorio. El navegador puede eliminar datos: exportar respaldos.

## Verificación v0.3

22 pruebas de lógica/almacenamiento y 20 pruebas de navegador local aprobadas.
Cobertura nueva: compras completas y parciales, conversión de unidades, menú
ampliado, nueva semana, persistencia sin red y tres opciones de apariencia.
La confirmación Android anterior corresponde a v0.2; v0.3 se prueba en Chrome
con perfil móvil y escritorio y no atribuye otra prueba manual al teléfono.

Se verifica también g/kg sin alterar tarifa por kilo, historial y corrección de ticket, y actualización de datos v0.2 con aceptación o rechazo de compras previas. Los menús guardados e imágenes quedan fuera de esta entrega.

## Verificación v0.4

Biblioteca y planes semanales independientes; lunes configurable y compra del fin de semana previo; fotos locales y de paquete JSON; revisión manual de casa con unidades compatibles; bloques de preparación numerados. Pruebas de respaldo sin repetición de imágenes, restauración de una biblioteca válida mayor a 25 MB y conservación de una receta retirada que otra semana utiliza. Las pruebas anteriores de compras, g/kg, temas e instalación se conservan.

Las pruebas de teléfono confirmadas por el usuario corresponden a v0.2. La v0.4 requiere verificación de publicación y se prueba con Chrome real en Windows y perfiles de pantalla móvil/escritorio; no se atribuye una nueva prueba física al teléfono.
