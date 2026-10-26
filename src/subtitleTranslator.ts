export interface SubtitleBlock {
  index: string;
  timestamp: string;
  text: string;
}

export interface TranslationPair {
  index: string;
  timestamp: string;
  original: string;
  translated: string;
}

export interface TranslationResult {
  content: string;
  pairs: TranslationPair[];
}

export type TranslationProvider = 'deepseek' | 'groq' | 'gemini';

export interface TranslationConfig {
  provider: TranslationProvider;
  apiKey: string;
  model: string;
}

const SYSTEM_PROMPT =
  'You are a professional subtitle translator specializing in Central Kurdish (Sorani, Arabic script). ' +
  'Translate the movie subtitles into Sorani Kurdish with a natural, cinematic, street-level tone. ' +
  'The translation must sound like real spoken Kurdish — idiomatic, conversational, and emotionally alive — not formal or literary. ' +
  'Preserve the exact meaning, tone, and intensity of every line. ' +
  'Do NOT censor, soften, or euphemize ANY profanity, slang, insults, sexual references, or explicit language. ' +
  'Translate everything precisely as spoken, including all swear words and vulgar expressions, using authentic Sorani equivalents. ' +
  'Never add commentary, notes, or explanations. Output ONLY the translated subtitle text.';

export const PROVIDER_MODELS: Record<TranslationProvider, { value: string; label: string }[]> = {
  deepseek: [
    { value: 'deepseek-chat', label: 'DeepSeek Chat (fast, low-cost)' },
    { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner (higher quality)' },
  ],
  groq: [
    { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (fast, free tier)' },
    { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (fastest)' },
    { value: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 Distill 70B' },
  ],
  gemini: [
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (free tier)' },
  ],
};

export const PROVIDER_ENDPOINTS: Record<TranslationProvider, string> = {
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  gemini: '',
};

const GEMINI_SYSTEM_PROMPT =
  'You are an expert cinematic movie translator. ' +
  'Translate the following English subtitles into Central Kurdish (Sorani). ' +
  'DO NOT translate word-for-word like a robot. ' +
  'Use natural, cinematic, and colloquial/street Kurdish language to perfectly capture the true meaning, emotion, and slang of the scene. ' +
  'Preserve the exact subtitle index numbers and timecodes without changing them.';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export interface GeminiTranslationItem {
  index: string;
  timestamp: string;
  original: string;
  translated: string;
}

export interface GeminiTranslateOnlyResult {
  translations: GeminiTranslationItem[];
  block_count: number;
}

export interface GeminiEdgeResult {
  translated_content: string;
  storage_url: string;
  storage_path: string;
  subtitle: unknown;
  block_count: number;
}

const GEMINI_CLIENT_SYSTEM_PROMPT =
  'You are an expert cinematic movie translator specializing in Central Kurdish (Sorani, Arabic script). ' +
  'CRITICAL RULES — follow ALL of them strictly:\n' +
  '1. ABSOLUTE COMPLETENESS: You MUST translate EVERY SINGLE subtitle line provided. Do not skip, merge, or omit any line. The output array length MUST exactly equal the input array length.\n' +
  '2. PROPER NOUNS & NAMES: NEVER translate proper nouns, character names, or place names. Transliterate them accurately into Sorani Kurdish using the closest phonetic Arabic-script spelling. Examples: "Maddie" → "مادی" (NOT "مەدی"), "Simon" → "سایمۆن", "Jack" → "جاگ". Keep the same name spelling consistent throughout.\n' +
  '3. NATURAL TONE: Translate into natural, conversational, everyday spoken Sorani Kurdish — the kind of street language real people use in daily life. The tone must fit movie dialogues perfectly: casual, idiomatic, and emotionally alive. Do NOT be formal, literary, or robotic. Avoid stiff textbook Kurdish.\n' +
  '4. IDIOMS & SLANG: Do NOT translate idioms or slang literally. Provide the closest natural Sorani cultural equivalent that conveys the same meaning and emotion.\n' +
  '5. PROFANITY & CURSE WORDS: Use appropriate Sorani Kurdish equivalents that fit the tone of the scene. Choose words that feel natural in spoken Kurdish (e.g., "نەفرەت", "شەیتان", "زڵم") rather than overly explicit or inappropriately literal translations. Match the intensity of the original without being gratuitous.\n' +
  '6. OUTPUT FORMAT: You MUST return a JSON array of strings. Each element is the Sorani Kurdish translation of the corresponding input string, in the same order. No markers, no commentary — just the translated strings.';

const GEMINI_MODEL = 'gemini-3.6-flash';

const DEFAULT_GEMINI_API_KEY = 'AQ.Ab8RN6IdiHTVb6g1ulsCJK60DDCUcn1VUxrPmHxdrld7ZjHVlg';

const BATCH_SIZE = 50;
const SECONDS_PER_BATCH = 4;
const MAX_BATCH_RETRIES = 2;
const RATE_LIMIT_RETRIES = 5;
const DEFAULT_RATE_LIMIT_WAIT_MS = 15000;
const INTER_BATCH_DELAY_MS = 3000;

export interface RateLimitStatus {
  waiting: boolean;
  waitSeconds: number;
  attempt: number;
}

function extractRetryDelaySeconds(body: string): number {
  // Google returns messages like "Please retry in 42 seconds" or "retryDelay: 42s"
  const secMatch = body.match(/retry\s+in\s+(\d+)\s*seconds/i)
    || body.match(/retryDelay['"]?\s*:\s*['"]?(\d+)s?/i)
    || body.match(/please\s+retry\s+in\s+(\d+)s/i);
  if (secMatch) return Math.max(1, parseInt(secMatch[1], 10));
  return 15;
}

async function fetchGeminiWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let response: Response;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    response = await fetch(url, options);
    if ((response.status === 503 || response.status === 429) && attempt < maxRetries - 1) {
      console.warn(`Gemini returned ${response.status}, retrying in 8000ms (attempt ${attempt + 1}/${maxRetries})…`);
      await new Promise(r => setTimeout(r, 8000));
      continue;
    }
    return response;
  }
  return response!;
}

function parseJsonArray(raw: string): string[] | null {
  if (!raw) return null;
  let text = raw.trim();
  // Strip markdown code fences if present
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
      return parsed as string[];
    }
  } catch {
    // fall through
  }
  // Try to extract the first JSON array from the text
  const match = text.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
        return parsed as string[];
      }
    } catch {
      // fall through
    }
  }
  return null;
}

