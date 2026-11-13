import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const COMPOSE_FILE = join(__dirname, '../../../../compose.yaml');

/**
 * The image of a compose.yaml service. Test containers run exactly what local development
 * runs, and Dependabot, which updates compose.yaml, updates the tests with it (ADR-015).
 */
export function composeImage(service: 'postgres' | 'mailpit'): string {
  const compose = readFileSync(COMPOSE_FILE, 'utf8');
  // Two-space service key, then its block up to the image line
  const match = new RegExp(`^  ${service}:\\n(?:    .*\\n)*?    image: (\\S+)$`, 'm').exec(compose);
  if (!match?.[1]) throw new Error(`compose.yaml: no image for service "${service}"`);
  return match[1];
}
