-- ─────────────────────────────────────────
-- SmartPrice — Schema inicial PostgreSQL
-- Executado automaticamente pelo Docker na 1ª vez
-- ─────────────────────────────────────────

-- Extensão para UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabela de mensagens do chat
CREATE TABLE IF NOT EXISTS chat_messages (
    id          VARCHAR(64) PRIMARY KEY,
    from_cnpj   VARCHAR(20) NOT NULL,
    from_username VARCHAR(100),
    from_role   VARCHAR(20) DEFAULT 'user',
    to_cnpj     VARCHAR(20),
    to_username VARCHAR(100),
    text        TEXT,
    attachment  TEXT,
    attachment_type VARCHAR(50),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_chat_from_cnpj ON chat_messages(from_cnpj);
CREATE INDEX IF NOT EXISTS idx_chat_to_cnpj ON chat_messages(to_cnpj);
CREATE INDEX IF NOT EXISTS idx_chat_created_at ON chat_messages(created_at);

-- Tabela de usuários (se precisar migrar do Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email       VARCHAR(255) UNIQUE NOT NULL,
    cnpj        VARCHAR(20) UNIQUE,
    name        VARCHAR(200),
    role        VARCHAR(20) DEFAULT 'user',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de imagens (galeria MinIO)
CREATE TABLE IF NOT EXISTS images (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename    VARCHAR(255) NOT NULL,
    url         TEXT NOT NULL,
    size_bytes  BIGINT,
    mime_type   VARCHAR(100),
    uploaded_by VARCHAR(20),  -- CNPJ do usuário
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_images_uploaded_by ON images(uploaded_by);

COMMENT ON TABLE chat_messages IS 'Mensagens do chat SmartPrice';
COMMENT ON TABLE users IS 'Usuários do sistema';
COMMENT ON TABLE images IS 'Galeria de imagens hospedadas no MinIO';
