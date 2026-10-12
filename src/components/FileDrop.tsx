import { useRef, useState } from 'react';

const YTDLP_CMD = 'yt-dlp -f "bv*[ext=mp4][height<=720]" -o clase.mp4 "LINK_DEL_VIDEO"';

export function FileDrop({ onFile }: { onFile: (f: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [copied, setCopied] = useState(false);

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
  };

  return (
    <div className="stack">
      <div
        className={`drop ${over ? 'over' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          pick(e.dataTransfer.files);
        }}
      >
        <strong>Arrastra el video de la clase aquí</strong>
        <span className="muted">o haz clic para elegirlo (MP4 o WebM)</span>
        <input
          ref={input}
          type="file"
          accept="video/*"
          data-testid="file-input"
          hidden
          onChange={(e) => pick(e.target.files)}
        />
      </div>
      <p className="muted small">
        El video no se sube a ningún servidor: se procesa en tu navegador, así que archivos de varios GB funcionan
        igual.
      </p>
      <details className="help">
        <summary>¿Cómo bajo un video de YouTube?</summary>
        <p>
          Instala <a href="https://github.com/yt-dlp/yt-dlp#installation" target="_blank" rel="noreferrer">yt-dlp</a>{' '}
          y ejecuta (baja sólo la imagen en 720p, sin audio, que pesa mucho menos):
        </p>
        <div className="code">
          <code>{YTDLP_CMD}</code>
          <button
            className="ghost"
            onClick={() => {
              navigator.clipboard?.writeText(YTDLP_CMD).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      </details>
    </div>
  );
}
