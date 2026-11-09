-- Tenant isolation and audit guarantees.
--
-- Model: the application normally connects as the table owner (trusted path, used for sign-up,
-- login and platform work). Every tenant-scoped request instead runs inside a transaction that
-- does `SET LOCAL ROLE servex_app` and `set_config('app.org_id', <org>, true)`. servex_app is not
-- the table owner and has NOBYPASSRLS, so the policies below decide what it can see and write.
-- If app.org_id is unset the policies match nothing (fail closed).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'servex_app') THEN
    CREATE ROLE servex_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  EXECUTE format('GRANT servex_app TO %I', current_user);
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Could not grant servex_app to %; grant it manually so the app can SET ROLE', current_user;
END
$$;
--> statement-breakpoint
CREATE FUNCTION app_current_org() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.org_id', true), '')::uuid $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO servex_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_current_org() TO servex_app;
--> statement-breakpoint
GRANT SELECT ON organizations TO servex_app;
--> statement-breakpoint
-- Only these columns can be changed from a tenant session. Slug, country, currency and status
-- stay under platform control.
GRANT UPDATE (name, timezone, locale, updated_at) ON organizations TO servex_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON memberships TO servex_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON branches TO servex_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON customers TO servex_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON audit_logs TO servex_app;
--> statement-breakpoint
GRANT SELECT (id, email, full_name, phone, status) ON users TO servex_app;
--> statement-breakpoint
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON organizations FOR SELECT TO servex_app
  USING (id = app_current_org());
--> statement-breakpoint
CREATE POLICY tenant_update ON organizations FOR UPDATE TO servex_app
  USING (id = app_current_org())
  WITH CHECK (id = app_current_org());
--> statement-breakpoint
CREATE POLICY tenant_isolation ON memberships FOR ALL TO servex_app
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());
--> statement-breakpoint
CREATE POLICY tenant_isolation ON branches FOR ALL TO servex_app
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());
--> statement-breakpoint
CREATE POLICY tenant_isolation ON customers FOR ALL TO servex_app
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());
--> statement-breakpoint
CREATE POLICY tenant_isolation ON audit_logs FOR SELECT TO servex_app
  USING (organization_id = app_current_org());
--> statement-breakpoint
CREATE POLICY tenant_insert ON audit_logs FOR INSERT TO servex_app
  WITH CHECK (organization_id = app_current_org());
--> statement-breakpoint
-- A user row is visible to servex_app only if that user is a member of the current organization.
CREATE POLICY tenant_members_only ON users FOR SELECT TO servex_app
  USING (EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.user_id = users.id AND m.organization_id = app_current_org()
  ));
--> statement-breakpoint
CREATE FUNCTION audit_logs_append_only() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = 'restrict_violation';
END
$$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_append_only();
