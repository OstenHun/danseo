import { rm } from 'node:fs/promises';

// This ignored directory belongs to compiled tests. Drop stale renamed tests
// before tsc so node --test never runs an old output alongside its replacement.
await rm(new URL('../build/', import.meta.url), { recursive: true, force: true });
