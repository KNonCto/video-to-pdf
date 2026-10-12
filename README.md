# Video a PDF de diapositivas

Página web estática que toma la grabación de una clase y genera un PDF con una página por diapositiva.

- **Recorta** las franjas negras y la cámara del profesor, así el PDF sólo muestra la diapositiva.
- **Omite las repetidas**: si el profesor vuelve a una diapositiva anterior, no se agrega de nuevo.
- **Une las animaciones**: si una diapositiva va mostrando viñetas de a una, se guarda sólo la versión completa (se puede desactivar).
- **Todo ocurre en el navegador**: el video no se sube a ningún lado, así que archivos de varios GB funcionan sin problema.

## Uso

1. Baja el video con [yt-dlp](https://github.com/yt-dlp/yt-dlp#installation) (en Windows: `winget install yt-dlp`). En la página, pega el link de YouTube y elige el disco: te arma el comando listo para copiar, que baja el video en la mejor calidad a `<disco>:\Users\<usuario>\Downloads`. Por ejemplo:
   ```
   yt-dlp --no-playlist -f "bv*/b" -P "C:\Users\%USERNAME%\Downloads" -o "%(title)s.%(ext)s" "https://www.youtube.com/watch?v=ID"
   ```
2. Abre la página y arrastra el video.
3. Revisa el recuadro de recorte que se detectó (puedes moverlo o ajustar sus bordes) y pulsa **Extraer diapositivas**.
4. Quita las diapositivas que no quieras y pulsa **Descargar PDF**.

Para un video de 2 horas, revisando cada 1 s, el análisis toma unos minutos. Con "Revisar cada 2 s" tarda la mitad.

Formatos: MP4 (H.264) y WebM (VP9/AV1) funcionan en Chrome, Edge y Firefox. MKV puede no funcionar en todos los navegadores.

## Cómo funciona

1. **Muestreo**: un `<video>` oculto salta a cada instante (`currentTime`) y el fotograma se dibuja en un `<canvas>`.
2. **Recorte** (`src/lib/cropDetect.ts`): se toman ~120 pares de fotogramas separados por 0,5 s a lo largo del video.
   - Las filas y columnas que siempre están negras son bordes, y se descartan.
   - Los píxeles que cambian en casi todos los pares son la cámara. La diapositiva, en cambio, sólo cambia cuando se pasa a la siguiente.
   - Se elige el rectángulo más grande que no incluya ninguna de esas zonas, y sus lados se ajustan a la línea más marcada cercana.
3. **Cambios de diapositiva** (`src/lib/slideDetector.ts`): cada muestra recortada se reduce a 256 px de ancho y se compara con la anterior, contando qué fracción de píxeles cambió.
   - Si cambió más del 2%, hay una transición. El cursor y el ruido de compresión no llegan a ese umbral.
   - Una diapositiva se acepta cuando la imagen se mantiene quieta al menos 2 muestras, y se guarda su último fotograma.
4. **Duplicados**: cada diapositiva aceptada se compara con todas las anteriores usando un dHash de 64 bits más la diferencia de píxeles. Si es igual a alguna, se descarta.
   - Si la nueva conserva intacto el contenido de una anterior y agrega más, es una animación: reemplaza a la anterior.
   - Si es una versión parcial de una ya guardada, se ignora.
5. **PDF** (`src/lib/pdf.ts`): jsPDF genera una página del tamaño exacto de cada recorte.

## Desarrollo

```sh
npm install
npm run dev        # servidor local
npm test           # tests unitarios (Vitest)
npm run e2e        # test de punta a punta (Playwright + video sintético; requiere python3, numpy, pillow, pypdf y ffmpeg)
npm run build      # build estático en dist/
```

## Publicar en GitHub Pages

En el repo, ve a **Settings → Pages → Source: GitHub Actions**. Cada push a `main` ejecuta `.github/workflows/deploy.yml`, que corre los tests, hace el build y publica la página.
