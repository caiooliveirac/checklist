-- Chave do dia por ambulância: controla quem pode registrar o checklist.
CREATE TABLE IF NOT EXISTS base_keys (
  day        date NOT NULL,
  base_code  text NOT NULL,
  keyword    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, base_code)
);