async function translateBatch(
  batchTexts: string[],
  cleanApiKey: string,
  onRateLimit?: (status: RateLimitStatus) => void
): Promise<string[]> {
  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: GEMINI_CLIENT_SYSTEM_PROMPT }] },
    contents: [{
      role: 'user',
      parts: [{
        text:
          `Translate EVERY string in the JSON array below into natural, conversational Sorani Kurdish (Central Kurdish, Arabic script). ` +
          `You MUST translate ALL strings — do not skip or merge any. Never translate proper nouns; transliterate them accurately (e.g., "Maddie" → "مادی"). ` +
          `Return a JSON array of translated strings with the EXACT same length and order as the input. No markers, no commentary.\n\n` +
          `Input:\n${JSON.stringify(batchTexts)}`,
      }],
    }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${cleanApiKey}`;

  for (let attempt = 0; attempt <= MAX_BATCH_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetchGeminiWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      });
    } catch {
      throw new Error('نەتوانرا بە Gemini بگەیەنیت. تکایە ئینتەرنێتەکەت پشکنە و دووبارە هەوڵبدەوە.');
    }

    if (res.status === 429) {
      const errText = await res.text().catch(() => '');
      const waitSec = extractRetryDelaySeconds(errText);
      console.warn(`Gemini rate limit (429). Waiting ${waitSec}s before retry.`);
      onRateLimit?.({ waiting: true, waitSeconds: waitSec, attempt: attempt + 1 });
      await new Promise(r => setTimeout(r, waitSec * 1000));
      onRateLimit?.({ waiting: false, waitSeconds: 0, attempt: attempt + 1 });
      if (attempt < MAX_BATCH_RETRIES) continue;
      // After max retries, throw a friendly rate-limit error
      throw new Error(friendlyApiError('gemini', 429, errText));
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`Gemini model "${GEMINI_MODEL}" failed (HTTP ${res.status}). Google error response: ${errText.slice(0, 500)}`);
      throw new Error(friendlyApiError('gemini', res.status, errText));
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    const parsed = parseJsonArray(rawText);

    if (parsed && parsed.length === batchTexts.length) {
      return parsed;
    }

    console.warn(`Batch parse mismatch (attempt ${attempt + 1}/${MAX_BATCH_RETRIES + 1}). Got ${parsed?.length ?? 'null'} expected ${batchTexts.length}. Retrying…`);
    if (attempt < MAX_BATCH_RETRIES) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Final fallback: return empty strings so UI doesn't crash; caller reports partial
  console.error('Batch failed after retries — returning empty translations for this batch.');
  return batchTexts.map(() => '');
}

export async function translateWithGeminiClientSide(
  blocks: SubtitleBlock[],
  apiKey: string,
  format: 'srt' | 'vtt',
  onProgress?: (done: number, total: number) => void,
  onBatchTranslated?: (results: GeminiTranslationItem[]) => void,
  onBatchInfo?: (currentBatch: number, totalBatches: number, estimatedRemainingSec: number) => void,
  onRateLimit?: (status: RateLimitStatus) => void
): Promise<GeminiTranslateOnlyResult> {
  if (blocks.length === 0) {
    return { translations: [], block_count: 0 };
  }

  const cleanApiKey = (apiKey.trim().replace(/^["']|["']$/g, '')) || DEFAULT_GEMINI_API_KEY;

  const totalBatches = Math.ceil(blocks.length / BATCH_SIZE);
  const results: GeminiTranslationItem[] = blocks.map(b => ({
    index: b.index,
    timestamp: b.timestamp,
    original: b.text,
    translated: '',
  }));

  let doneCount = 0;

  for (let b = 0; b < totalBatches; b++) {
    const remainingBatches = totalBatches - b;
    const estimatedRemainingSec = remainingBatches * SECONDS_PER_BATCH;
    onBatchInfo?.(b + 1, totalBatches, estimatedRemainingSec);

    const batch = blocks.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    const batchTexts = batch.map(blk => blk.text);

    const translatedTexts = await translateBatch(batchTexts, cleanApiKey, onRateLimit);

    translatedTexts.forEach((text, i) => {
      const globalIdx = b * BATCH_SIZE + i;
      if (globalIdx < results.length) {
        results[globalIdx].translated = text;
      }
    });

    doneCount += batch.length;
    onProgress?.(doneCount, blocks.length);
    onBatchTranslated?.(results);

    if (b < totalBatches - 1) {
      await new Promise(r => setTimeout(r, INTER_BATCH_DELAY_MS));
    }
  }

  return { translations: results, block_count: results.length };
}

export async function saveWithGemini(
  content: string,
  format: 'srt' | 'vtt',
  adminPassword: string,
  translations: { index: string; translated: string }[],
  metadata?: {
    file_name?: string;
    tmdb_id?: number;
    media_type?: string;
    season_number?: number;
    episode_number?: number;
    title?: string;
  }
): Promise<GeminiEdgeResult> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/gemini-translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'X-Admin-Password': adminPassword,
    },
    body: JSON.stringify({
      content,
      format,
      mode: 'save',
      translations,
      ...metadata,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Save failed (${res.status})`);
  }

  return await res.json();
}

