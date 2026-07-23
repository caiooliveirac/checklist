-- Fotos de inconformidade lançadas pelo plantonista na página da unidade.
-- A imagem fica no próprio banco (bytea) e é expurgada após 7 dias (croner no index.ts).
CREATE TABLE IF NOT EXISTS nonconformities (
  id           uuid PRIMARY KEY,
  day          date NOT NULL,
  base_code    text NOT NULL,
  doctor_name  text,
  description  text NOT NULL,
  photo        bytea NOT NULL,
  content_type text NOT NULL DEFAULT 'image/jpeg',
  byte_size    integer NOT NULL DEFAULT 0,
  ip_hash      text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nonconformities_base_idx
  ON nonconformities (base_code, created_at DESC);
