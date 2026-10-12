import { jsPDF } from 'jspdf';

export interface PdfSlide {
  blob: Blob;
  width: number;
  height: number;
}

/** Una página por diapositiva, del mismo tamaño (y proporción) que la imagen. */
export async function buildPdf(slides: PdfSlide[]): Promise<Blob> {
  if (!slides.length) throw new Error('No hay diapositivas');
  const PT_PER_PX = 0.75;
  const size = (s: PdfSlide): [number, number] => [s.width * PT_PER_PX, s.height * PT_PER_PX];
  const orient = (s: PdfSlide) => (s.width >= s.height ? 'landscape' : 'portrait');
  const doc = new jsPDF({ unit: 'pt', format: size(slides[0]), orientation: orient(slides[0]), compress: true });
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    if (i > 0) doc.addPage(size(s), orient(s));
    const bytes = new Uint8Array(await s.blob.arrayBuffer());
    const [w, h] = size(s);
    doc.addImage(bytes, 'JPEG', 0, 0, w, h, undefined, 'NONE');
  }
  return doc.output('blob');
}
