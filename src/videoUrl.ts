/**
 * Normalize video URLs for direct streaming.
 * - Dropbox share links → dl.dropboxusercontent.com with dl=1
 * - Ensures query params end with dl=1 or raw=1
 */
export function formatVideoUrl(rawUrl: string): string {
  try {
    let url = rawUrl.trim();

    // Replace Dropbox domain for direct streaming
    if (url.includes('www.dropbox.com')) {
      url = url.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
    } else if (url.includes('dropbox.com') && !url.includes('dl.dropboxusercontent.com')) {
      url = url.replace('dropbox.com', 'dl.dropboxusercontent.com');
    }

    const parsed = new URL(url);

    // Dropbox: ensure dl=1 (replace dl=0, or add if missing)
    if (parsed.hostname.includes('dropboxusercontent.com') || parsed.hostname.includes('dropbox.com')) {
      if (parsed.searchParams.has('dl')) {
        parsed.searchParams.set('dl', '1');
      } else {
        parsed.searchParams.set('dl', '1');
      }
      if (parsed.searchParams.has('raw')) {
        parsed.searchParams.set('raw', '1');
      }
    }

    return parsed.toString();
  } catch {
    return rawUrl;
  }
}
