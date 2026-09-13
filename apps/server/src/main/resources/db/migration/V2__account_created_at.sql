-- GET /api/accounts had no stable order — Postgres doesn't guarantee row order without an
-- ORDER BY, so the "first account" the frontend falls back to when nothing is selected yet
-- could differ between requests with no data change at all. This column gives it one, the
-- same created_at/current_timestamp pattern `transfer` already uses.
alter table account
    add column created_at timestamp with time zone not null default current_timestamp;
