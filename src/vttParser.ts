export interface VttCue {
  start: number;
  end: number;
  text: string;
}

function parseTimestamp(ts: string): number {
  const normalized = ts.replace(',', '.');
  const parts = normalized.split(':');
  if (parts.length === 3) {
    return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
  }
  if (parts.length === 2) {
    return parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
  }
  return 0;
}

export function parseVTT(content: string): VttCue[] {
  const cues: VttCue[] = [];
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.startsWith('WEBVTT') || line === '') { i++; continue; }
    if (line.startsWith('NOTE') || line.startsWith('STYLE')) {
      while (i < lines.length && lines[i].trim() !== '') i++;
      continue;
    }
    if (/^\d+$/.test(line)) { i++; continue; }

    const match = line.match(
      /(\d{1,2}:\d{2}:\d{2}[.,]\d{3}|\d{1,2}:\d{2}[.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{3}|\d{1,2}:\d{2}[.,]\d{3})/
    );
    if (match) {
      const start = parseTimestamp(match[1]);
      const end = parseTimestamp(match[2]);
      const textLines: string[] = [];
      let j = i + 1;
      while (
        j < lines.length &&
        lines[j].trim() !== '' &&
        !lines[j].match(/\d{1,2}:\d{2}:\d{2}[.,]\d{3}\s*-->/) &&
        !lines[j].match(/\d{1,2}:\d{2}[.,]\d{3}\s*-->/) &&
        !/^\d+$/.test(lines[j].trim())
      ) {
        textLines.push(lines[j].trim());
        j++;
      }
      const text = textLines.join('\n').replace(/<[^>]+>/g, '').trim();
      if (text) cues.push({ start, end, text });
      i = j;
    } else {
      i++;
    }
  }
  return cues;
}

export function formatTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${h > 0 ? `${h}:` : ''}${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}
