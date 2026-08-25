import { sql } from "../lib/db.js";
import { requireAdmin } from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method === "POST") {
    const { name, contact, route, date, passengers, comment, website } = req.body || {};

    if (website) return res.status(200).json({ ok: true }); // honeypot — тихо принимаем и игнорируем
    if (!name?.trim() || !contact?.trim() || !date) {
      return res.status(400).json({ error: "Заполните обязательные поля" });
    }

    await sql`
      INSERT INTO leads (name, contact, route, date, passengers, comment)
      VALUES (${name}, ${contact}, ${route || null}, ${date}, ${passengers || 1}, ${comment || ""})
    `;

    // TODO(следующий этап): здесь же отправить уведомление в Telegram-бот и/или на почту (Resend).

    return res.status(200).json({ ok: true });
  }

  if (req.method === "GET") {
    if (!requireAdmin(req)) return res.status(401).json({ error: "Нужно войти как администратор" });
    const { rows } = await sql`SELECT * FROM leads ORDER BY created_at DESC LIMIT 200`;
    return res.status(200).json({ leads: rows });
  }

  return res.status(405).json({ error: "method not allowed" });
}
