import { statementImportService } from "../src/services/bank/statement-import.service";
import { matchTransaction } from "../src/services/bank/reconciliation.service";
import { suggestAccount } from "../src/services/bank/smart-match.service";
import { db } from "../src/db/connection";
import { bankTransactions, companies, fiscalPeriods, users, chartOfAccounts, sessions } from "../src/db/schema";
import { randomUUID } from "node:crypto";
import * as fs from "fs";
import * as path from "path";
import { eq, like, desc } from "drizzle-orm";

async function getRequiredEntities() {
    const company = await db.query.companies.findFirst();
    if (!company) throw new Error("No company found");

    const user = await db.query.users.findFirst({ where: eq(users.username, 'admin') });
    if (!user) throw new Error("No admin user found");

    let period = await db.query.fiscalPeriods.findFirst({ where: eq(fiscalPeriods.companyId, company.id) });
    if (!period) {
        await db.insert(fiscalPeriods).values({
            id: randomUUID(),
            companyId: company.id,
            name: "Test Period",
            periodType: "month",
            startDate: "2026-01-01",
            endDate: "2026-12-31",
            status: "open",
            createdAt: new Date()
        });
        period = await db.query.fiscalPeriods.findFirst({ where: eq(fiscalPeriods.companyId, company.id) });
    }
    if (!period) throw new Error("No fiscal period found");

    let allAccounts = await db.query.chartOfAccounts.findMany({ limit: 2 });
    if (allAccounts.length < 2) {
        await db.insert(chartOfAccounts).values([
            {
                id: randomUUID(),
                companyId: company.id,
                code: "9998",
                name: "Test Asset",
                accountType: "asset",
                normalBalance: "debit",
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date()
            },
            {
                id: randomUUID(),
                companyId: company.id,
                code: "9999",
                name: "Test Expense",
                accountType: "expense",
                normalBalance: "debit",
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        ]);
        allAccounts = await db.query.chartOfAccounts.findMany({ limit: 2 });
    }
    const expenseAcc = allAccounts[0];
    const bankAcc = allAccounts[1];

    let session = await db.query.sessions.findFirst({ where: eq(sessions.userId, user.id) });
    if (!session) {
        await db.insert(sessions).values({
            id: randomUUID(),
            userId: user.id,
            companyId: company.id,
            ipAddress: "127.0.0.1",
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 8 * 3600 * 1000),
            lastActiveAt: new Date()
        });
        session = await db.query.sessions.findFirst({ where: eq(sessions.userId, user.id) });
    }

    return { company, user, period, expenseAcc: expenseAcc!, bankAcc: bankAcc!, session: session! };
}

async function runTests() {
    console.log("🚀 Iniciando pruebas de importación bancaria...");
    let passed = 0;
    const total = 6;

    try {
        const { company, user, period, expenseAcc, bankAcc, session } = await getRequiredEntities();

        // Limpiar para el test
        await db.delete(bankTransactions).where(eq(bankTransactions.companyId, company.id));

        const baseDir = path.join(__dirname, "test-data");

        // ── Test 1: Importar CSV formato Chase ──
        const chaseFile = fs.readFileSync(path.join(baseDir, "chase-sample.csv"));
        const chaseRes = await statementImportService.processFile(company.id, "CHASE-TEST", chaseFile, "chase-sample.csv");
        
        if (chaseRes.importedCount === 5 && chaseRes.duplicateCount === 0) {
            console.log("✅ Test 1: Importar CSV formato Chase con 5 transacciones → 5 filas importadas correctamente.");
            passed++;
        } else {
            console.error(`❌ Test 1 Falló: Importó ${chaseRes.importedCount}, Duplicados: ${chaseRes.duplicateCount}`);
        }

        // ── Test 2: Importar mismo CSV (Deduplicación) ──
        const chaseRes2 = await statementImportService.processFile(company.id, "CHASE-TEST", chaseFile, "chase-sample.csv");
        if (chaseRes2.importedCount === 0 && chaseRes2.duplicateCount === 5) {
            console.log("✅ Test 2: Importar mismo CSV → 0 nuevas filas (deduplicación funciona).");
            passed++;
        } else {
            console.error(`❌ Test 2 Falló: Importó ${chaseRes2.importedCount}, Duplicados: ${chaseRes2.duplicateCount}`);
        }

        // ── Test 3: Importar OFX ──
        const ofxFile = fs.readFileSync(path.join(baseDir, "sample.ofx"));
        const ofxRes = await statementImportService.processFile(company.id, "OFX-TEST", ofxFile, "sample.ofx");
        if (ofxRes.importedCount === 3) {
            console.log("✅ Test 3: Importar OFX con 3 transacciones → 3 filas correctamente parseadas.");
            passed++;
        } else {
            console.error(`❌ Test 3 Falló: Importó ${ofxRes.importedCount}`);
        }

        // ── Test 4: Importar QFX ──
        const qfxFile = fs.readFileSync(path.join(baseDir, "sample.qfx"));
        const qfxRes = await statementImportService.processFile(company.id, "QFX-TEST", qfxFile, "sample.qfx");
        if (qfxRes.importedCount === 3) {
            console.log("✅ Test 4: Importar QFX con 3 transacciones → 3 filas correctamente parseadas.");
            passed++;
        } else {
            console.error(`❌ Test 4 Falló: Importó ${qfxRes.importedCount}`);
        }

        // ── Test 5: Conciliar transacción ──
        const txTarget = await db.query.bankTransactions.findFirst({
            where: eq(bankTransactions.amount, "-155.00")
        });
        
        if (!txTarget) throw new Error("No se encontró la transacción de -$155.00");
        
        const draftId = await matchTransaction(
            company.id,
            txTarget.id,
            expenseAcc.id,
            bankAcc.id,
            period.id,
            user.id,
            session.id,
            "127.0.0.1"
        );

        const txAfter = await db.query.bankTransactions.findFirst({
            where: eq(bankTransactions.id, txTarget.id)
        });

        if (txAfter?.status === 'reconciled' && txAfter.journalEntryId === draftId) {
            console.log("✅ Test 5: Conciliar una transacción de -$155 → journal_entry creado, status=reconciled.");
            passed++;
        } else {
            console.error("❌ Test 5 Falló: La transacción no fue conciliada correctamente.");
        }

        // ── Test 6: Smart Match ──
        const suggestions = await suggestAccount(company.id, txTarget.description);
        if (suggestions.length > 0 && suggestions[0].accountId === expenseAcc.id) {
            console.log("✅ Test 6: smart-match sugiere cuenta correcta para segunda transacción similar.");
            passed++;
        } else {
            console.error("❌ Test 6 Falló: Smart match no sugirió la cuenta correcta.", suggestions);
        }

    } catch (error) {
        console.error("Error durante las pruebas:", error);
    }


    if (passed === total) {
        console.log(`\n🎉 Todos los ${total} tests pasaron exitosamente.`);
        process.exit(0);
    } else {
        console.log(`\n⚠️ Pasaron ${passed} de ${total} tests.`);
        process.exit(1);
    }
}

runTests();
