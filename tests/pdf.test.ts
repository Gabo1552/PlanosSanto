import { expect,it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { exactA4 } from '../lib/pdf';
it('fija dimensiones físicas A4 exactas y rechaza hojas adicionales',async()=>{
  const doc=await PDFDocument.create();doc.addPage([842.01,595.11]);doc.addPage([842.01,595.11]);
  const bytes=await doc.save(),result=await PDFDocument.load(await exactA4(bytes,2));
  for(const page of result.getPages()){expect(page.getWidth()/72*25.4).toBeCloseTo(297,8);expect(page.getHeight()/72*25.4).toBeCloseTo(210,8);}
  await expect(exactA4(bytes,1)).rejects.toThrow(/hojas/);
});
