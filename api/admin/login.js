import { createSessionToken, setSessionCookie } from "../lib/auth.js";

export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const { password } = req.body || {};
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected) {
    return res.status(500).json({ error: "ADMIN_PASSWORD не задан на сервере" });
  }
  if (!password || password !== expected) {
    return res.status(401).json({ error: "Неверный пароль" });
  }

  setSessionCookie(res, createSessionToken());
  return res.status(200).json({ ok: true });
}
