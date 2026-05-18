import archiver from 'archiver';
import fs from 'node:fs';
import path from 'node:path';

export function createZip(sourceDir, siteId) {
  return new Promise((resolve, reject) => {
    const zipPath = path.join(process.cwd(), 'generated-sites', `${siteId}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve(zipPath));
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}
