// Общий клиент для всех serverless-функций.
// Переменные подключения (POSTGRES_URL и т.д.) подставляет сам Vercel,
// когда база подключена через вкладку Storage — вручную их вписывать не нужно.
import { sql } from "@vercel/postgres";

export { sql };
