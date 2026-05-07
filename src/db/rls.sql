-- Habilitar RLS en las tablas críticas
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_company_roles ENABLE ROW LEVEL SECURITY;

-- Crear función helper para obtener el company_id actual de la sesión
CREATE OR REPLACE FUNCTION get_current_company_id()
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
    RETURN COALESCE(current_setting('app.current_company_id', true), '');
END;
$$;

-- Política para bank_transactions
CREATE POLICY bank_transactions_tenant_isolation ON bank_transactions
    USING (company_id = get_current_company_id());

-- Política para journal_entries
CREATE POLICY journal_entries_tenant_isolation ON journal_entries
    USING (company_id = get_current_company_id());

-- Política para journal_lines
CREATE POLICY journal_lines_tenant_isolation ON journal_lines
    USING (company_id = get_current_company_id());

-- Política para chart_of_accounts
CREATE POLICY chart_of_accounts_tenant_isolation ON chart_of_accounts
    USING (company_id = get_current_company_id());

-- Política para fiscal_periods
CREATE POLICY fiscal_periods_tenant_isolation ON fiscal_periods
    USING (company_id = get_current_company_id());

-- Política para bank_accounts
CREATE POLICY bank_accounts_tenant_isolation ON bank_accounts
    USING (company_id = get_current_company_id());

-- Política para user_company_roles
CREATE POLICY user_company_roles_tenant_isolation ON user_company_roles
    USING (company_id = get_current_company_id());
