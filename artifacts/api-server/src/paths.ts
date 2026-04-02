import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/** Package root (folder containing `src/` and `dist/`), works for dev and bundled `dist/index.mjs`. */
const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * User-uploaded deposit screenshots. Override with `UPLOAD_DIR` (absolute path, e.g. Railway volume).
 * Creates the directory if missing (safe before static middleware or multer).
 */
export function getUploadsDir(): string {
  const raw = process.env.UPLOAD_DIR?.trim();
  const dir = raw ? path.resolve(raw) : path.join(packageRoot, "uploads");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
