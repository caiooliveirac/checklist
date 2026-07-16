-- Esquema inicial do checklist.

CREATE TABLE IF NOT EXISTS submissions (
  id            uuid PRIMARY KEY,
  day           date NOT NULL,
  base_code     text NOT NULL,
  doctor_name   text NOT NULL,
  doctor_id     uuid,
  occupancy_id  uuid,
  shift_label   text,
  items         jsonb NOT NULL,
  total_items   integer NOT NULL,
  ok_count      integer NOT NULL,
  missing_count integer NOT NULL,
  obs_count     integer NOT NULL DEFAULT 0,
  summary_text  text NOT NULL,
  ip_hash       text,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS submissions_day_base_idx
  ON submissions (day, base_code, created_at DESC);

CREATE TABLE IF NOT EXISTS digest_logs (
  id         uuid PRIMARY KEY,
  day        date NOT NULL,
  slot       text NOT NULL,
  status     text NOT NULL,
  recipients text NOT NULL DEFAULT '',
  message    text NOT NULL DEFAULT '',
  error      text NOT NULL DEFAULT '',
  sent_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS digest_logs_day_slot_idx
  ON digest_logs (day, slot, status);

-- Chats registrados no bot (admins adicionais promovidos via /admin <código>).
CREATE TABLE IF NOT EXISTS bot_chats (
  chat_id    text PRIMARY KEY,
  role       text NOT NULL DEFAULT 'admin',
  label      text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
