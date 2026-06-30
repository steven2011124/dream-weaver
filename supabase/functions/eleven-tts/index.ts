// ElevenLabs TTS — returns base64 MP3 audio. Used for JARVIS-quality voice.
import { encode as base64Encode } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Deep, JARVIS-like British male: "George"
const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const key = Deno.env.get("ELEVENLABS_API_KEY");
    if (!key) {
      return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { text, voiceId, modelId } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "text required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const trimmed = text.slice(0, 4500);
    const vid = (typeof voiceId === "string" && voiceId.trim()) || DEFAULT_VOICE_ID;
    const mid = (typeof modelId === "string" && modelId.trim()) || "eleven_turbo_v2_5";

    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${vid}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          model_id: mid,
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.85,
            style: 0.35,
            use_speaker_boost: true,
            speed: 1.05,
          },
        }),
      },
    );
    if (!r.ok) {
      const err = await r.text();
      return new Response(JSON.stringify({ error: err || `TTS failed: ${r.status}` }), {
        status: r.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const buf = await r.arrayBuffer();
    const audioContent = base64Encode(new Uint8Array(buf));
    return new Response(JSON.stringify({ audioContent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
