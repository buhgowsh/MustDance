// src/services/adkService.js
/**
 * searchAdkSong(query: string) => Promise<DanceConfig>
 *
 * Expects your backend to expose a route like:
 *   POST /api/adk/search { query }
 * …and return a JSON dance config, e.g.:
 * {
 *   title: "Song Title",
 *   bpm: 120,
 *   steps: [ { label, duration, targetAngles }, ... ],
 *   audioUrl: "/audio/yourfile.mp3" // optional if your Play screen needs it
 * }
 */
export async function searchAdkSong(query) {
  const res = await fetch("http://localhost:8001/apps/base_agent/users/Josh/sessions/Josh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `ADK search failed (${res.status})`);
  }

  const cfg = await res.json();
  // Optional: validate/normalize shape here
  return cfg;
}
