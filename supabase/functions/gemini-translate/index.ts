import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Password",
};

const ADMIN_PASSWORD = "admin123";

const SYSTEM_PROMPT =
  "You are an expert cinematic movie translator. " +
  "Translate the following English subtitles into Central Kurdish (Sorani). " +
  "DO NOT translate word-for-word like a robot. " +
  "Use natural, cinematic, and colloquial/street Kurdish language to perfectly capture the true meaning, emotion, and slang of the scene. " +
  "Preserve the exact subtitle index numbers and timecodes.";

const GEMINI_MODEL = "gemini-1.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

interface SubtitleBlock {
  index: string;
  timestamp: string;
  text: string;
  translated: string;
}

function parseSubtitleBlocks(content: string): SubtitleBlock[] {
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
    let textLines: string[] = [];

    if (/^\d+$/.test(line)) {
      index = line;
      i++;
    }

    const tsLine = lines[i]?.trim() || "";
    const tsMatch = tsLine.match(
      /(\d{1,2}:\d{2}:\d{2}[.,]\d{3}|\d{1,2}:\d{2}[.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{3}|\d{1,2}:\d{2}[.,]\d{3})/
    );
    if (tsMatch) {
      timestamp = tsLine;
      i++;
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
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

    blocks.push({ index, timestamp, text: textLines.join("\n"), translated: "" });
  }

  return blocks;
}

function reassembleSubtitle(blocks: SubtitleBlock[], format: "srt" | "vtt"): string {
  const parts: string[] = [];
  if (format === "vtt") parts.push("WEBVTT\n");

  blocks.forEach((block, idx) => {
    if (format === "srt" && block.index) {
      parts.push(block.index);
    } else if (format === "srt") {
      parts.push(String(idx + 1));
    }
    const ts = format === "vtt" ? block.timestamp.replace(",", ".") : block.timestamp;
    parts.push(ts);
    parts.push(block.translated || block.text);
    parts.push("");
  });

  return parts.join("\n").trim() + "\n";
}

function srtToVtt(srt: string): string {
  if (srt.trim().toUpperCase().startsWith("WEBVTT")) return srt.trim() + "\n";
  let vtt = "WEBVTT\n\n";
  const body = srt.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const blockList = body.split(/\n\s*\n/);
  for (const block of blockList) {
    const lines = block.split("\n");
    let timeLineIdx = 0;
    if (lines[0] && /^\d+$/.test(lines[0].trim())) timeLineIdx = 1;
    const timeLine = lines[timeLineIdx];
    if (!timeLine || !timeLine.includes("-->")) continue;
    const convertedTime = timeLine
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
      .replace(/(\d{2}:\d{2}),(\d{3})/g, "00:$1.$2");
    const textLines = lines.slice(timeLineIdx + 1);
    vtt += convertedTime + "\n" + textLines.join("\n") + "\n\n";
  }
  return vtt.trim() + "\n";
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function checkAdmin(auth: string | null): boolean {
  if (!auth) return false;
  return auth === ADMIN_PASSWORD;
}

async function translateChunkWithGemini(
  apiKey: string,
  numberedText: string
): Promise<string> {
  const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "Translate each numbered subtitle block below into Sorani Kurdish (Central Kurdish, Arabic script). " +
                "Keep the [N] markers exactly as they are. Return ONLY the translated blocks with their markers, nothing else.\n\n" +
                numberedText,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let apiMessage = errText;
    try {
      const parsed = JSON.parse(errText);
      apiMessage = parsed?.error?.message || errText;
    } catch { /* keep raw */ }

    if (res.status === 400) {
      throw new Error(`Gemini error: ${apiMessage}`);
    }
    if (res.status === 429) {
      throw new Error(`Gemini rate limit exceeded. Please wait and try again. (${apiMessage})`);
    }
    throw new Error(`Gemini error (${res.status}): ${apiMessage}`);
  }

  const data = await res.json();
  const translated: string =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

  if (!translated) {
    throw new Error("Gemini returned an empty response");
  }

  return translated;
}

async function translateBlocks(
  apiKey: string,
  blocks: SubtitleBlock[],
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const BATCH_SIZE = 30;
  const totalBatches = Math.ceil(blocks.length / BATCH_SIZE);
  let doneCount = 0;

  for (let b = 0; b < totalBatches; b++) {
    const batch = blocks.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    const numberedText = batch
      .map((blk, i) => `[${i + 1}]\n${blk.text}`)
      .join("\n\n");

    const translated = await translateChunkWithGemini(apiKey, numberedText);

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
          batch[num].translated = text;
        }
      }
    });

    doneCount += batch.length;
    onProgress?.(doneCount, blocks.length);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const auth = req.headers.get("X-Admin-Password");
    if (!checkAdmin(auth)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const { content, format, mode } = body;

    if (!content || typeof content !== "string") {
      return json({ error: "Missing 'content' field" }, 400);
    }

    const subFormat: "srt" | "vtt" = format === "srt" ? "srt" : "vtt";
    const apiKey = Deno.env.get("GEMINI_API_KEY");

    if (!apiKey) {
      return json({ error: "GEMINI_API_KEY not configured on the server" }, 500);
    }

    // Parse subtitle blocks
    const blocks = parseSubtitleBlocks(content);
    if (blocks.length === 0) {
      return json({ error: "No subtitle blocks found in the file" }, 400);
    }

    // Translate all blocks with Gemini
    await translateBlocks(apiKey, blocks);

    // ── Mode: translate_only ──
    // Return translations as an array for the client to fill into editable fields
    if (mode === "translate_only") {
      return json({
        translations: blocks.map((blk, idx) => ({
          index: blk.index || String(idx + 1),
          timestamp: blk.timestamp,
          original: blk.text,
          translated: blk.translated,
        })),
        block_count: blocks.length,
      });
    }

    // ── Mode: save (default) ──
    // Reassemble translated subtitle file, upload to storage, save to subtitles table
    const {
      file_name,
      tmdb_id,
      media_type,
      season_number,
      episode_number,
      title,
    } = body;

    // If the client provided pre-edited translations, use them instead
    if (body.translations && Array.isArray(body.translations)) {
      body.translations.forEach((t: { index: string; translated: string }) => {
        const idx = blocks.findIndex(
          (blk, i) => (blk.index || String(i + 1)) === t.index
        );
        if (idx >= 0) blocks[idx].translated = t.translated;
      });
    }

    const translatedContent = reassembleSubtitle(blocks, subFormat);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const safeName = (file_name || "subtitles").replace(/[^a-zA-Z0-9._-]/g, "_");
    const ts = Date.now();
    const storagePath = `translations/${ts}_${safeName}.${subFormat}`;

    const { error: uploadError } = await supabase.storage
      .from("subtitles")
      .upload(storagePath, translatedContent, {
        contentType: subFormat === "vtt" ? "text/vtt" : "text/plain",
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
    }

    const { data: publicUrlData } = supabase.storage
      .from("subtitles")
      .getPublicUrl(storagePath);

    // If tmdb_id and title are provided, also save to the subtitles table
    let savedSubtitle: unknown = null;
    if (tmdb_id && title) {
      const vttContent = srtToVtt(translatedContent);

      let existingQuery = supabase
        .from("subtitles")
        .select("id")
        .eq("tmdb_id", tmdb_id)
        .eq("media_type", media_type || "movie");

      if (season_number) {
        existingQuery = existingQuery.eq("season_number", season_number);
      } else {
        existingQuery = existingQuery.is("season_number", null);
      }
      if (episode_number) {
        existingQuery = existingQuery.eq("episode_number", episode_number);
      } else {
        existingQuery = existingQuery.is("episode_number", null);
      }

      const { data: existing } = await existingQuery.maybeSingle();

      if (existing?.id) {
        const { data: updated, error: updateError } = await supabase
          .from("subtitles")
          .update({
            title,
            content: vttContent,
            language: "ku",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select();
        if (!updateError) savedSubtitle = updated?.[0] || null;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("subtitles")
          .insert({
            tmdb_id,
            media_type: media_type || "movie",
            season_number: season_number || null,
            episode_number: episode_number || null,
            title,
            language: "ku",
            content: vttContent,
          })
          .select();
        if (!insertError) savedSubtitle = inserted?.[0] || null;
      }
    }

    return json({
      translated_content: translatedContent,
      storage_url: publicUrlData.publicUrl,
      storage_path: storagePath,
      subtitle: savedSubtitle,
      block_count: blocks.length,
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