export function parseSubtitleBlocks(content: string): SubtitleBlock[] {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const blocks: SubtitleBlock[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.startsWith('WEBVTT') || line === '') { i++; continue; }
    if (line.startsWith('NOTE') || line.startsWith('STYLE')) {
      while (i < lines.length && lines[i].trim() !== '') i++;
      continue;
    }

    let index = '';
    let timestamp = '';
    let textLines: string[] = [];

    if (/^\d+$/.test(line)) {
      index = line;
      i++;
    }

    const tsLine = lines[i]?.trim() || '';
    const tsMatch = tsLine.match(/(\d{1,2}:\d{2}:\d{2}[.,]\d{3}|\d{1,2}:\d{2}[.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{3}|\d{1,2}:\d{2}[.,]\d{3})/);
    if (tsMatch) {
      timestamp = tsLine;
      i++;
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !lines[i].match(/\d{1,2}:\d{2}:\d{2}[.,]\d{3}\s*-->/) &&
        !lines[i].match(/\d{1,2}:\d{2}[.,]\d{3}\s*-->/) &&
        !/^\d+$/.test(lines[i].trim())
      ) {
        textLines.push(lines[i].trim());
        i++;
      }
    } else {
      i++;
      continue;
    }

    blocks.push({
      index,
      timestamp,
      text: textLines.join('\n'),
    });
  }

  return blocks;
}

