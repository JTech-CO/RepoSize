import type { ResponseMap, RuntimeMessage } from './types';

/**
 * Typed `chrome.runtime.sendMessage` wrapper. Returns `null` if the background
 * worker is unreachable (e.g. the extension reloaded) so callers can degrade.
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
