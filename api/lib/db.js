// Общий клиент для всех serverless-функций.
// С конца 2024 года у Vercel нет отдельного "Vercel Postgres" — базу подключают
// через Marketplace (обычно провайдер Neon). Интеграция сама добавляет
// переменную DATABASE_URL (иногда ещё и старую POSTGRES_URL) в настройки
// проекта — вписывать вручную ничего не нужно.
import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  console.error("Не найдена переменная DATABASE_URL / POSTGRES_URL — база данных не подключена к проекту.");
}

export const sql = neon(connectionString);
