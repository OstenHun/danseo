import { mkdir, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
await mkdir(new URL('../dist/web/', import.meta.url), { recursive: true });
for (const file of ['comparison.html', 'comparison.js', 'comparison.css']) await copyFile(new URL('../src/web/'+file, import.meta.url), new URL('../dist/web/'+file, import.meta.url));
for (const file of ['research-map.js', 'reader-base.css']) await copyFile(new URL('../src/views/'+file, import.meta.url), new URL('../dist/web/'+file, import.meta.url));
await copyFile(require.resolve('cytoscape/dist/cytoscape.min.js'), new URL('../dist/web/cytoscape.min.js', import.meta.url));
