/**
 * 一次性脚手架：跑一次 initDb() 创建所有表（含 hot_notes / note_images / note_videos）。
 *   npm run db:init
 */
import dotenv from "dotenv";
import { initDb, pool } from "../db";

dotenv.config();

(async () => {
  try {
    await initDb();
    console.log("[init_db] schema ready");
  } catch (e) {
    console.error("[init_db] failed:", e);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
