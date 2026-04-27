// Open-Meteo weather + 4-day forecast — no API key required.
// Body: { lat?: number, lon?: number, place?: string }
// If lat/lon missing, geocodes "place" via Open-Meteo's free geocoder.
// v2 — deployed via Lovable Cloud (no manual supabase CLI step).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WMO: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle",
  55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
  66: "Freezing rain", 67: "Heavy freezing rain", 71: "Light snow",
  73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Rain showers",
  81: "Heavy rain showers", 82: "Violent rain showers", 85: "Snow showers",
  86: "Heavy snow showers", 95: "Thunderstorm", 96: "Thunderstorm w/ hail",
  99: "Severe thunderstorm",
};

Deno.serve(async (req) => {
  console.log("[get-weather v3] request received", req.method);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { lat, lon, place } = await req.json().catch(() => ({}));
    let latitude = typeof lat === "number" ? lat : null;
    let longitude = typeof lon === "number" ? lon : null;
    let resolvedPlace: string | null = null;

    if ((latitude == null || longitude == null) && typeof place === "string" && place.trim()) {
      const geo = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=${encodeURIComponent(place.trim())}`,
      );
      if (!geo.ok) return json({ error: "Geocoding failed" }, 200);
      const g = await geo.json();
      const hit = g?.results?.[0];
      if (!hit) return json({ error: `Could not find “${place}”` }, 200);
      latitude = hit.latitude;
      longitude = hit.longitude;
      resolvedPlace = `${hit.name}${hit.country ? ", " + hit.country : ""}`;
    }

    if (latitude == null || longitude == null) {
      return json({ error: "Provide lat/lon or place" }, 200);
    }

    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset` +
      `&forecast_days=4&timezone=auto`;
    const r = await fetch(url);
    if (!r.ok) return json({ error: `Weather API ${r.status}` }, 200);
    const w = await r.json();

    const cur = w.current ?? {};
    const daily = w.daily ?? {};
    const days = (daily.time ?? []).map((d: string, i: number) => ({
      date: d,
      summary: WMO[daily.weather_code?.[i]] ?? "—",
      tMax: daily.temperature_2m_max?.[i],
      tMin: daily.temperature_2m_min?.[i],
      pop: daily.precipitation_probability_max?.[i] ?? 0,
      sunrise: daily.sunrise?.[i],
      sunset: daily.sunset?.[i],
    }));

    return json({
      place: resolvedPlace,
      lat: latitude,
      lon: longitude,
      timezone: w.timezone,
      current: {
        temp: cur.temperature_2m,
        feelsLike: cur.apparent_temperature,
        humidity: cur.relative_humidity_2m,
        wind: cur.wind_speed_10m,
        isDay: cur.is_day === 1,
        summary: WMO[cur.weather_code] ?? "—",
        code: cur.weather_code,
      },
      days,
    });
  } catch (e) {
    console.error("get-weather error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 200);
  }
});
