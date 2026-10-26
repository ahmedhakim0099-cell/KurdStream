import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Password",
};

const ADMIN_PASSWORD = "admin123";
const GEMINI_MODEL = "gemini-2.0-flash";
const BATCH_SIZE = 40;
const INTER_BATCH_DELAY_MS = 4000;
const MAX_429_RETRIES = 3;

const TRANSLATION_INSTRUCTION =
  "Translate these subtitle lines to Kurdish Sorani (Arabic script). " +
  "Keep line count identical, keep names, keep it short and natural for subtitles. " +
  "Return only a JSON array of strings.";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface SubtitleBlock {
  index: string;
  timestamp: string;
  text: string;
  translated: string;
}

function parseVtt(content: string): SubtitleBlock[] {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const blocks: SubtitleBlock[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.startsWith("WEBVTT") || line === "") { i++; continue; }
    if (line.startsWith("NOTE") || line.startsWith("STYLE")) {
      while (i < lines.length && lines[i].trim() !== "") i++;
      continue;
    }

    let index = "";
    let timestamp = "";
    const textLines: string[] = [];

    if (/^\d+$/.test(line)) { index = line; i++; }

    const tsLine = lines[i]?.trim() || "";
    const tsMatch = tsLine.match(
      /(\d{1,2}:\d{2}:\d{2}[.,]\d{3}|\d{1,2}:\d{2}[.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{3}|\d{1,2}:\d{2}[.,]\d{3})/
    );
    if (tsMatch) {
      timestamp = tsLine;
      i++;
      while (
        i < lines.length && lines[i].trim() !== "" &&
        !lines[i].match(/\d{1,2}:\d{2}:\d{2}[.,]\d{3}\s*-->/) &&
        !lines[i].match(/\d{1,2}:\d{2}[.,]\d{3}\s*-->/) &&
        !/^\d+$/.test(lines[i].trim())
      ) {
        textLines.push(lines[i].trim());
        i++;
      }
    } else { i++; continue; }

    blocks.push({ index, timestamp, text: textLines.join("\n"), translated: "" });
  }
  return blocks;
}

function reassembleVtt(blocks: SubtitleBlock[]): string {
  const parts: string[] = ["WEBVTT\n"];
  blocks.forEach((block) => {
    parts.push(block.timestamp.replace(",", "."));
    parts.push(block.translated || block.text);
    parts.push("");
  });
  return parts.join("\n").trim() + "\n";
}

function srtToVtt(srt: string): string {
  let text = srt.replace(/^\uFEFF/, "");
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  text = text.replace(/(\d{2}:\d{2}),(\d{3})/g, "00:$1.$2");
  if (!text.trim().toUpperCase().startsWith("WEBVTT")) {
    text = "WEBVTT\n\n" + text.trim() + "\n";
  }
  return text;
}

function storagePath(mediaType: string, tmdbId: number, season?: number, episode?: number): string {
  return mediaType === "tv"
    ? `tv-${tmdbId}-s${season}e${episode}-auto.vtt`
    : `movie-${tmdbId}-auto.vtt`;
}

function publicUrl(path: string): string {
  return `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/subtitles/${path}`;
}

async function uploadToStorage(vtt: string, path: string): Promise<string> {
  const { error } = await supabase.storage
    .from("subtitles")
    .upload(path, vtt, { contentType: "text/vtt", upsert: true });
  if (error) console.error("Storage upload error:", error.message);
  return publicUrl(path);
}

function parseJsonArray(raw: string): string[] | null {
  if (!raw) return null;
  let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    const arr = JSON.parse(text);
    if (Array.isArray(arr) && arr.every((x) => typeof x === "string")) return arr as string[];
  } catch { /* try regex */ }
  const match = text.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const arr = JSON.parse(match[0]);
      if (Array.isArray(arr) && arr.every((x) => typeof x === "string")) return arr as string[];
    } catch { /* give up */ }
  }
  return null;
}

