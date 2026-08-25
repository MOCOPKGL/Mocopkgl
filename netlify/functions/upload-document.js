exports.handler = async function (event) {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method not allowed" })
      };
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const BUCKET = "PKGL_Documents";

    if (!SUPABASE_URL || !SERVICE_KEY) {
      throw new Error("Server configuration is missing.");
    }

    const { token, fileName, fileType, fileData } =
      JSON.parse(event.body || "{}");

    if (!token || !fileName || !fileData) {
      throw new Error("Missing upload information.");
    }

    // Verify that the person uploading is the league administrator
    const authResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/pkgl_bootstrap`,
      {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ p_token: token })
      }
    );

    if (!authResponse.ok) {
      throw new Error("Unable to verify administrator.");
    }

    const authData = await authResponse.json();

    const adminUser = Array.isArray(authData) ? authData[0]?.user : authData?.user; if (!adminUser?.is_admin) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Administrator access required." })
      };
    }

    // Convert the file from base64 back into bytes
    const buffer = Buffer.from(fileData, "base64");

    const safeName = fileName.replace(/[^a-zA-Z0-9._ -]/g, "_");

    // Upload to Supabase Storage
    const uploadResponse = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(safeName)}`,
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

    if (!uploadResponse.ok) {
      throw new Error(uploadText || "Upload failed.");
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        fileName: safeName
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || "Upload failed."
      })
    };
  }
};

