// Real text-to-video generation via Hugging Face Inference (LTX-Video / Hunyuan / Wan).
// Returns a base64-encoded MP4 the frontend can play and download.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Ordered by preference; fall through on failure.
const HF_VIDEO_MODELS = [
  "Lightricks/LTX-Video",
  "ali-vilab/text-to-video-ms-1.7b",
  "damo-vilab/text-to-video-ms-1.7b",
];

async function tryVideoModel(model: string, prompt: string, token: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const r = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "video/mp4" },
    body: JSON.stringify({ inputs: prompt, parameters: { num_frames: 32, num_inference_steps: 25 } }),
  });
  if (!r.ok) {
    console.warn("hf-video model failed", model, r.status, (await r.text()).slice(0, 200));
    return null;
  }
  const ct = r.headers.get("content-type") ?? "video/mp4";
  if (!ct.startsWith("video/") && !ct.includes("octet-stream")) {
    console.warn("hf-video non-video response", model, ct);
    return null;
  }
  return { bytes: new Uint8Array(await r.arrayBuffer()), mime: ct.startsWith("video/") ? ct : "video/mp4" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { prompt } = await req.json();
    if (typeof prompt !== "string" || !prompt.trim()) {
      return new Response(JSON.stringify({ error: "prompt required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const HF_TOKEN = Deno.env.get("HF_TOKEN");
    if (!HF_TOKEN) {
      return new Response(JSON.stringify({ error: "HF_TOKEN not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const model of HF_VIDEO_MODELS) {
      const res = await tryVideoModel(model, prompt, HF_TOKEN);
      if (res) {
        // base64-encode in chunks to avoid stack overflow on large buffers.
        let bin = "";
        const chunk = 0x8000;
        for (let i = 0; i < res.bytes.length; i += chunk) {
          bin += String.fromCharCode.apply(null, Array.from(res.bytes.subarray(i, i + chunk)) as unknown as number[]);
        }
        const b64 = btoa(bin);
        return new Response(
          JSON.stringify({
            kind: "video",
            title: `Video · ${prompt}`.slice(0, 80),
            videoBase64: b64,
            mimeType: res.mime,
            model,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }
    return new Response(JSON.stringify({ error: "All HF video models failed. Models may be cold-loading — try again in ~30s." }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("hf-video error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
