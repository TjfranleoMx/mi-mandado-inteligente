# Estado de verificación — versión 0.2

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

Sin sincronización, lectura de tickets ni inventario automático. Las recetas de
menú pueden reaparecer si se regenera después de registrar una compra; iniciar
una nueva semana cuando corresponda. Los respaldos y gastos deben permanecer
fuera del repositorio. El navegador puede eliminar datos: exportar respaldos.
