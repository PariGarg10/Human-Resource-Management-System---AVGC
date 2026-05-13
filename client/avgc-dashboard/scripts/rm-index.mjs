import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, '../../../public/assets/avgc-dashboard/index.html');
try {
  fs.unlinkSync(target);
} catch {
  /* ignore */
}
