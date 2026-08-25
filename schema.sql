-- Выполнить один раз в новой базе (Vercel Postgres → вкладка "Query" в дашборде,
-- либо через любой Postgres-клиент, подключившись по строке из переменной POSTGRES_URL).

CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  route TEXT,
  date DATE,
  passengers INT DEFAULT 1,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS currency_overrides (
  code TEXT PRIMARY KEY,
  value NUMERIC NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS news_items (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
