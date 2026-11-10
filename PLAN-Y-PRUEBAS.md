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

## Pendiente en un Android real

1. Abrir la URL HTTPS con Chrome e instalar desde su menú.
2. Abrir una receta y generar la lista.
3. Registrar una compra ficticia; cerrar la aplicación.
4. Activar modo avión y abrirla desde su icono: comprobar receta, lista y gasto.
5. Crear otro artículo sin conexión y confirmar que permanece al reiniciar.

La emulación móvil en Windows comprueba interfaz y flujo, pero no demuestra la
instalación WebAPK ni la conservación del almacenamiento por Android.

## Límites conservados

Sin sincronización, lectura de tickets ni inventario automático. Las recetas de
menú pueden reaparecer si se regenera después de registrar una compra; iniciar
una nueva semana cuando corresponda. Los respaldos y gastos deben permanecer
fuera del repositorio. El navegador puede eliminar datos: exportar respaldos.
