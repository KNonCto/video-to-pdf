import { useRef, useState } from 'react';
import { DRIVES, INSTALL_COMMAND, buildCommand, normalizeVideoUrl } from '../lib/ytdlp';

const DRIVE_KEY = 'ytdlp-drive';

function loadDrive(): string {
  try {
    const d = localStorage.getItem(DRIVE_KEY);
    if (d && DRIVES.includes(d)) return d;
  } catch {
    // sin almacenamiento disponible: usamos C:
  }
  return 'C';
}

function CopyBox({ text, testId }: { text: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="code">
      <code data-testid={testId}>{text}</code>
      <button
        className="ghost"
        onClick={() => {
          navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
}

function YtDlpHelper() {
  const [link, setLink] = useState('');
  const [drive, setDrive] = useState(loadDrive);
  const url = normalizeVideoUrl(link);

  return (
    <section className="help stack">
      <h2>¿El video está en YouTube?</h2>
      <p className="muted small">Pega el link y copia el comando para bajarlo en la mejor calidad a tu carpeta Descargas.</p>
      <div className="ytdlp-inputs">
        <input
          type="url"
          className="text-input"
          placeholder="Pega el link del video"
          aria-label="Link del video"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        <label className="drive">
          Disco{' '}
          <select
            value={drive}
            aria-label="Disco de destino"
            onChange={(e) => {
              setDrive(e.target.value);
              try {
                localStorage.setItem(DRIVE_KEY, e.target.value);
              } catch {
                // ignorar
              }
            }}
          >
            {DRIVES.map((d) => (
              <option key={d} value={d}>
                {d}:
              </option>
            ))}
          </select>
        </label>
      </div>
      {url ? (
        <CopyBox text={buildCommand(url, drive)} testId="ytdlp-command" />
      ) : (
        link.trim() && <p className="muted small">Ese link no parece válido.</p>
      )}
      <ol className="muted small steps">
        <li>Abre PowerShell o cmd, pega el comando y pulsa Enter.</li>
        <li>
          El video queda en <code>{drive}:\Users\&lt;tu usuario&gt;\Downloads</code>, con el nombre del video. Luego
          arrástralo arriba.
        </li>
        <li>
          ¿No tienes yt-dlp? Instálalo una vez con:
          <CopyBox text={INSTALL_COMMAND} />
        </li>
      </ol>
    </section>
  );
}

export function FileDrop({ onFile }: { onFile: (f: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

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
      <YtDlpHelper />
    </div>
  );
}
