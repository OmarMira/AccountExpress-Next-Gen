import { readFileSync, writeFileSync } from "fs";

const files = [
  "src/routes/accounts.routes.ts",
  "src/routes/audit.routes.ts",
  "src/routes/auth.routes.ts",
  "src/routes/bank.routes.ts",
  "src/routes/companies.routes.ts",
  "src/routes/fiscal-periods.routes.ts",
  "src/routes/journal.routes.ts",
  "src/server.ts"
];

for (const file of files) {
  let content = readFileSync(file, "utf8");
  
  // Fix cookie value types
  content = content.replace(/cookie\["session"\]\.value/g, '(cookie["session"].value as string)');
  
  // Fix query types
  content = content.replace(/query\.companyId/g, '(query.companyId as string)');
  content = content.replace(/query\.module/g, '(query.module as string)');
  content = content.replace(/query\.action/g, '(query.action as string)');
  content = content.replace(/query\.status/g, '(query.status as string)');
  content = content.replace(/query\.periodId/g, '(query.periodId as string)');
  content = content.replace(/query\.limit/g, '(query.limit as string)');
  content = content.replace(/query\.offset/g, '(query.offset as string)');
  
  // Fix params types
  content = content.replace(/params\.id/g, '(params.id as string)');
  
  // Fix error code check in server.ts
  content = content.replace(/if \(code === "NOT_FOUND"\)/g, 'if ((code as string) === "NOT_FOUND")');
  
  // Fix journal.routes.ts lines description typing
  if (file.includes("journal.routes.ts")) {
    content = content.replace(/body\.lines\n/g, 'body.lines.map((l: any) => ({ ...l, description: l.description ?? null }))\n');
  }

  // Deduplicate double casts if any
  content = content.replace(/\(query\.companyId as string\) as string/g, '(query.companyId as string)');
  content = content.replace(/\(params\.id as string\) as string/g, '(params.id as string)');
  content = content.replace(/\(cookie\["session"\]\.value as string\) as string/g, '(cookie["session"].value as string)');
  
  writeFileSync(file, content);
}

console.log("Types fixed!");
