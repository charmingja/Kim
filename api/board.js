// 모두의 코드 비교 게시판: Upstash Redis(REST)에 이름별로 한 건씩 저장
// Vercel Storage에서 Upstash Redis를 연결하면 아래 환경변수가 자동으로 들어온다.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = "coding-lab:shares";

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

const clip = (v, n) => String(v || "").slice(0, n);

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !TOKEN) return res.status(500).json({ error: "storage_not_connected" });
  try {
    if (req.method === "GET") {
      const flat = (await redis(["HGETALL", KEY])) || [];
      const shares = [];
      for (let i = 0; i < flat.length; i += 2) {
        try { shares.push({ name: flat[i], ...JSON.parse(flat[i + 1]) }); } catch (e) {}
      }
      return res.status(200).json({ shares });
    }
    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const name = clip(b.name, 20).trim();
      if (!name) return res.status(400).json({ error: "no_name" });
      const d = b.data || {};
      const s3 = d.s3 || {};
      const list = (a, n) => (Array.isArray(a) ? a : []).slice(0, 10).map(c => clip(c, n));
      const clean = {
        at: new Date().toISOString(),
        warm: clip(d.warm, 80),
        s3: {
          codes: list(s3.codes, 80),
          phrases: list(s3.phrases, 200),
          memos: list(s3.memos, 400),
          sub: clip(s3.sub, 80),
          why: clip(s3.why, 400),
        },
      };
      await redis(["HSET", KEY, name, JSON.stringify(clean)]);
      return res.status(200).json({ ok: true });
    }
    if (req.method === "DELETE") {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      if (b.all) {
        if (!process.env.ADMIN_KEY || req.headers["x-admin-key"] !== process.env.ADMIN_KEY)
          return res.status(403).json({ error: "forbidden" });
        await redis(["DEL", KEY]);
      } else {
        const name = clip(b.name, 20).trim();
        if (name) await redis(["HDEL", KEY, name]);
      }
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).end();
  } catch (e) {
    return res.status(502).json({ error: "storage_error" });
  }
};
