# Video a PDF de diapositivas

**👉 Úsala aquí: https://knoncto.github.io/video-to-pdf/**

Página web que toma la grabación de una clase online y genera un PDF con una página por diapositiva. Sirve para tener los apuntes de una clase grabada sin sacar pantallazos a mano.

- **Recorta** las franjas negras y la cámara del profesor, así el PDF muestra sólo la diapositiva.
- **Omite las repetidas**: si el profesor vuelve a una diapositiva anterior, no se agrega de nuevo.
- **Une las animaciones**: si una diapositiva va mostrando viñetas de a una, se guarda sólo la versión completa. Se puede desactivar.
- **Ignora lo que tapa la diapositiva**: si un menú, una paleta o una ventana aparece encima un momento, se usa la versión limpia.
- **Te deja revisar antes de descargar**: puedes quitar diapositivas o elegir otra versión de una (por ejemplo, la que no tiene un menú encima).
- **Es privada**: todo ocurre en tu navegador. El video no se sube a ningún servidor, así que archivos de varios GB funcionan sin problema.

## Cómo usarla

### 1. Baja el video

La página no puede leer videos de YouTube directamente (YouTube no lo permite desde otra página), así que primero hay que bajarlo con [yt-dlp](https://github.com/yt-dlp/yt-dlp), un programa gratuito.

1. Instala yt-dlp. En Windows, abre PowerShell y ejecuta:
   ```
   winget install yt-dlp
   ```
   En Mac: `brew install yt-dlp`. Otras opciones en [la guía de instalación](https://github.com/yt-dlp/yt-dlp#installation).
2. En la página, pega el link del video en **"¿El video está en YouTube?"** y elige el disco donde está tu carpeta Descargas.
3. Copia el comando que aparece, pégalo en PowerShell o cmd y pulsa Enter.

El comando baja sólo ese video (aunque el link venga de una playlist), en la mejor calidad disponible, sin audio, y lo guarda en `<disco>:\Users\<tu usuario>\Downloads` con el nombre del video. Se ve así:

```
yt-dlp --no-playlist -f "bv*/b" -P "C:\Users\%USERNAME%\Downloads" -o "%(title)s.%(ext)s" "https://www.youtube.com/watch?v=ID"
```

> El comando generado está pensado para Windows. En Mac o Linux cambia la parte de `-P` por, por ejemplo, `-P ~/Downloads`.

### 2. Genera el PDF

1. Arrastra el video a la página o haz clic para elegirlo.
2. Revisa el recuadro azul: es la zona que se guardará de cada diapositiva. Si no quedó bien, arrástralo o mueve sus bordes.
3. Elige cada cuánto revisar el video (1 s por defecto) y pulsa **Extraer diapositivas**.
4. Revisa el resultado:
   - **Quitar** saca una diapositiva del PDF.
   - **Versión 1/2** aparece cuando hay más de una versión de la misma diapositiva (con un menú encima, una animación a medias…) y cambia la que va al PDF.
5. Pulsa **Descargar PDF**.

### Tiempo y formatos

- Para un video de 2 horas, revisando cada 1 s, el análisis toma varios minutos. Con "Revisar cada 2 s" tarda la mitad. Un video en 4K tarda bastante más que uno en 1080p.
- Funciona en Chrome, Edge y Firefox con videos MP4 o WebM (lo que baja yt-dlp). Los MKV pueden no abrir en todos los navegadores.
- Los pantallazos se guardan a la resolución real del video (en JPEG al 90%), así que la nitidez depende de la calidad con que se bajó el video.

### Limitaciones

- Si una diapositiva estuvo tapada todo el tiempo, no hay versión limpia que elegir.
- Lo que tapa la diapositiva se reconoce cuando tiene forma rectangular y dura poco (unos 8 s). Una burbuja de cámara redonda, por ejemplo, puede quedar como diapositiva aparte; se saca con **Quitar**.
- La página procesa cualquier video, aunque no sea una presentación: no revisa si el contenido son diapositivas.

## Cómo funciona

1. **Muestreo**: un `<video>` oculto salta a cada instante (`currentTime`) y el fotograma se dibuja en un `<canvas>`.
2. **Recorte** (`src/lib/cropDetect.ts`): se toman ~120 pares de fotogramas separados por 0,5 s a lo largo del video.
   - Las filas y columnas que siempre están negras son bordes, y se descartan.
   - Los píxeles que cambian en casi todos los pares son la cámara. La diapositiva, en cambio, sólo cambia cuando se pasa a la siguiente.
   - Se elige el rectángulo más grande que no incluya ninguna de esas zonas, y sus lados se ajustan a la línea más marcada cercana.
3. **Cambios de diapositiva** (`src/lib/slideDetector.ts`): cada muestra recortada se reduce a 256 px de ancho y se compara con la anterior, contando qué fracción de píxeles cambió.
   - Si cambió más del 2%, hay una transición. El cursor y el ruido de compresión no llegan a ese umbral.
   - Una diapositiva se acepta cuando la imagen se mantiene quieta al menos 2 muestras, y se guarda su último fotograma.
4. **Versiones de una misma diapositiva**: cada imagen aceptada se compara con las ya guardadas.
   - **Repetida** (dHash de 64 bits + diferencia de píxeles): sólo suma tiempo en pantalla a esa versión.
   - **Animación**: conserva intacto el contenido de otra y agrega más. Gana la versión completa.
   - **Algo encima**: difiere en una sola zona con forma de panel rectangular, dura poco y aparece junto a la versión limpia. Gana la versión que estuvo más tiempo en pantalla.
   - Si una versión "tapada" luego se ve mucho rato, era otra diapositiva y se separa.
5. **PDF** (`src/lib/pdf.ts`): jsPDF genera una página del tamaño exacto del recorte para cada diapositiva.
6. **Comando de descarga** (`src/lib/ytdlp.ts`): limpia el link (quita playlist, tiempo y parámetros) y arma el comando de yt-dlp.

Hecha con React, TypeScript y Vite. No usa servidor ni librerías de visión por computador: el análisis de imagen está escrito a mano sobre `<canvas>`.

## Desarrollo

```sh
npm install
npm run dev        # servidor local
npm test           # tests unitarios (Vitest)
npm run e2e        # test de punta a punta (Playwright + video sintético; requiere python3, numpy, pillow, pypdf y ffmpeg)
npm run build      # build estático en dist/
```

El test de punta a punta genera un video sintético (`e2e/make_video.py`) con bordes negros, una "cámara" en movimiento, una animación, un menú que tapa una diapositiva y una vuelta a una diapositiva anterior. Después verifica que el PDF tenga exactamente las 4 diapositivas esperadas, limpias y bien recortadas.

## Publicar tu propia copia

1. Haz un fork del repositorio.
2. En tu fork, ve a **Settings → Pages → Source: GitHub Actions**.
3. Cada push a `main` ejecuta `.github/workflows/deploy.yml`, que corre los tests, hace el build y publica la página en `https://<tu-usuario>.github.io/video-to-pdf/`.

Si el despliegue falla con "Branch main is not allowed to deploy to github-pages", ve a **Settings → Environments → github-pages** y agrega `main` a las ramas permitidas.
