-- ─────────────────────────────────────────
-- SmartPrice — Migração Supabase → PostgreSQL local
-- ─────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── products ──────────────────────────────
CREATE TABLE IF NOT EXISTS products (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    subtitle    TEXT,
    price       TEXT,
    image       TEXT,
    category    TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ── settings ──────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
    id         TEXT PRIMARY KEY,
    value      JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ── support_conversations ─────────────────
CREATE TABLE IF NOT EXISTS support_conversations (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    TEXT NOT NULL,
    user_name  TEXT,
    status     TEXT DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ── support_messages ──────────────────────
CREATE TABLE IF NOT EXISTS support_messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES support_conversations(id) ON DELETE CASCADE,
    sender_id       TEXT NOT NULL,
    sender_name     TEXT NOT NULL,
    sender_type     TEXT NOT NULL,
    message         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ── chat_messages (recriar completa) ──────
DROP TABLE IF EXISTS chat_messages;
CREATE TABLE chat_messages (
    id              TEXT PRIMARY KEY,
    from_cnpj       TEXT NOT NULL,
    from_username   TEXT NOT NULL,
    from_role       TEXT NOT NULL,
    to_cnpj         TEXT,
    to_username     TEXT,
    text            TEXT,
    attachment      TEXT,
    attachment_type TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── Índices para performance ───────────────
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_at);
CREATE INDEX IF NOT EXISTS idx_support_conv_user ON support_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_support_msg_conv ON support_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_from_cnpj ON chat_messages(from_cnpj);
CREATE INDEX IF NOT EXISTS idx_chat_to_cnpj ON chat_messages(to_cnpj);

-- ── users (atualizar com cnpj como campo) ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS cnpj TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banner TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

SELECT 'Migração concluída com sucesso!' as status;
