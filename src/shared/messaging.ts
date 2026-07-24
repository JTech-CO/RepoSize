import type { ResponseMap, RuntimeMessage } from './types';

/**
 * Typed wrapper over `chrome.runtime.sendMessage`. Resolves to the response
 * type mapped from the message's `type` discriminant.
 *
 * Returns `null` if the background worker is unreachable (e.g. the extension
 * was reloaded), so callers can degrade gracefully instead of throwing.
 */
export async function sendMessage<M extends RuntimeMessage>(
  message: M,
): Promise<ResponseMap[M['type']] | null> {
  try {
    return (await chrome.runtime.sendMessage(message)) as ResponseMap[M['type']];
  } catch {
    return null;
  }
}
