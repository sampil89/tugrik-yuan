import { sql } from "./admin/lib/db.js";
import { requireAdmin } from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const rows = await sql`SELECT code, value FROM currency_overrides`;
    const overrides = {};
    rows.forEach((r) => { overrides[r.code] = Number(r.value); });
    return res.status(200).json({ overrides });
  }

  if (req.method === "PUT") {
    if (!requireAdmin(req)) return res.status(401).json({ error: "Нужно войти как администратор" });

    const { code, value } = req.body || {};
    if (!code) return res.status(400).json({ error: "code обязателен" });

    if (value === null || value === "") {
      await sql`DELETE FROM currency_overrides WHERE code = ${code}`;
    } else {
      await sql`
        INSERT INTO currency_overrides (code, value, updated_at)
        VALUES (${code}, ${value}, now())
        ON CONFLICT (code) DO UPDATE SET value = ${value}, updated_at = now()
      `;
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "method not allowed" });
}
