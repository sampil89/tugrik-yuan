import { requireAdmin } from "../lib/auth.js";

export default function handler(req, res) {
  return res.status(200).json({ isAdmin: requireAdmin(req) });
}
