/**
 * fetchWithDeadline — fetch with a hard timeout via AbortController.
 * Used by provider modules that need bounded request times.
 */
export async function fetchWithDeadline(
  url: string,
  init: RequestInit = {},
  timeoutMs = 6000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
