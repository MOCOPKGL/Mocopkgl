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
    const { token, fileName, fileType, fileData } = JSON.parse(event.body || "{}");

    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Server configuration is missing.");
    if (!token || !fileName || !fileData) throw new Error("Missing upload information.");

    const session = await getSession(SUPABASE_URL,SERVICE_KEY,token);
    if (!session || session.is_admin !== true) {
      return { statusCode: 403, body: JSON.stringify({ error: "Administrator access required." }) };
    }

    const buffer = Buffer.from(fileData, "base64");
    const safeName = fileName.replace(/[^a-zA-Z0-9._ -]/g, "_");

    const uploadResponse = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(BUCKET)}/${encodeURIComponent(safeName)}`,
      {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": fileType || "application/octet-stream",
          "x-upsert": "true"
        },
        body: buffer
      }
    );

    const uploadText = await uploadResponse.text();
    if (!uploadResponse.ok) throw new Error(uploadText || "Upload failed.");

    return { statusCode: 200, body: JSON.stringify({ success:true,fileName:safeName }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error:error.message || "Upload failed." }) };
  }
};
