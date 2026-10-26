import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function translateWithAI(text: string): Promise<string> {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a professional cinematic translator. Translate the given movie or TV show synopsis into Sorani Kurdish (Central Kurdish, written in Arabic script). Use natural, fluent, cinematic language — not a word-for-word machine translation. Keep proper names (actors, places, film titles) in their original Latin script. Return ONLY the translated Kurdish text, nothing else.",
        },
        { role: "user", content: text },
      ],
      temperature: 0.3,
      max_tokens: 600,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const translated = data.choices?.[0]?.message?.content?.trim();
  if (!translated) throw new Error("Empty translation response");
  return translated;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { text, target_lang } = await req.json();

    if (!text || typeof text !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing 'text' field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const lang = target_lang || "ku";
    const hash = await sha256(text.trim());

    // Check cache
    const { data: cached } = await supabase
      .from("translations")
      .select("translated_text")
      .eq("source_hash", hash)
      .eq("target_lang", lang)
      .maybeSingle();

    if (cached?.translated_text) {
      return new Response(
        JSON.stringify({ translated_text: cached.translated_text, cached: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Translate
    const translated = await translateWithAI(text);

    // Store in cache
    await supabase
      .from("translations")
      .upsert({
        source_text: text.trim(),
        source_hash: hash,
        target_lang: lang,
        translated_text: translated,
      }, { onConflict: "source_hash,target_lang" });

    return new Response(
      JSON.stringify({ translated_text: translated, cached: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
