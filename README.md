# Mi Mandado Inteligente — versión 0.3

Aplicación PWA **offline-first** para Android y computadora: recetas con pasos, menú semanal, lista editable, cantidades reales de compra, precios unitarios y totales, gastos por mes y categorías, historial de precios, respaldo JSON e importación rápida de recetas generadas en ChatGPT.

## Arranque local

Se debe abrir con un servidor web; **no** abriendo `index.html` con doble clic, porque el modo offline y los módulos requieren un contexto HTTP(S).

```bash
python -m http.server 8000
```

Abre `http://localhost:8000/` en el navegador de la computadora. Los service workers pueden funcionar en `localhost`. Para instalarla en Android usa una dirección **HTTPS** (por ejemplo, GitHub Pages).

## Publicar en GitHub Pages

1. Crea un repositorio (por ejemplo, `mi-mandado-inteligente`).
2. Sube **los archivos de esta carpeta en la raíz** del repositorio, sin incluir la carpeta contenedora.
3. Ve a **Settings → Pages → Build and deployment**, elige `Deploy from a branch`, rama `main` y directorio `/(root)`.
4. Abre `https://TjfranleoMx.github.io/mi-mandado-inteligente/` desde Chrome en Android, conectado a internet la primera vez.
5. Usa el menú de Chrome → «Agregar a pantalla principal» o «Instalar app». Abre la aplicación una vez más conectado a internet y luego prueba el modo avión.

Los pasos de interfaz pueden variar ligeramente según GitHub y Chrome. GitHub Pages es público por defecto: **sube solo el código**, nunca tus respaldos con tickets o gastos. Los registros de la app se guardan en tu dispositivo.

## Cómo utilizarla

1. En **Recetas**, selecciona las que quieras hacer y las veces que las prepararás.
2. Pulsa **Generar lista del menú**. Agrupamos ingredientes con el mismo nombre y unidades compatibles (kg/g; l/ml). Los artículos extra agregados manualmente no se eliminan al regenerar.
3. En **Mandado**, anota cantidad planeada y cantidad real por separado. Por ejemplo, receta `1 kg`, comprado `1,300 kg` y precio por kilo `$120`: total real `$156`. También puedes escribir directamente el total del ticket y se recalcula el precio por unidad.
4. Marca artículos comprados y pulsa **Registrar compra** para incorporarlos al historial. Los pendientes quedan en la lista.
5. Cuando termine la semana, pulsa **Empezar una semana nueva** para limpiar la lista y elegir un menú nuevo. El historial permanece intacto. En **Gastos**, filtra por mes, revisa categorías, corrige datos o descarga un CSV.
6. En **Configuración**, cambia presupuesto/tienda y descarga respaldos frecuentes.

La aplicación no consulta precios en línea. Utiliza los precios que ingresas y conserva la información de cada compra para construir el historial. La diferencia «compraste más» no es un inventario automático de lo cocinado.

## Cómo importar recetas desde ChatGPT

Pide: «Dame mis cinco recetas para 3 adultos en formato JSON compatible con Mi Mandado Inteligente». El archivo debe ser un objeto con `recipes`, un arreglo de objetos, cada uno con `title`, `servings`, `minutes`, `ingredients` y `steps`.

- Unidades admitidas: `kg`, `g`, `l`, `ml`, `pza`, `paquete`.
- Categorías: `Verduras y frutas`, `Proteínas`, `Cereales y legumbres`, `Lácteos`, `Despensa`, `Limpieza`, `Higiene`, `Otros`.
- Cada ingrediente debe tener `name`, `quantity`, `unit`, `category`.
- `steps` debe ser un arreglo de textos, un paso por elemento.

Ver [`ejemplo-importar-recetas.json`](./ejemplo-importar-recetas.json). En la app, pulsa **Importar recetas** y selecciona el archivo descargado.

## Privacidad y límites de esta versión

- No hay registro de usuario, nubes ni sincronización entre equipos.
- Guardado en IndexedDB con alternativa localStorage, sujeto a los límites del navegador. Haz respaldos manuales: si borras los datos del sitio, podrías perder la información.
- Se requiere conexión una primera vez para instalar y descargar recursos estáticos. El modo sin internet puede probarse con modo avión **después de la primera carga correcta**.
- No se incluyen precios reales, descuentos automáticos ni cálculos clínicos. Las recetas orientativas no sustituyen al personal médico.
- No cuenta todavía con escáner de tickets, lector de códigos, integración directa desde ChatGPT ni sincronización con otros dispositivos.
- Al regenerar, se descuenta lo comprado para el menú activo. Si ya cubriste una cantidad, ese producto no aparece; si compraste menos o amplías el menú, aparece solo lo pendiente. **Empezar una semana nueva** reinicia este descuento y conserva el historial.

## Pruebas automáticas

```bash
npm ci
npm test
npm run test:e2e
```

## Tecnologías

HTML5, CSS3 y JavaScript sin paquetes externos; IndexedDB para datos, Service Worker para archivos estáticos y Web App Manifest para instalación. No requiere base de datos en la nube ni costo mensual para el código estático.

## Cambios de la versión 0.2

- Corrección del cambio de foco entre campos: ya no se pierde la escritura del siguiente precio.
- Conversión del peso y precio al regenerar una lista con unidades distintas.
- Identificadores únicos al importar recetas; validación de fechas e importes vacíos.
- Caché aislada por ruta y solo para recursos de la aplicación.
- IndexedDB sigue funcionando si localStorage está bloqueado.
- Valores iniciales neutros: presupuesto en cero y tienda configurable.

Las pruebas de navegador usan Chrome real con emulación móvil Pixel 7 y escritorio. No equivalen a instalar en un teléfono Android real. Para ejecutarlas fuera de Windows configura CHROME_PATH con la ruta del navegador; APP_URL permite verificar un despliegue HTTPS.

## Cambios de la versión 0.3

- Lista del menú con descuento de compras registradas: no repite productos cubiertos.
- Compras parciales y unidades kg/g o l/ml: solo muestra la cantidad que falta.
- Iniciar una semana nueva conserva gastos e historial y reinicia las compras del menú.
- Ajustes → Apariencia: Claro, Oscuro o Como el celular. Funciona sin red y se guarda en el dispositivo y en el respaldo.
- Compatibilidad con datos v0.2: se conservan listas e historial. Como esa versión no identificaba el menú de cada compra, al actualizar se pregunta una sola vez si las compras de recetas de esta semana pertenecen al menú seleccionado. Sin confirmación no se asocian. Después se guardan referencias explícitas; no cambia automáticamente el menú al pasar de semana en el calendario.

Al actualizar, abre con conexión para descargar la nueva versión y vuelve a abrir la aplicación. No borres datos ni desinstales para actualizar.

- Los pesos menores a 1 kg se muestran en gramos en recetas, mandado e historial. El precio de productos por peso se captura por kilo; 600 g a 120 MXN/kg dan 72 MXN. La unidad presentada cambia al terminar de editar, conservando cantidades y precios del registro original.
