import { getStore } from "@netlify/blobs";

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

// 앱(index.html)의 mergeState와 같은 규칙: 카드는 upd가 최신인 쪽, 삭제 기록(dead)은 합침
function merge(a, b) {
  const m = new Map();
  for (const c of [...(a.cards || []), ...(b.cards || [])]) {
    const l = m.get(c.id);
    if (!l || (c.upd || 0) > (l.upd || 0)) m.set(c.id, c);
  }
  const aS = a.S || {}, bS = b.S || {};
  const dead = { ...(aS.dead || {}) };
  for (const k in bS.dead || {}) dead[k] = Math.max(dead[k] || 0, bS.dead[k]);
  for (const k in dead) {
    const c = m.get(Number(k));
    if (c && (c.upd || 0) < dead[k]) m.delete(Number(k));
  }
  const S = (bS.upd || 0) > (aS.upd || 0) ? { ...bS } : { ...aS };
  S.dead = dead;
  return { cards: [...m.values()].sort((x, y) => x.id - y.id), S };
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const { k, cards, S } = body || {};
  if (!/^[0-9a-f]{64}$/.test(k || "") || !Array.isArray(cards) || typeof S !== "object" || !S)
    return json({ error: "bad request" }, 400);

  const store = getStore({ name: "srs", consistency: "strong" });
  const old = (await store.get(k, { type: "json" })) || { cards: [], S: {} };
  const merged = merge(old, { cards, S });
  await store.setJSON(k, merged);
  return json(merged);
};

export const config = { path: "/api/sync" };
