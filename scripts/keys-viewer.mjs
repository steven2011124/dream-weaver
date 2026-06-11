// `npm run dev:keys` — opens http://localhost:4747 with all SARVIS keys in a
// styled panel so you can copy / change them in one place.
// Reads from .env and exposes a small POST endpoint to update individual keys.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, "..", ".env");
const PORT = process.env.KEYS_PORT || 4747;

const RELEVANT = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_BACKEND_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "LOVABLE_API_KEY",
  "HF_TOKEN",
  "NEWS_API_KEY",
  "DISCORD_TOKEN",
  "DISCORD_GUILD_ID",
];

function parseEnv() {
  const map = {};
  if (!fs.existsSync(ENV_PATH)) return map;
  const text = fs.readFileSync(ENV_PATH, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m) map[m[1]] = m[2];
  }
  return map;
}

function writeEnv(map) {
  const lines = Object.entries(map).map(([k, v]) => `${k}="${v}"`);
  fs.writeFileSync(ENV_PATH, lines.join("\n") + "\n", "utf8");
}

const HTML = (env) => `<!doctype html><html><head><meta charset="utf-8"><title>SARVIS Keys</title>
<style>
  body{font-family:ui-sans-serif,system-ui;background:#0a1224;color:#dff5ff;margin:0;padding:32px}
  h1{color:#22d3ee;margin:0 0 4px}
  p{color:#7aa6c6;margin:0 0 24px}
  .row{display:grid;grid-template-columns:240px 1fr 90px;gap:12px;align-items:center;margin:8px 0;background:#0f1b34;border:1px solid #1e3252;border-radius:8px;padding:10px 12px}
  label{color:#bfe7ff;font-size:13px;font-weight:600}
  input{background:#06101f;color:#e6f6ff;border:1px solid #1e3252;border-radius:6px;padding:8px 10px;font-family:ui-monospace,monospace;font-size:13px}
  button{background:#22d3ee;color:#06101f;border:none;border-radius:6px;padding:8px 12px;font-weight:600;cursor:pointer}
  button:hover{background:#67e8f9}
  .ok{color:#39ff14}
  .missing input{border-color:#7f1d1d}
  .missing label::after{content:" • missing";color:#fca5a5;font-weight:400}
</style></head><body>
<h1>🔑 SARVIS Keys</h1>
<p>Local <code>.env</code> editor. Changes save instantly. Restart <code>npm run dev</code> to pick them up.</p>
<form id="f">
${RELEVANT.map((k) => {
  const v = env[k] ?? "";
  const cls = v ? "" : "missing";
  return `<div class="row ${cls}"><label>${k}</label><input name="${k}" value="${v.replace(/"/g, "&quot;")}" type="${k.includes("SECRET") || k.includes("TOKEN") || k.includes("KEY") ? "password" : "text"}" /><button type="button" onclick="save('${k}',this)">Save</button></div>`;
}).join("\n")}
</form>
<script>
async function save(k,btn){
  const v=document.forms.f.elements[k].value;
  btn.textContent='…';
  const r=await fetch('/set',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:k,value:v})});
  btn.textContent=r.ok?'✓':'Err';setTimeout(()=>btn.textContent='Save',1200);
}
</script></body></html>`;

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML(parseEnv()));
    return;
  }
  if (req.method === "POST" && req.url === "/set") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const { key, value } = JSON.parse(body);
        if (!/^[A-Z0-9_]+$/.test(key)) throw new Error("bad key");
        const env = parseEnv();
        env[key] = String(value ?? "");
        writeEnv(env);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400);
        res.end(String(e?.message || e));
      }
    });
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`\n🔑  SARVIS keys viewer: http://localhost:${PORT}\n`);
});
