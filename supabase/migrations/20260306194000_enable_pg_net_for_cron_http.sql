-- Ensure pg_net exists so cron jobs can call net.http_post(...).
CREATE EXTENSION IF NOT EXISTS pg_net;
