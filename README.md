# Xook

**Xook** («leer» en maya yucateco) es una app gratuita para leer PDF y EPUB con técnicas de lectura rápida, narrador, universos por autor y una biblioteca pensada para decenas de miles de libros. Hecha con Electron + React + TypeScript.

## Plataformas

- **Windows** (ahora): instalador `Xook-<versión>-setup.exe`.
- **macOS / Linux**: el mismo código compila con `npm run build:mac` / `npm run build:linux` (sin probar aún).
- **Android / iOS** (futuro): la interfaz ya es responsiva (funciona desde 360 px de ancho); la capa nativa (SQLite, archivos, PDF, correo, voces) se portará con Capacitor.

## Modos de lectura

- **RSVP**: una palabra (o bloque de 1-4) a la vez en un punto fijo, con la letra de reconocimiento óptimo (ORP) resaltada. Elimina movimientos oculares y regresiones.
- **Guiado**: texto completo con la oración actual resaltada y la palabra activa marcada; el texto ya leído se atenúa (modo foco) para evitar releer. Opción de resaltar el inicio de cada palabra.

## Entrenamiento

- Velocidad ajustable de 100 a 1200 ppm (↑/↓ o botones ±).
- Pausas automáticas en puntuación y párrafos.
- Entrenamiento progresivo: sube la velocidad N ppm cada X palabras hasta un máximo.
- Al terminar una sesión se guarda la velocidad real y se ofrece un quiz de comprensión (completar la palabra faltante) con recomendación de subir/bajar velocidad.
- La biblioteca guarda progreso, historial de sesiones y estadísticas globales.

## Biblioteca y portadas

- Vista **Portadas** tipo Cover Flow (← → o rueda para navegar, Enter o clic en la portada central para abrir), vista **Lista** y pestaña **Anotaciones**.
- La portada se extrae del EPUB (imagen de portada del manifiesto) o del PDF (primera página). Si no hay, se busca automáticamente en Open Library y Google Books (solo se acepta si título/autor coinciden); con **Cambiar portada** puedes buscar y elegir otra.
- Tema oscuro/claro con el botón ☀/☾ de la biblioteca (también sepia desde Ajustes). Toda la interfaz usa Roboto empaquetada localmente.

## Bibliotecas grandes (miles o millones de libros)

- La biblioteca vive en **SQLite** (`library.db` en la carpeta de datos, con índices y FTS5); `library.json` antiguo se migra solo la primera vez.
- **Importar carpeta**: recorre subcarpetas, importa PDF y EPUB en paralelo (4 a la vez) solo con metadatos (título, autor, portada del EPUB), omite los que ya están y muestra progreso con cancelación. El texto se extrae al abrir el libro o con **Ajustes → Indexar texto en segundo plano** (un libro a la vez); las portadas de PDF se generan cuando el libro aparece en pantalla.
- La interfaz pide solo lo que muestra: listas paginadas y virtualizadas, Cover Flow que carga páginas de 60 alrededor de la posición, universos y anotaciones con "Cargar más", portadas servidas como archivos por `cover://` (nada en memoria).
- Búsqueda de texto con FTS5 (`bm25`), acentos ignorados; abarca los libros con texto extraído.

## Búsqueda, conversión y envío a dispositivos

- **Búsqueda** en la biblioteca y dentro de cada universo: encuentra libros por título/autor y también texto dentro de todos los libros (índice en el proceso principal, sin acentos ni mayúsculas); clic en un resultado abre el libro en ese párrafo. Dentro del lector, 🔍 o `Ctrl+F` busca en el libro abierto.
- **Convertir formato** (⇄): EPUB, PDF (A5 paginado), Word (.docx), TXT, Markdown y HTML, todo nativo sin programas externos.
- **Enviar a dispositivo** (✉): por correo SMTP (Gmail, Outlook, iCloud, Yahoo o personalizado; contraseña de aplicación guardada cifrada con Windows) al correo del Kindle/móvil, eligiendo formato original/EPUB/PDF; o copiar por USB a un Kindle/Kobo detectado o a cualquier carpeta.
- Bibliotecas grandes: orden por reciente/añadido/título/autor/progreso, lista con renderizado diferido, Cover Flow que solo dibuja las portadas cercanas y atmósferas estáticas en las tarjetas de universos.

## Modo Libro (lectura tipo Kindle)

