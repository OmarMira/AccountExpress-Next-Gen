// ============================================================
// US GAAP CHART OF ACCOUNTS SEED
// Codes 1000–5999 following standard US GAAP classification.
// All seeded accounts have is_system=1 (cannot be deleted).
// Each company gets a copy seeded at creation time.
// ============================================================

export interface AccountSeed {
  code: string;
  name: string;
  accountType: "asset" | "liability" | "equity" | "revenue" | "expense";
  normalBalance: "debit" | "credit";
  parentCode: string | null; // used to resolve parent_id during seed
  level: number;
  taxCategory: string | null;
  description: string | null;
}

export const GAAP_ACCOUNTS: AccountSeed[] = [
  // ══════════════════════════════════════════════════════════
  // ASSETS (1000–1999) — Normal Balance: DEBIT
  // ══════════════════════════════════════════════════════════

  // ── Current Assets
  { code: "1000", name: "Current Assets",                     accountType: "asset",    normalBalance: "debit",  parentCode: null,   level: 1, taxCategory: null, description: "Short-term assets convertible to cash within 12 months" },
  { code: "1010", name: "Cash — Checking Account",            accountType: "asset",    normalBalance: "debit",  parentCode: "1000", level: 2, taxCategory: "Schedule C - Cash", description: "Primary operating checking account" },
  { code: "1020", name: "Cash — Savings / Money Market",      accountType: "asset",    normalBalance: "debit",  parentCode: "1000", level: 2, taxCategory: "Schedule C - Cash", description: "Interest-bearing savings or money market account" },
  { code: "1030", name: "Petty Cash",                         accountType: "asset",    normalBalance: "debit",  parentCode: "1000", level: 2, taxCategory: "Schedule C - Cash", description: "Small cash on hand for minor expenses" },
  { code: "1100", name: "Accounts Receivable",                accountType: "asset",    normalBalance: "debit",  parentCode: "1000", level: 2, taxCategory: "Schedule C - Accounts Receivable", description: "Amounts owed by customers for goods/services delivered" },
  { code: "1110", name: "Allowance for Doubtful Accounts",    accountType: "asset",    normalBalance: "credit", parentCode: "1100", level: 3, taxCategory: null, description: "Contra-asset: estimated uncollectible receivables" },
  { code: "1200", name: "Inventory",                          accountType: "asset",    normalBalance: "debit",  parentCode: "1000", level: 2, taxCategory: "Schedule C - Inventory", description: "Goods held for sale (FIFO or Weighted Average)" },
  { code: "1300", name: "Prepaid Expenses",                   accountType: "asset",    normalBalance: "debit",  parentCode: "1000", level: 2, taxCategory: null, description: "Expenses paid in advance (insurance, rent, subscriptions)" },
  { code: "1310", name: "Prepaid Insurance",                  accountType: "asset",    normalBalance: "debit",  parentCode: "1300", level: 3, taxCategory: null, description: "Insurance premiums paid in advance" },
  { code: "1400", name: "Other Current Assets",               accountType: "asset",    normalBalance: "debit",  parentCode: "1000", level: 2, taxCategory: null, description: "Miscellaneous short-term assets" },

  // ── Fixed Assets
  { code: "1500", name: "Fixed Assets",                       accountType: "asset",    normalBalance: "debit",  parentCode: null,   level: 1, taxCategory: null, description: "Long-term tangible assets used in operations" },
  { code: "1510", name: "Equipment",                          accountType: "asset",    normalBalance: "debit",  parentCode: "1500", level: 2, taxCategory: "Form 4562 - Depreciation", description: "Machinery, computers, and tools owned by the business" },
  { code: "1520", name: "Accumulated Depreciation — Equipment", accountType: "asset",  normalBalance: "credit", parentCode: "1510", level: 3, taxCategory: "Form 4562 - Depreciation", description: "Contra-asset: accumulated depreciation on equipment" },
  { code: "1530", name: "Furniture & Fixtures",               accountType: "asset",    normalBalance: "debit",  parentCode: "1500", level: 2, taxCategory: "Form 4562 - Depreciation", description: "Office furniture and store fixtures" },
  { code: "1540", name: "Accumulated Depreciation — Furniture", accountType: "asset",  normalBalance: "credit", parentCode: "1530", level: 3, taxCategory: "Form 4562 - Depreciation", description: "Contra-asset: accumulated depreciation on furniture" },
  { code: "1550", name: "Vehicles",                           accountType: "asset",    normalBalance: "debit",  parentCode: "1500", level: 2, taxCategory: "Form 4562 - Depreciation", description: "Business-owned vehicles" },
  { code: "1560", name: "Accumulated Depreciation — Vehicles", accountType: "asset",   normalBalance: "credit", parentCode: "1550", level: 3, taxCategory: "Form 4562 - Depreciation", description: "Contra-asset: accumulated depreciation on vehicles" },
  { code: "1570", name: "Buildings & Improvements",           accountType: "asset",    normalBalance: "debit",  parentCode: "1500", level: 2, taxCategory: "Form 4562 - Depreciation", description: "Owned real property and leasehold improvements" },
  { code: "1580", name: "Accumulated Depreciation — Buildings", accountType: "asset",  normalBalance: "credit", parentCode: "1570", level: 3, taxCategory: "Form 4562 - Depreciation", description: "Contra-asset: accumulated depreciation on buildings" },
  { code: "1590", name: "Land",                               accountType: "asset",    normalBalance: "debit",  parentCode: "1500", level: 2, taxCategory: null, description: "Land owned (not depreciable)" },

  // ── Other Assets
  { code: "1900", name: "Other Long-Term Assets",             accountType: "asset",    normalBalance: "debit",  parentCode: null,   level: 1, taxCategory: null, description: "Intangibles, deposits, and other non-current assets" },
  { code: "1910", name: "Security Deposits",                  accountType: "asset",    normalBalance: "debit",  parentCode: "1900", level: 2, taxCategory: null, description: "Deposits paid to landlords or utilities" },
  { code: "1920", name: "Intangible Assets",                  accountType: "asset",    normalBalance: "debit",  parentCode: "1900", level: 2, taxCategory: null, description: "Patents, trademarks, copyrights, goodwill" },
  { code: "1930", name: "Accumulated Amortization",           accountType: "asset",    normalBalance: "credit", parentCode: "1920", level: 3, taxCategory: null, description: "Contra-asset: accumulated amortization on intangibles" },

  // ══════════════════════════════════════════════════════════
  // LIABILITIES (2000–2999) — Normal Balance: CREDIT
  // ══════════════════════════════════════════════════════════

  // ── Current Liabilities
  { code: "2000", name: "Current Liabilities",                accountType: "liability", normalBalance: "credit", parentCode: null,   level: 1, taxCategory: null, description: "Obligations due within 12 months" },
  { code: "2010", name: "Accounts Payable",                   accountType: "liability", normalBalance: "credit", parentCode: "2000", level: 2, taxCategory: null, description: "Amounts owed to suppliers for goods/services received" },
  { code: "2100", name: "Accrued Liabilities",                accountType: "liability", normalBalance: "credit", parentCode: "2000", level: 2, taxCategory: null, description: "Expenses incurred but not yet paid" },
  { code: "2110", name: "Accrued Wages & Salaries",           accountType: "liability", normalBalance: "credit", parentCode: "2100", level: 3, taxCategory: null, description: "Employee compensation earned but not yet paid" },
  { code: "2120", name: "Accrued Payroll Taxes",              accountType: "liability", normalBalance: "credit", parentCode: "2100", level: 3, taxCategory: null, description: "FICA, FUTA, SUTA taxes owed" },
  { code: "2130", name: "Accrued Interest",                   accountType: "liability", normalBalance: "credit", parentCode: "2100", level: 3, taxCategory: null, description: "Interest expense accrued but not yet paid" },
  { code: "2200", name: "Sales Tax Payable",                  accountType: "liability", normalBalance: "credit", parentCode: "2000", level: 2, taxCategory: null, description: "State and local sales tax collected, owed to authorities" },
  { code: "2210", name: "Florida Sales Tax Payable",          accountType: "liability", normalBalance: "credit", parentCode: "2200", level: 3, taxCategory: "DR-15 - Sales Tax", description: "Florida DR-15 sales tax payable" },
  { code: "2300", name: "Short-Term Notes Payable",           accountType: "liability", normalBalance: "credit", parentCode: "2000", level: 2, taxCategory: null, description: "Notes and loans due within 12 months" },
  { code: "2400", name: "Unearned Revenue",                   accountType: "liability", normalBalance: "credit", parentCode: "2000", level: 2, taxCategory: null, description: "Customer deposits and prepaid revenue not yet earned" },
  { code: "2500", name: "Current Portion of Long-Term Debt",  accountType: "liability", normalBalance: "credit", parentCode: "2000", level: 2, taxCategory: null, description: "Long-term debt due within 12 months" },

  // ── Long-Term Liabilities
  { code: "2600", name: "Long-Term Liabilities",              accountType: "liability", normalBalance: "credit", parentCode: null,   level: 1, taxCategory: null, description: "Obligations due beyond 12 months" },
  { code: "2610", name: "Long-Term Notes Payable",            accountType: "liability", normalBalance: "credit", parentCode: "2600", level: 2, taxCategory: null, description: "Long-term loans and notes payable" },
  { code: "2620", name: "Mortgage Payable",                   accountType: "liability", normalBalance: "credit", parentCode: "2600", level: 2, taxCategory: null, description: "Real property mortgage" },
  { code: "2900", name: "Other Long-Term Liabilities",        accountType: "liability", normalBalance: "credit", parentCode: null,   level: 1, taxCategory: null, description: "Deferred tax liabilities and other long-term obligations" },

  // ══════════════════════════════════════════════════════════
  // EQUITY (3000–3999) — Normal Balance: CREDIT
  // ══════════════════════════════════════════════════════════

  { code: "3000", name: "Equity",                             accountType: "equity",   normalBalance: "credit", parentCode: null,   level: 1, taxCategory: null, description: "Owner's residual interest in the business" },
  { code: "3010", name: "Owner's Capital",                    accountType: "equity",   normalBalance: "credit", parentCode: "3000", level: 2, taxCategory: null, description: "Sole proprietorship / partnership capital contributions" },
  { code: "3020", name: "Owner's Drawing",                    accountType: "equity",   normalBalance: "debit",  parentCode: "3000", level: 2, taxCategory: null, description: "Contra-equity: withdrawals by owner (not a salary expense)" },
  { code: "3100", name: "Common Stock",                       accountType: "equity",   normalBalance: "credit", parentCode: "3000", level: 2, taxCategory: null, description: "Par value of issued common shares" },
  { code: "3110", name: "Additional Paid-In Capital",         accountType: "equity",   normalBalance: "credit", parentCode: "3000", level: 2, taxCategory: null, description: "Proceeds above par value on stock issuances" },
  { code: "3900", name: "Retained Earnings",                  accountType: "equity",   normalBalance: "credit", parentCode: "3000", level: 2, taxCategory: null, description: "Cumulative net income retained in the business" },
  { code: "3950", name: "Current Year Earnings",              accountType: "equity",   normalBalance: "credit", parentCode: "3000", level: 2, taxCategory: null, description: "Net income/loss for the current fiscal year (closing entry target)" },

  // ══════════════════════════════════════════════════════════
  // REVENUE (4000–4999) — Normal Balance: CREDIT
  // ══════════════════════════════════════════════════════════

  { code: "4000", name: "Revenue",                            accountType: "revenue",  normalBalance: "credit", parentCode: null,   level: 1, taxCategory: null, description: "All income earned from business operations" },
  { code: "4010", name: "Sales Revenue",                      accountType: "revenue",  normalBalance: "credit", parentCode: "4000", level: 2, taxCategory: "Schedule C - Gross Receipts", description: "Revenue from sale of goods" },
  { code: "4020", name: "Service Revenue",                    accountType: "revenue",  normalBalance: "credit", parentCode: "4000", level: 2, taxCategory: "Schedule C - Gross Receipts", description: "Revenue from services rendered" },
  { code: "4030", name: "Sales Returns & Allowances",         accountType: "revenue",  normalBalance: "debit",  parentCode: "4010", level: 3, taxCategory: null, description: "Contra-revenue: refunds and allowances granted to customers" },
  { code: "4040", name: "Sales Discounts",                    accountType: "revenue",  normalBalance: "debit",  parentCode: "4010", level: 3, taxCategory: null, description: "Contra-revenue: early payment discounts given" },
  { code: "4100", name: "Interest Income",                    accountType: "revenue",  normalBalance: "credit", parentCode: "4000", level: 2, taxCategory: "Schedule B - Interest Income", description: "Interest earned on bank accounts and investments" },
  { code: "4900", name: "Other Income",                       accountType: "revenue",  normalBalance: "credit", parentCode: "4000", level: 2, taxCategory: "Schedule C - Other Income", description: "Miscellaneous income not classified elsewhere" },

  // ══════════════════════════════════════════════════════════
  // EXPENSES (5000–5999) — Normal Balance: DEBIT
  // ══════════════════════════════════════════════════════════

  { code: "5000", name: "Cost of Goods Sold",                 accountType: "expense",  normalBalance: "debit",  parentCode: null,   level: 1, taxCategory: "Schedule C - Cost of Goods Sold", description: "Direct cost of merchandise sold or services delivered" },
  { code: "5010", name: "Purchases",                          accountType: "expense",  normalBalance: "debit",  parentCode: "5000", level: 2, taxCategory: "Schedule C - Cost of Goods Sold", description: "Inventory and raw material purchases" },
  { code: "5020", name: "Direct Labor",                       accountType: "expense",  normalBalance: "debit",  parentCode: "5000", level: 2, taxCategory: "Schedule C - Cost of Goods Sold", description: "Labor directly tied to production or service delivery" },
  { code: "5030", name: "Freight — Inbound",                  accountType: "expense",  normalBalance: "debit",  parentCode: "5000", level: 2, taxCategory: "Schedule C - Cost of Goods Sold", description: "Shipping cost to receive inventory" },

  // ── Operating Expenses
  { code: "5100", name: "Operating Expenses",                 accountType: "expense",  normalBalance: "debit",  parentCode: null,   level: 1, taxCategory: null, description: "Recurring expenses to run the business" },
  { code: "5110", name: "Salaries & Wages",                   accountType: "expense",  normalBalance: "debit",  parentCode: "5100", level: 2, taxCategory: "Schedule C - Wages", description: "Gross wages paid to all employees" },
  { code: "5120", name: "Payroll Tax Expense",                accountType: "expense",  normalBalance: "debit",  parentCode: "5100", level: 2, taxCategory: "Schedule C - Taxes and Licenses", description: "Employer share of FICA, FUTA, SUTA" },
  { code: "5130", name: "Rent Expense",                       accountType: "expense",  normalBalance: "debit",  parentCode: "5100", level: 2, taxCategory: "Schedule C - Rent or Lease", description: "Rent for office, warehouse, or equipment" },
  { code: "5140", name: "Utilities",                          accountType: "expense",  normalBalance: "debit",  parentCode: "5100", level: 2, taxCategory: "Schedule C - Utilities", description: "Electricity, water, gas, internet, phone" },
  { code: "5150", name: "Insurance Expense",                  accountType: "expense",  normalBalance: "debit",  parentCode: "5100", level: 2, taxCategory: "Schedule C - Insurance", description: "General liability, property, and professional insurance" },
  { code: "5160", name: "Office Supplies",                    accountType: "expense",  normalBalance: "debit",  parentCode: "5100", level: 2, taxCategory: "Schedule C - Office Expense", description: "Paper, toner, pens, and other consumable office supplies" },
  { code: "5170", name: "Advertising & Marketing",            accountType: "expense",  normalBalance: "debit",  parentCode: "5100", level: 2, taxCategory: "Schedule C - Advertising", description: "Ads, promotions, social media, website costs" },
  { code: "5180", name: "Professional Fees",                  accountType: "expense",  normalBalance: "debit",  parentCode: "5100", level: 2, taxCategory: "Schedule C - Professional Services", description: "CPA, attorney, consulting fees" },
  { code: "5190", name: "Bank Charges & Fees",                accountType: "expense",  normalBalance: "debit",  parentCode: "5100", level: 2, taxCategory: "Schedule C - Other Expenses", description: "Bank service charges, wire fees, payment processing fees" },
  { code: "5200", name: "Repairs & Maintenance",              accountType: "expense",  normalBalance: "debit",  parentCode: "5100", level: 2, taxCategory: "Schedule C - Repairs and Maintenance", description: "Equipment and property repairs" },
  { code: "5210", name: "Vehicle Expense",                    accountType: "expense",  normalBalance: "debit",  parentCode: "5100", level: 2, taxCategory: "Schedule C - Car and Truck Expenses", description: "Fuel, oil, tires, and vehicle maintenance" },
  { code: "5220", name: "Travel & Meals (50%)",               accountType: "expense",  normalBalance: "debit",  parentCode: "5100", level: 2, taxCategory: "Schedule C - Meals (50%)", description: "Business travel; meals limited to 50% deductibility" },
  { code: "5230", name: "Telephone & Internet",               accountType: "expense",  normalBalance: "debit",  parentCode: "5100", level: 2, taxCategory: "Schedule C - Utilities", description: "Business phone and internet service" },
  { code: "5240", name: "Software & Subscriptions",           accountType: "expense",  normalBalance: "debit",  parentCode: "5100", level: 2, taxCategory: "Schedule C - Other Expenses", description: "SaaS, cloud services, software licenses" },
  { code: "5250", name: "Postage & Shipping",                 accountType: "expense",  normalBalance: "debit",  parentCode: "5100", level: 2, taxCategory: "Schedule C - Other Expenses", description: "Outbound shipping and postage costs" },
  { code: "5260", name: "Licenses & Permits",                 accountType: "expense",  normalBalance: "debit",  parentCode: "5100", level: 2, taxCategory: "Schedule C - Taxes and Licenses", description: "Business licenses, state registrations, permits" },
  { code: "5270", name: "Dues & Subscriptions",               accountType: "expense",  normalBalance: "debit",  parentCode: "5100", level: 2, taxCategory: "Schedule C - Other Expenses", description: "Professional dues, trade memberships, publications" },
  { code: "5280", name: "Charitable Contributions",           accountType: "expense",  normalBalance: "debit",  parentCode: "5100", level: 2, taxCategory: "Schedule A - Charitable Contributions", description: "Donations to qualified charities" },

  // ── Depreciation & Amortization
  { code: "5400", name: "Depreciation Expense",               accountType: "expense",  normalBalance: "debit",  parentCode: "5100", level: 2, taxCategory: "Form 4562 - Depreciation", description: "Periodic depreciation of fixed assets" },
  { code: "5410", name: "Amortization Expense",               accountType: "expense",  normalBalance: "debit",  parentCode: "5100", level: 2, taxCategory: "Form 4562 - Amortization", description: "Periodic amortization of intangible assets" },

  // ── Interest & Other
  { code: "5500", name: "Interest Expense",                   accountType: "expense",  normalBalance: "debit",  parentCode: "5100", level: 2, taxCategory: "Schedule A - Mortgage Interest", description: "Interest paid on loans and lines of credit" },
  { code: "5900", name: "Income Tax Expense",                 accountType: "expense",  normalBalance: "debit",  parentCode: null,   level: 1, taxCategory: "Form 1120/1040 - Tax", description: "Federal and state income tax expense (corporations/S-corps)" },
  { code: "5990", name: "Miscellaneous Expense",              accountType: "expense",  normalBalance: "debit",  parentCode: "5100", level: 2, taxCategory: "Schedule C - Other Expenses", description: "Small one-off expenses not classified elsewhere" },
];
