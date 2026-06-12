// Uncensored image generation via Hugging Face Inference (FLUX schnell).
// Used when Hacker Mode is on or the prompt was rejected by the default provider.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Open / minimally-filtered image models. Falls back across the list on failure.
const HF_IMAGE_MODELS = [
  "black-forest-labs/FLUX.1-schnell",
  "stabilityai/stable-diffusion-xl-base-1.0",
  "Heartsync/NSFW-Uncensored-photo",
];

async function tryModel(model: string, prompt: string, token: string): Promise<Uint8Array | null> {
  const r = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "image/png" },
    body: JSON.stringify({ inputs: prompt, parameters: { num_inference_steps: 4 } }),
  });
  if (!r.ok) {
    console.warn("hf-image model failed", model, r.status, (await r.text()).slice(0, 200));
    return null;
  }
  const ct = r.headers.get("content-type") ?? "";
  if (!ct.startsWith("image/")) {
    console.warn("hf-image non-image response", model, ct);
    return null;
  }
  return new Uint8Array(await r.arrayBuffer());
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

    for (const model of HF_IMAGE_MODELS) {
      const bytes = await tryModel(model, prompt, HF_TOKEN);
      if (bytes) {
        // base64-encode
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        const b64 = btoa(bin);
        return new Response(
          JSON.stringify({ imageUrl: `data:image/png;base64,${b64}`, model }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }
    return new Response(JSON.stringify({ error: "All HF image models failed (model loading or rate limit). Try again in ~20s." }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("hf-image error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
