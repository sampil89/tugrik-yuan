import { sql } from "../lib/db.js";
import { requireAdmin } from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { rows } = await sql`SELECT * FROM news_items ORDER BY created_at DESC LIMIT 100`;
    return res.status(200).json({ items: rows });
  }

  if (!requireAdmin(req)) return res.status(401).json({ error: "Нужно войти как администратор" });

  if (req.method === "POST") {
    const { title, text } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: "Заголовок обязателен" });
    await sql`INSERT INTO news_items (title, text) VALUES (${title}, ${text || ""})`;
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "id обязателен" });
    await sql`DELETE FROM news_items WHERE id = ${id}`;
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "method not allowed" });
}
