-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pg-boss requires these tables, but we let pg-boss create them on first run
-- Just ensure the extension is available
