/**
 * Shared browser TTS helpers so the "Speak" button in chat and the
 * live voice call sound identical: deep, male, JARVIS-like, and pronounce
 * "SARVIS" as "service".
 */

export function pickMaleEnglishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const malePatterns = [
    /Google UK English Male/i,
    /Microsoft Guy/i,
    /Microsoft Ryan/i,
    /Microsoft George/i,
    /Microsoft Davis/i,
    /Microsoft Mark/i,
    /Microsoft David/i,
    /Daniel/i, // macOS UK male
    /Alex/i, // macOS US male
    /Oliver/i,
    /Arthur/i,
    /Fred/i,
    /Rishi/i,
  ];
  for (const re of malePatterns) {
    const match = voices.find((v) => re.test(v.name) && /^en/i.test(v.lang));
    if (match) return match;
  }
  const anyMale = voices.find(
    (v) =>
      /^en/i.test(v.lang) &&
      /(male|guy|man|ryan|george|davis|mark|david|daniel|alex|oliver|arthur|fred|rishi)/i.test(v.name),
  );
  if (anyMale) return anyMale;
  // Explicitly avoid obviously female voices when falling back
  const notFemale = voices.find(
    (v) =>
      /^en/i.test(v.lang) &&
      !/(female|woman|samantha|victoria|karen|moira|tessa|fiona|zira|hazel|susan|sara|catherine|amy|emma|jenny|aria|nancy|ava|allison|kate)/i.test(
        v.name,
      ),
  );
  if (notFemale) return notFemale;
  return voices.find((v) => /^en/i.test(v.lang)) ?? voices[0];
}

/** Replace the brand name so the speech engine actually says "service". */
export function speakableText(input: string): string {
  return input.replace(/\bSARVIS\b/gi, "service");
}

/**
 * Speak the given text with the JARVIS-like male voice. Resolves when done.
 * Tries ElevenLabs (deep, natural British male via the eleven-tts edge
 * function) first, then falls back to the browser's SpeechSynthesis API.
 */
export function speakWithMaleVoice(text: string): Promise<void> {
  const clean = speakableText(text).trim();
  if (!clean) return Promise.resolve();
  return speakWithElevenLabs(clean).catch(() => speakWithBrowser(clean));
}

let currentAudio: HTMLAudioElement | null = null;

async function speakWithElevenLabs(text: string): Promise<void> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase.functions.invoke("eleven-tts", { body: { text } });
  if (error || !data?.audioContent) throw error || new Error("no audio");
  return new Promise((resolve) => {
    try {
      if (currentAudio) { currentAudio.pause(); currentAudio = null; }
      const audio = new Audio(`data:audio/mpeg;base64,${data.audioContent}`);
      currentAudio = audio;
      audio.onended = () => { currentAudio = null; resolve(); };
      audio.onerror = () => { currentAudio = null; resolve(); };
      void audio.play().catch(() => resolve());
    } catch { resolve(); }
  });
}

function speakWithBrowser(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return resolve();
    const doSpeak = () => {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 1.0;
        utter.pitch = 0.92;
        utter.volume = 1.0;
        const voice = pickMaleEnglishVoice();
        if (voice) { utter.voice = voice; utter.lang = voice.lang; }
        else utter.lang = "en-GB";
        utter.onend = () => resolve();
        utter.onerror = () => resolve();
        window.speechSynthesis.speak(utter);
      } catch { resolve(); }
    };
    if (window.speechSynthesis.getVoices().length === 0) {
      const handler = () => {
        window.speechSynthesis.removeEventListener("voiceschanged", handler);
        doSpeak();
      };
      window.speechSynthesis.addEventListener("voiceschanged", handler);
      setTimeout(doSpeak, 400);
    } else doSpeak();
  });
}