async function translateBatchWithGemini(
  apiKey: string,
  texts: string[],
): Promise<string[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: TRANSLATION_INSTRUCTION }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(texts) }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 8192, responseMimeType: "application/json" },
  });

  let lastErr = "";
  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    } catch (fetchErr) {
      throw new Error(`Gemini fetch failed: ${fetchErr.message}`);
    }

    if (res.status === 429 && attempt < MAX_429_RETRIES) {
      const errText = await res.text().catch(() => "");
      const secMatch = errText.match(/retry\s+in\s+(\d+)\s*seconds/i)
        || errText.match(/retryDelay['"]?\s*:\s*['"]?(\d+)s?/i);
      const waitSec = secMatch ? Math.max(1, parseInt(secMatch[1], 10)) : (attempt + 1) * 8;
      console.warn(`Gemini 429 — waiting ${waitSec}s (attempt ${attempt + 1}/${MAX_429_RETRIES})`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      lastErr = errText;
      continue;
    }

    if (!res.ok) {
      const errText = await res.text();
      let apiMessage = errText;
      try {
        const parsed = JSON.parse(errText);
        apiMessage = parsed?.error?.message || errText;
      } catch { /* keep raw */ }
      throw new Error(`Gemini API error (${res.status}): ${apiMessage}`);
    }

    const data = await res.json();
    const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    const parsed = parseJsonArray(rawText);
    if (!parsed) throw new Error("Gemini did not return a valid JSON array of strings");
    return parsed;
  }

  throw new Error(`Gemini rate limit exhausted after ${MAX_429_RETRIES + 1} attempts: ${lastErr}`);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function saveProgress(
  existingId: string | null,
  tmdbId: number,
  mediaType: string,
  seasonNumber: number | null,
  episodeNumber: number | null,
  title: string,
  blocks: SubtitleBlock[],
  fileUrl: string | null,
): Promise<string | null> {
  const partialVtt = reassembleVtt(blocks);
  let savedFileUrl = fileUrl;
  if (!savedFileUrl) {
    const path = storagePath(mediaType, tmdbId, seasonNumber || undefined, episodeNumber || undefined);
    savedFileUrl = await uploadToStorage(partialVtt, path);
  }
  if (existingId) {
    await supabase
      .from("subtitles")
      .update({ content: partialVtt, file_url: savedFileUrl, label: "Kurdish (Sorani)", updated_at: new Date().toISOString() })
      .eq("id", existingId);
  } else {
    const { data } = await supabase
      .from("subtitles")
      .insert({
        tmdb_id: tmdbId, media_type: mediaType,
        season_number: seasonNumber, episode_number: episodeNumber,
        title, language: "ckb", label: "Kurdish (Sorani)",
        content: partialVtt, file_url: savedFileUrl, is_auto: true,
      })
      .select("id");
    return data?.[0]?.id || null;
  }
  return existingId;
}

function buildMatchQuery(base: ReturnType<typeof supabase.from>, season: number | null, episode: number | null) {
  let q = base;
  if (season) q = q.eq("season_number", season); else q = q.is("season_number", null);
  if (episode) q = q.eq("episode_number", episode); else q = q.is("episode_number", null);
  return q;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { tmdb_id, media_type, season_number, episode_number, force } = body;

    if (!tmdb_id || !media_type) {
      return json({ error: "Missing tmdb_id or media_type" }, 400);
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return json({ error: "GEMINI_API_KEY is not set in secrets" }, 500);
    }

    const seasonNum = season_number || null;
    const episodeNum = episode_number || null;

    // 1. Check for existing completed auto-translation (skip if force=true)
    if (!force) {
      let cachedQuery = supabase
        .from("subtitles")
        .select("id, file_url, content")
        .eq("tmdb_id", tmdb_id)
        .eq("media_type", media_type)
        .eq("is_auto", true)
        .eq("language", "ckb");
      cachedQuery = buildMatchQuery(cachedQuery, seasonNum, episodeNum);
      const { data: cached } = await cachedQuery.maybeSingle();
      if (cached?.file_url) {
        return json({ file_url: cached.file_url, cached: true });
      }
    }

    // 2. Concurrency lock — check if a translation is already in progress
    let lockQuery = supabase
      .from("subtitles")
      .select("id, content, file_url")
      .eq("tmdb_id", tmdb_id)
      .eq("media_type", media_type)
      .eq("is_auto", true)
      .eq("language", "ckb");
    lockQuery = buildMatchQuery(lockQuery, seasonNum, episodeNum);
    const { data: existingRow } = await lockQuery.maybeSingle();

    // If we have partial progress (content but no file_url), resume from it
    let blocks: SubtitleBlock[] | null = null;
    let existingId: string | null = existingRow?.id || null;

    if (existingRow?.content && !existingRow?.file_url) {
      // Resume: parse the partial VTT, find which cues are already translated
      const partialBlocks = parseVtt(existingRow.content);
      if (partialBlocks.length > 0) {
        const hasTranslations = partialBlocks.some(b => b.translated && b.translated !== b.text);
        if (hasTranslations) {
          blocks = partialBlocks;
        }
      }
    }

    // 3. Fetch the English source subtitle
    let sourceQuery = supabase
      .from("subtitles")
      .select("content, title, language")
      .eq("tmdb_id", tmdb_id)
      .eq("media_type", media_type)
      .neq("language", "ckb");
    sourceQuery = buildMatchQuery(sourceQuery, seasonNum, episodeNum);
    const { data: sourceRows, error: sourceErr } = await sourceQuery.limit(1);

    if (sourceErr) return json({ error: `DB error: ${sourceErr.message}` }, 500);
    if (!sourceRows || sourceRows.length === 0) {
      return json({ error: "No source subtitle available for this video" }, 404);
    }

    let sourceContent = sourceRows[0].content as string;
    const title = sourceRows[0].title as string;

    // Handle SRT -> VTT conversion
    if (!sourceContent.trim().toUpperCase().startsWith("WEBVTT")) {
      sourceContent = srtToVtt(sourceContent);
    }

    // Parse fresh if not resuming
    if (!blocks) {
      blocks = parseVtt(sourceContent);
    }
    if (blocks.length === 0) {
      return json({ error: "No subtitle cues found in the source file" }, 400);
    }

    // 4. Translate in batches of 40, saving progress after each batch
    const totalBatches = Math.ceil(blocks.length / BATCH_SIZE);

    for (let b = 0; b < totalBatches; b++) {
      const batch = blocks.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);

      // Skip batch if all cues already have translations different from original
      const allTranslated = batch.every((blk) => blk.translated && blk.translated !== blk.text);
      if (allTranslated) continue;

      const texts = batch.map((blk) => blk.text);
      const translated = await translateBatchWithGemini(apiKey, texts);

      for (let i = 0; i < batch.length; i++) {
        if (i < translated.length) {
          batch[i].translated = translated[i];
        }
      }

      // Save progress after each batch
      existingId = await saveProgress(existingId, tmdb_id, media_type, seasonNum, episodeNum, title, blocks, null);
      console.log(`Batch ${b + 1}/${totalBatches} saved for tmdb_id=${tmdb_id}`);

      // Wait 4 seconds between batches (free-tier safety)
      if (b < totalBatches - 1) {
        await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY_MS));
      }
    }

    // 5. Final upload + update
    const translatedVtt = reassembleVtt(blocks);
    const path = storagePath(media_type, tmdb_id, seasonNum || undefined, episodeNum || undefined);
    const fileUrl = await uploadToStorage(translatedVtt, path);

    if (existingId) {
      await supabase
        .from("subtitles")
        .update({ content: translatedVtt, file_url: fileUrl, label: "Kurdish (Sorani)", updated_at: new Date().toISOString() })
        .eq("id", existingId);
    } else {
      await supabase
        .from("subtitles")
        .insert({
          tmdb_id, media_type, season_number: seasonNum, episode_number: episodeNum,
          title, language: "ckb", label: "Kurdish (Sorani)",
          content: translatedVtt, file_url: fileUrl, is_auto: true,
        });
    }

    return json({ file_url: fileUrl, cached: false, cue_count: blocks.length });
  } catch (err) {
    console.error("translate-subtitle error:", err.message);
    return json({ error: err.message }, 500);
  }
});
