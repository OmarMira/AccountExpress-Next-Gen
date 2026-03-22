import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log("Logging in...");
  await page.goto('http://localhost:5173/');
  await page.fill('input[type="text"]', 'admin');
  await page.fill('input[type="password"]', '6627Mira');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  
  console.log("Selecting Company...");
  const companyBtn = await page.$('text="Demo Company LLC"');
  if (companyBtn) await companyBtn.click();
  else await page.click('button:has-text("Seleccionar Empresa")');
  await page.waitForTimeout(1000);
  
  console.log("Navigating to Bank Reconciliation...");
  await page.goto('http://localhost:5173/reconciliation');
  await page.waitForTimeout(2000);
  
  console.log("Uploading PDF...");
  await page.setInputFiles('input[type="file"]', 'C:\\Users\\PC Omar\\Downloads\\bofaempresa2025\\eStmt_2025-02-28.pdf');
  
  console.log("Waiting for processing...");
  await page.waitForTimeout(5000); // UI says "Extraendo transacciones..." then success message
  
  console.log("Capturing screenshot...");
  await page.screenshot({ path: 'C:\\Users\\PC Omar\\.gemini\\antigravity\\brain\\006efcbf-7f97-4ed5-8c17-2499b0495071\\pdf_extracted_transactions_live.png', fullPage: true });
  
  console.log("Done!");
  await browser.close();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
