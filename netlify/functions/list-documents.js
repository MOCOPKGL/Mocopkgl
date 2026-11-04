async function getSession(SUPABASE_URL,SERVICE_KEY,token) {
  if (!token) return null;
  const q = new URLSearchParams({
    select: "is_admin",
    token: `eq.${token}`,
    expires_at: `gt.${new Date().toISOString()}`,
    limit: "1"
  });
  const r = await fetch(`${SUPABASE_URL}/rest/v1/pkgl_sessions?${q.toString()}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`
    }
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const BUCKET = "PKGL Documents";
    const { token } = JSON.parse(event.body || "{}");

    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Server configuration is missing.");

    const session = await getSession(SUPABASE_URL,SERVICE_KEY,token);
    if (!session) {
      return { statusCode: 401, body: JSON.stringify({ error: "Team PIN required." }) };
    }

    const response = await fetch(
      `${SUPABASE_URL}/storage/v1/object/list/${encodeURIComponent(BUCKET)}`,
      {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prefix: "",
          limit: 100,
          offset: 0,
          sortBy: { column: "created_at", order: "desc" }
        })
      }
    );

    const text = await response.text();
    return { statusCode: response.status, body: text };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
