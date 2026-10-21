import { PDFDocument } from 'pdf-lib';
export async function exactA4(bytes:Uint8Array,expectedPages:number){
  const doc=await PDFDocument.load(bytes);
  if(doc.getPageCount()!==expectedPages)throw new Error(`La maquetación produjo ${doc.getPageCount()} hojas para ${expectedPages} muebles.`);
  // Chromium rounds physical sizes to device pixels; normalize the MediaBox to exact mm.
  const width=297/25.4*72,height=210/25.4*72;
  for(const page of doc.getPages()){
    page.scaleContent(width/page.getWidth(),height/page.getHeight());
    page.setSize(width,height);page.setCropBox(0,0,width,height);
  }
  doc.setTitle('Planos Santo · Guías de armado A4');doc.setProducer('Planos Santo');
  return doc.save();
}
