-- Must run in a separate migration from any use of new values (PostgreSQL 55P04).
ALTER TYPE pool_status ADD VALUE 'filled';
ALTER TYPE pool_status ADD VALUE 'drawing';
