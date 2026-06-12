import { supabase } from "@/integrations/supabase/client";
import type { SlideOutline, SlideTheme } from "@/components/SlidePreview";
import type { VideoFrame } from "@/lib/videoStitch";

export interface GenFileResult {
  title?: string;
  filename?: string;
  mimeType?: string;
  dataBase64?: string;
  speakText?: string;
  audioBase64?: string;
  outline?: SlideOutline;
  theme?: SlideTheme;
  // Video-specific: raw frames + narration the frontend will stitch into a real video file
  videoFrames?: VideoFrame[];
  narration?: string;
  secondsPerFrame?: number;
  // Real video path: a base64-encoded MP4 produced by an HF text-to-video model.
  videoBase64?: string;
  error?: string;
}

export async function generateDocument(topic: string, model?: string): Promise<GenFileResult> {
  try {
    const { data, error } = await supabase.functions.invoke("generate-document", {
      body: { topic, model },
    });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    return data as GenFileResult;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Document generation failed" };
  }
}

export async function generateSlides(topic: string, model?: string, themeId?: string): Promise<GenFileResult> {
  try {
    const { data, error } = await supabase.functions.invoke("generate-slides", {
      body: { topic, model, themeId },
    });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    let speakText = "";
    if (data?.outline) {
      speakText = `${data.outline.title}. `;
      if (data.outline.subtitle) speakText += `${data.outline.subtitle}. `;
      for (const s of data.outline.slides ?? []) {
        speakText += `${s.title}. ${(s.bullets ?? []).join(". ")}. `;
      }
    }
    return { ...data, speakText } as GenFileResult;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Slide generation failed" };
  }
}

export async function generateVideo(prompt: string, model?: string): Promise<GenFileResult> {
  // 1. Try the real HF text-to-video pipeline first.
  try {
    const { data, error } = await supabase.functions.invoke("hf-video", { body: { prompt } });
    if (!error && !data?.error && data?.videoBase64) {
      return {
        title: data.title,
        videoBase64: data.videoBase64,
        mimeType: data.mimeType ?? "video/mp4",
        speakText: prompt,
      };
    }
    console.warn("hf-video unavailable, falling back to slideshow:", error?.message ?? data?.error);
  } catch (e) {
    console.warn("hf-video threw, falling back:", e);
  }
  // 2. Fallback: storyboard slideshow stitched on the client.
  try {
    const { data, error } = await supabase.functions.invoke("generate-video", { body: { prompt, model } });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    return {
      title: data?.title,
      videoFrames: data?.frames ?? [],
      narration: data?.narration ?? "",
      secondsPerFrame: data?.secondsPerFrame ?? 3,
      speakText: data?.narration ?? "",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Video generation failed" };
  }
}

