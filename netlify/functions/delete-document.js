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
    const BUCKET = "PKGL Documents";

    if (!SUPABASE_URL || !SERVICE_KEY) {
      throw new Error("Server configuration is missing.");
    }

    const { token, fileName } = JSON.parse(event.body || "{}");

    if (!token || !fileName) {
      throw new Error("Missing delete information.");
    }

    // Verify administrator
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

    if (!authData || !authData.user || !authData.user.is_admin) {
      throw new Error("Administrator access required.");
    }

    // Delete document from Supabase Storage
    const deleteResponse = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${BUCKET}`,
      {
        method: "DELETE",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prefixes: [fileName]
        })
      }
    );

    const deleteText = await deleteResponse.text();

    if (!deleteResponse.ok) {
      throw new Error(deleteText || "Delete failed.");
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || "Delete failed."
      })
    };
  }
};