- Botón **📖 Libro** en el lector: texto paginado (sin scroll), sin controles a la vista; toca el centro o pulsa `Esc` para mostrar/ocultar la barra, que también aparece al acercar el mouse arriba.
- Pasar página: clic en el borde derecho/izquierdo, `← →`, `PageUp/PageDown`, espacio o rueda del mouse. Barra de estado con capítulo, página y % restante.
- **Aa**: tamaño, tipografía (Georgia, Times, Roboto, Segoe UI, Consolas), interlineado, márgenes, columnas (auto/1/2), tema de página (claro, sepia, oscuro o el de la app) y justificado.
- **⛶ / F11**: pantalla completa. Subrayados, diccionario y notas funcionan igual que en el modo Guiado. El último modo usado se recuerda al abrir un libro.

## Narrador y audiolibros

- Motor de voz (Configuración → Narrador): **Automático** usa voces neuronales de Microsoft por internet y, si el servicio falla o no hay conexión, cambia solo a las **voces locales de Windows** (Raúl, Sabina…); también puedes fijar uno u otro.

- Modo **Escuchar** en el lector: voces neuronales de Microsoft Edge (gratis, requiere internet) leen el libro con resaltado de la palabra en curso; el progreso de lectura avanza con el audio.
- Botón 🎙 para elegir narrador: voces curadas en español (México, España, Argentina, Chile, Colombia, EE. UU., Perú, Venezuela) e inglés, con descripción del estilo, botón **Probar** (lee un fragmento del propio libro), ritmo y tono, y opción de aplicar al libro o a todos. La app sugiere una voz según el universo/género del libro y el idioma detectado.
- Velocidad 0.8×–1.5×; el audio generado se guarda en caché (`%APPDATA%/xook/data/audio`).
- **⤓ Audiolibro** exporta el libro completo a una carpeta como un MP3 por capítulo, con progreso y cancelación.

## Universos

- Cada autor detectado al importar crea (o se une a) un **universo**; la pestaña **Universos** los muestra como tarjetas con su atmósfera.
- La página de un universo es inmersiva: fondo animado generado por la app (presets Cósmico, Fantasía, Ciencia ficción, Gótico, Misterio, Océano, Desierto, Biblioteca; el preset se sugiere según el autor), color de acento e imagen de fondo propia opcional.
- Puedes renombrarlo y describirlo (clic en el título), añadir/quitar autores (los libros nuevos de esos autores entran solos), asignar libros manualmente o importar directo al universo.
- Con "Atmósfera del universo al leer" (Ajustes) el lector usa el fondo y el acento del universo del libro.

## Diccionario, subrayados y notas

- En modo Guiado, selecciona texto con el mouse: aparece una barra para subrayar (4 colores), agregar una nota o ver la definición.
- Al seleccionar una sola palabra (o hacer clic en la palabra en modo RSVP) se busca automáticamente su definición en Wikcionario (es), con respaldo de Wiktionary (en) y Wikipedia. Requiere conexión a internet.
- Clic sobre un subrayado para cambiar color, editar la nota o quitarlo.
- El panel **Notas** del lector lista los subrayados del libro (ir al fragmento, editar, borrar, copiar todo como texto). La pestaña **Anotaciones** de la biblioteca muestra las de todos los libros.

## Atajos

`espacio` reproducir/pausar · `↑ ↓` ±10 ppm (con Shift ±50) · `← →` oración anterior/siguiente · `Ctrl + rueda` / pellizco en touchpad: tamaño de letra · `Esc` cierra el popover

## Desarrollo

```bash
npm install
npm run dev
```

Abrir un archivo directo al arrancar: `LECTOR_OPEN="ruta/libro.epub" npm run dev` (o pasar la ruta como argumento al ejecutable empaquetado).

## Compilar instalador para Windows

```bash
npm run build:win
```

El instalador queda en `dist/` (`Xook-1.0.0-setup.exe`, NSIS, sin firma digital: Windows SmartScreen puede pedir «Más información → Ejecutar de todas formas» la primera vez). Para probar sin instalar: `npx electron-builder --dir` genera `dist/win-unpacked/Xook.exe`.

## Datos

Biblioteca y texto extraído se guardan en `%APPDATA%/xook/data/` (o en la carpeta que elijas en Ajustes → Carpeta de datos).

## Publicación y actualizaciones

- Cada etiqueta `vX.Y.Z` en GitHub compila el instalador y crea la *Release* automáticamente (`.github/workflows/release.yml`).
- La app comprueba actualizaciones al arrancar (electron-updater, GitHub Releases) y las instala al cerrar.
- Para publicar una versión: sube el número en `package.json`, `git commit`, `git tag v1.0.1`, `git push --tags`.

## Licencia

Xook es software libre bajo la licencia **GPL-3.0**: puedes usarlo, estudiarlo, modificarlo y redistribuirlo, siempre que las versiones derivadas se publiquen con la misma licencia. Es gratis; si te sirve, considera apoyar el proyecto con una donación (botón «Apoyar el proyecto» en Configuración → Acerca de).
