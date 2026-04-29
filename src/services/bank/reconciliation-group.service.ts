import { db } from "../../db/connection.ts";
import { 
  bankTransactions, 
  bankTransactionGroups, 
  bankTransactionGroupItems, 
  bankAccounts
} from "../../db/schema/index.ts";
import { eq, and, inArray } from "drizzle-orm";
import { createDraft, post } from "../journal-core.service.ts";
import { recalculateBankAccountBalance } from "./reconciliation.service.ts";

export async function createGroup(input: {
  companyId: string;
  description: string;
  transactionIds: string[];
  glAccountId: string;
}): Promise<{ groupId: string; totalAmount: number }> {
  if (input.transactionIds.length === 0) {
    throw new Error("Debe proveer al menos un transactionId");
  }

  return await db.transaction(async (tx) => {
    // 1. Verificar transacciones
    const transactions = await tx
      .select({
        id: bankTransactions.id,
        companyId: bankTransactions.companyId,
        status: bankTransactions.status,
        amount: bankTransactions.amount,
      })
      .from(bankTransactions)
      .where(inArray(bankTransactions.id, input.transactionIds));

    if (transactions.length !== input.transactionIds.length) {
      throw new Error("Una o más transacciones no existen.");
    }

    let totalAmount = 0;

    for (const txn of transactions) {
      if (txn.companyId !== input.companyId) {
        throw new Error(`La transacción ${txn.id} no pertenece a la compañía.`);
      }
      if (txn.status !== "pending" && txn.status !== "assigned") {
        throw new Error(`La transacción ${txn.id} ya no está pendiente o asignada (status: ${txn.status}).`);
      }
      // sum amount, convert numeric(15,2) string to cents integer
      totalAmount += Math.round(Number(txn.amount) * 100);
    }

    // 2. Crear el grupo
    const [group] = await tx.insert(bankTransactionGroups).values({
      companyId: input.companyId,
      description: input.description,
      totalAmount,
      glAccountId: input.glAccountId,
      status: "pending"
    }).returning({ id: bankTransactionGroups.id });

    // 3. Crear los items del grupo
    const groupItems = input.transactionIds.map(tId => ({
      groupId: group.id,
      transactionId: tId
    }));

    await tx.insert(bankTransactionGroupItems).values(groupItems);

    return { groupId: group.id, totalAmount };
  });
}

export async function reconcileGroup(input: {
  groupId: string;
  companyId: string;
  periodId: string;
  userId: string;
  sessionId: string;
  ipAddress: string;
  bankAccountGlId: string;
  source?: 'auto_matched' | 'manual' | 'new_entry';
}): Promise<{ journalEntryId: string }> {

  return await db.transaction(async (tx) => {
    // 1. Buscar grupo y validar
    const [group] = await tx
      .select()
      .from(bankTransactionGroups)
      .where(and(
        eq(bankTransactionGroups.id, input.groupId),
        eq(bankTransactionGroups.companyId, input.companyId)
      ))
      .limit(1);

    if (!group) throw new Error("Grupo no encontrado o no pertenece a la compañía.");
    if (group.status !== "pending") throw new Error("El grupo ya se encuentra conciliado.");

    // 2. Obtener transacciones vía group_items
    const items = await tx
      .select({ transactionId: bankTransactionGroupItems.transactionId })
      .from(bankTransactionGroupItems)
      .where(eq(bankTransactionGroupItems.groupId, group.id));

    const transactionIds = items.map(i => i.transactionId);

    const entryDate = new Date().toISOString().split("T")[0];

    // 3. Preparar líneas del diario contable
    const amountFloat = group.totalAmount / 100;
    const absAmount = Math.abs(amountFloat);

    const bankLine = {
      accountId: input.bankAccountGlId,
      debitAmount: amountFloat > 0 ? absAmount : 0,
      creditAmount: amountFloat < 0 ? absAmount : 0,
      lineNumber: 1,
      description: `Conciliación en Grupo: ${group.description}`
    };

    const targetLine = {
      accountId: group.glAccountId,
      debitAmount: amountFloat < 0 ? absAmount : 0,
      creditAmount: amountFloat > 0 ? absAmount : 0,
      lineNumber: 2,
      description: `Acreditación en Grupo: ${group.description}`
    };

    // 4. Crear draft dentro de la misma transacción
    const draftId = await createDraft({
      companyId: input.companyId,
      entryDate,
      description: `Grupo Conciliado: ${group.description}`,
      reference: group.id,
      isAdjusting: false,
      periodId: input.periodId,
      createdBy: input.userId
    }, [bankLine, targetLine], tx);

    // 5. Postear dentro de la misma transacción
    await post(draftId, input.userId, input.sessionId, input.ipAddress, tx);

    const now = new Date();

    // 6. Actualizar status del grupo — atómico con el journal entry
    await tx.update(bankTransactionGroups)
      .set({
        status: "reconciled",
        journalEntryId: draftId,
        reconciledAt: now
      })
      .where(eq(bankTransactionGroups.id, group.id));

    // 7. Actualizar status de cada transacción — atómico con todo lo anterior
    if (transactionIds.length > 0) {
      await tx.update(bankTransactions)
        .set({
          status: "reconciled",
          journalEntryId: draftId,
          glAccountId: group.glAccountId,
          matchedBy: input.userId,
          matchedAt: now,
          matchSource: input.source || 'new_entry'
        })
        .where(inArray(bankTransactions.id, transactionIds));
    }

    // 8. Recalculate Bank Account Balance
    // We need to find the bank account record. We take it from the first transaction in the group.
    if (transactionIds.length > 0) {
      const [firstTx] = await tx
        .select({ bankAccount: bankTransactions.bankAccount })
        .from(bankTransactions)
        .where(eq(bankTransactions.id, transactionIds[0]))
        .limit(1);

      if (firstTx) {
        const [accountRecord] = await tx
          .select({ id: bankAccounts.id })
          .from(bankAccounts)
          .where(
            and(
              eq(bankAccounts.companyId, input.companyId),
              eq(bankAccounts.accountNumber, firstTx.bankAccount)
            )
          )
          .limit(1);

        if (accountRecord) {
          await recalculateBankAccountBalance(input.companyId, accountRecord.id, tx);
        }
      }
    }

    return { journalEntryId: draftId };
  });
}
