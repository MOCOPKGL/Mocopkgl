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
    const { token, fileName } = JSON.parse(event.body || "{}");

    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Server configuration is missing.");
    if (!token || !fileName) throw new Error("Missing delete information.");

    const session = await getSession(SUPABASE_URL,SERVICE_KEY,token);
    if (!session || session.is_admin !== true) {
      return { statusCode: 403, body: JSON.stringify({ error: "Administrator access required." }) };
    }

    const deleteResponse = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(BUCKET)}`,
      {
        method: "DELETE",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prefixes:[fileName] })
      }
    );

    const deleteText = await deleteResponse.text();
    if (!deleteResponse.ok) throw new Error(deleteText || "Delete failed.");

    return { statusCode: 200, body: JSON.stringify({ success:true }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error:error.message || "Delete failed." }) };
  }
};
