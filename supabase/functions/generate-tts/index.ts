/**
 * Text-to-Speech generation with Jarvis-like voice (formal, robotic, British accent)
 * Uses Google Cloud Text-to-Speech API
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface TTSBody {
  text: string;
}

interface GoogleTTSResponse {
  audioContent: string;
}

async function generateTTS(text: string): Promise<string> {
  // Use Google Cloud Text-to-Speech API
  // Note: This requires setting GOOGLE_TTS_API_KEY env variable
  const apiKey = Deno.env.get("GOOGLE_TTS_API_KEY");
  
  if (!apiKey) {
    // Fallback: use Web Speech API on client side or return empty
    console.warn("GOOGLE_TTS_API_KEY not set, TTS unavailable");
    return "";
  }

  try {
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: "en-GB",
            // Neural2-B is a deep, natural-sounding British male — far less robotic than Standard.
            name: "en-GB-Neural2-B",
          },
          audioConfig: {
            audioEncoding: "MP3",
            pitch: -1.5,
            speakingRate: 1.0,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Google TTS API error: ${response.status}`);
    }

    const data = (await response.json()) as GoogleTTSResponse;
    return data.audioContent ?? "";
  } catch (error) {
    console.error("TTS generation error:", error);
    // Return empty string on error - audio is optional
    return "";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as TTSBody;
    if (!body?.text || typeof body.text !== "string") {
      return new Response(
        JSON.stringify({ error: "text required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const audioBase64 = await generateTTS(body.text);

    return new Response(
      JSON.stringify({
        audioBase64: audioBase64 || null,
        mimeType: "audio/mpeg",
        note: audioBase64
          ? "Audio generated successfully"
          : "TTS service unavailable, but video can still be viewed without audio",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-tts error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
        audioBase64: null,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