export function reassembleSubtitle(blocks: SubtitleBlock[], format: 'srt' | 'vtt'): string {
  const parts: string[] = [];
  if (format === 'vtt') parts.push('WEBVTT\n');

  blocks.forEach((block, idx) => {
    if (format === 'srt' && block.index) {
      parts.push(block.index);
    } else if (format === 'srt') {
      parts.push(String(idx + 1));
    }
    const ts = format === 'vtt' ? block.timestamp.replace(',', '.') : block.timestamp;
    parts.push(ts);
    parts.push(block.text);
    parts.push('');
  });

  return parts.join('\n').trim() + '\n';
}

function friendlyApiError(provider: string, status: number, body: string): string {
  const name = provider === 'deepseek' ? 'DeepSeek' : provider === 'groq' ? 'Groq' : 'Gemini';

  let apiMessage = '';
  try {
    const parsed = JSON.parse(body);
    apiMessage = parsed?.error?.message || parsed?.message || '';
  } catch {
    apiMessage = body.slice(0, 300);
  }

  if (status === 401) {
    return `کلیلی ${name} هەڵەیە یان بەسەرچووە. تکایە کلیلێکی دروست بنووسە.${apiMessage ? `\n${apiMessage}` : ''}`;
  }
  if (status === 429) {
    return `سنووری بەکارهێنان تێپەڕیوە لە ${name}. تکایە کەمێک چاوەڕێ بکە و دووبارە هەوڵبدەوە.${apiMessage ? `\n${apiMessage}` : ''}`;
  }
  if (status === 500 || status === 502 || status === 503) {
    return `هەڵەی ${name} (${status})${apiMessage ? `: ${apiMessage}` : ''}`;
  }
  return `هەڵەی ${name} (${status})${apiMessage ? `: ${apiMessage}` : ''}`;
}

export async function translateSubtitles(
  content: string,
  format: 'srt' | 'vtt',
  config: TranslationConfig,
  onProgress?: (done: number, total: number) => void
): Promise<TranslationResult> {
  const blocks = parseSubtitleBlocks(content);
  if (blocks.length === 0) {
    return { content, pairs: [] };
  }

  const originalBlocks = blocks.map(b => ({ ...b }));
  const endpoint = PROVIDER_ENDPOINTS[config.provider];
  const providerName = config.provider === 'deepseek' ? 'DeepSeek' : config.provider === 'groq' ? 'Groq' : 'Gemini';

  const BATCH_SIZE = 30;
  const totalBatches = Math.ceil(blocks.length / BATCH_SIZE);
  let doneCount = 0;

  for (let b = 0; b < totalBatches; b++) {
    const batch = blocks.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    const numberedText = batch
      .map((blk, i) => `[${i + 1}]\n${blk.text}`)
      .join('\n\n');

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: `Translate each numbered subtitle block below into Sorani Kurdish (Central Kurdish, Arabic script). Keep the [N] markers exactly as they are. Return ONLY the translated blocks with their markers, nothing else.\n\n${numberedText}`,
            },
          ],
          temperature: 0.3,
          max_tokens: 4000,
        }),
      });
    } catch {
      throw new Error(`نەتوانرا بە ${providerName} بگەیەنیت. تکایە ئینتەرنێتەکەت پشکنە و دووبارە هەوڵبدەوە.`);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(friendlyApiError(config.provider, res.status, errText));
    }

    const data = await res.json();
    const translated: string = data.choices?.[0]?.message?.content?.trim() || '';

    const translatedBlocks = translated
      .split(/\n\n+/)
      .map((chunk: string) => chunk.trim())
      .filter(Boolean);

    translatedBlocks.forEach((chunk: string) => {
      const match = chunk.match(/^\[(\d+)\]\s*([\s\S]*)$/);
      if (match) {
        const num = parseInt(match[1], 10) - 1;
        const text = match[2].trim();
        if (num >= 0 && num < batch.length) {
          batch[num].text = text;
        }
      }
    });

    doneCount += batch.length;
    onProgress?.(doneCount, blocks.length);
  }

  const reassembled = reassembleSubtitle(blocks, format);

  const pairs: TranslationPair[] = blocks.map((blk, idx) => ({
    index: blk.index || String(idx + 1),
    timestamp: blk.timestamp,
    original: originalBlocks[idx].text,
    translated: blk.text,
  }));

  return { content: reassembled, pairs };
}
