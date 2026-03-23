import { readFileSync } from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function run() {
  const buf = readFileSync('C:\\\\Users\\\\PC Omar\\\\Downloads\\\\bofaempresa2025\\\\eStmt_2025-02-28.pdf');
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buf) });
  const pdf = await loadingTask.promise;
  
  const lines: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
     const page = await pdf.getPage(i);
     const textContent = await page.getTextContent();
     const items = textContent.items as any[];
     const rows: { y: number, text: string }[] = [];

     items.forEach(item => {
         const y = Math.round(item.transform[5]);
         const text = item.str;
         if (!text.trim()) return;

         const row = rows.find(r => Math.abs(r.y - y) < 4);
         if (row) {
             row.text += ' ' + text;
         } else {
             rows.push({ y, text });
         }
     });

     rows.sort((a, b) => b.y - a.y);
     rows.forEach(r => lines.push(r.text));
  }

  const fullText = lines.join('\\n');
  const begMatch = fullText.match(/Beginning balance[^$]*\\$([\\d,]+\\.\\d{2})/i);
  console.log("DEBUG beginningBalance Regex Match:", begMatch);
  
  // Let's print the relevant lines containing beginning balance
  const bLines = lines.filter(l => l.toLowerCase().includes('beginning'));
  console.log("LINES WITH BEGINNING:", bLines);
  const vLines = lines.filter(l => l.includes('34,461.61'));
  console.log("LINES WITH BALANCE:", vLines);
}

run().catch(console.error);
