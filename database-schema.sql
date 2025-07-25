-- Tabela de usuários
-- Nota: password_hash armazena senhas em texto simples para uso pessoal
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, -- Senha em texto simples
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de envelopes
CREATE TABLE IF NOT EXISTS envelopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'Documento para Assinatura',
  pdf_path TEXT NOT NULL,
  signatories JSONB NOT NULL,
  signature_positions JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  creator_ip TEXT,
  signatures JSONB DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de assinaturas
CREATE TABLE IF NOT EXISTS signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id UUID REFERENCES envelopes(id) ON DELETE CASCADE,
  signatory JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'expired')),
  signature_data JSONB,
  signer_ip TEXT,
  signed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de eventos (auditoria completa)
CREATE TABLE IF NOT EXISTS envelope_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id UUID REFERENCES envelopes(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'delivered', 'signed', 'completed', 'viewed', 'downloaded', 'resent', 'cancelled')),
  description TEXT NOT NULL,
  user_ip TEXT,
  user_agent TEXT,
  signatory_name TEXT,
  signatory_email TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_envelopes_status ON envelopes(status);
CREATE INDEX IF NOT EXISTS idx_envelopes_created_at ON envelopes(created_at);
CREATE INDEX IF NOT EXISTS idx_signatures_envelope_id ON signatures(envelope_id);
CREATE INDEX IF NOT EXISTS idx_signatures_status ON signatures(status);
CREATE INDEX IF NOT EXISTS idx_envelope_events_envelope_id ON envelope_events(envelope_id);
CREATE INDEX IF NOT EXISTS idx_envelope_events_type ON envelope_events(event_type);
CREATE INDEX IF NOT EXISTS idx_envelope_events_created_at ON envelope_events(created_at);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE envelopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE envelope_events ENABLE ROW LEVEL SECURITY;

-- Políticas de segurança básicas (ajuste conforme necessário)
CREATE POLICY "Allow all operations for now" ON users FOR ALL USING (true);
CREATE POLICY "Allow all operations for now" ON envelopes FOR ALL USING (true);
CREATE POLICY "Allow all operations for now" ON signatures FOR ALL USING (true);
CREATE POLICY "Allow all operations for now" ON envelope_events FOR ALL USING (true);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_envelopes_updated_at 
    BEFORE UPDATE ON envelopes 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();