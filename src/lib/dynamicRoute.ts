import { connection } from 'next/server';

/**
 * Signals to Next.js Cache Components that this route is dynamic and requires request-time data,
 * while safely ignoring missing request store in test environments (e.g. Vitest).
 */
export async function markDynamic(): Promise<void> {
  try {
    await connection();
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('outside a request scope')) {
      return;
    }
    throw err;
  }
}
