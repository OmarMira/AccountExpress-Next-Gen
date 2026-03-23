import { readFileSync } from 'fs';
import { parseBankPDF } from './src/services/pdf-bank-parser';

// Make a fake File object
class MockFile {
  name: string;
  buffer: Buffer;
  constructor(buffer: Buffer, name: string) {
    this.name = name;
    this.buffer = buffer;
  }
  async arrayBuffer() {
    return this.buffer.buffer.slice(this.buffer.byteOffset, this.buffer.byteOffset + this.buffer.byteLength);
  }
}

async function run() {
  const buf = readFileSync('C:\\\\Users\\\\PC Omar\\\\Downloads\\\\bofaempresa2025\\\\eStmt_2025-02-28.pdf');
  const file = new MockFile(buf, 'eStmt.pdf');
  const result = await parseBankPDF(file as any);
  console.log('DEBUG beginningBalance:', result.beginningBalance);
}

run().catch(console.error);
