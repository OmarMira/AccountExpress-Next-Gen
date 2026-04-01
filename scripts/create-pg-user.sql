-- Create the application database user
-- IMPORTANT: Replace YOUR_SECURE_PASSWORD_HERE with a strong password.
-- Store the real password in your .env file as DATABASE_URL, never in this file.
CREATE USER accountexpress_app WITH PASSWORD 'YOUR_SECURE_PASSWORD_HERE';
GRANT CONNECT ON DATABASE accountexpress TO accountexpress_app;
GRANT USAGE ON SCHEMA public TO accountexpress_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO accountexpress_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO accountexpress_app;
