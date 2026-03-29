-- Usuario dedicado para AccountExpress (permisos mínimos)
CREATE USER accountexpress_app WITH PASSWORD 'a7X9k2P1wR4zL8mN5qV3sB6tH0yC1xA4vM2n';

-- Acceso a la base de datos
GRANT CONNECT ON DATABASE bookkeeping TO accountexpress_app;

-- Acceso al schema público
GRANT USAGE ON SCHEMA public TO accountexpress_app;

-- Solo operaciones de datos — sin DDL
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO accountexpress_app;

-- Permisos sobre secuencias (necesario para SERIAL/IDENTITY)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO accountexpress_app;

-- Aplicar mismos permisos a tablas futuras automáticamente
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO accountexpress_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO accountexpress_app;
