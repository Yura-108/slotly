import { z } from 'zod';

// The page CSP forbids eval (ADR-014). Zod 4 probes `new Function` to compile faster
// parsers; the probe is caught, but the browser still reports a CSP violation. Parsers
// without it are fast enough for forms. Client code imports z from here, not from 'zod'.
z.config({ jitless: true });

export { z };
