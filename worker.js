
/**
 * Equipment Accomplishment Manager
 * Cloudflare Worker backend
 */

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_API =
  "https://sheets.googleapis.com/v4/spreadsheets";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

// Convert data to Base64 URL format
function base64UrlEncode(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Encode JSON for a JWT
function encodeJson(data) {
  return base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(data))
  );
}

// Generate a Google access token using the service account
async function getGoogleAccessToken(env) {
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");

  const pemContents = privateKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const binaryKey = Uint8Array.from(
    atob(pemContents),
    character => character.charCodeAt(0)
  );

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const now = Math.floor(Date.now() / 1000);

  const header = encodeJson({
    alg: "RS256",
    typ: "JWT"
  });

  const payload = encodeJson({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600
  });

  const unsignedToken = `${header}.${payload}`;

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedToken)
  );

  const jwt = `${unsignedToken}.${base64UrlEncode(
    new Uint8Array(signature)
  )}`;

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok) {
    console.error("Google authentication failed:", tokenData);

    throw new Error("Google authentication failed.");
  }

  return tokenData.access_token;
}

// Save one record to Google Sheets
async function saveToGoogleSheets(record, env) {
  const accessToken = await getGoogleAccessToken(env);

  const spreadsheetId = env.GOOGLE_SHEET_ID;

  const range = encodeURIComponent("Records!A:D");

  const url =
    `${GOOGLE_SHEETS_API}/${spreadsheetId}/values/${range}:append` +
    "?valueInputOption=RAW&insertDataOption=INSERT_ROWS";

  const values = [[
    record.date,
    record.equipment,
    record.hmr,
    new Date().toISOString()
  ]];

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      values
    })
  });

  const result = await response.json();

  if (!response.ok) {
    console.error("Google Sheets error:", result);

    throw new Error("Unable to save the record to Google Sheets.");
  }

  return result;
}

// Main Worker
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle form submissions
    if (url.pathname === "/api/submit") {
      if (request.method !== "POST") {
        return jsonResponse(
          { success: false, message: "Method not allowed." },
          405
        );
      }

      try {
        const record = await request.json();

        const date = record.date;
        const equipment = String(record.equipment || "").trim();
        const hmr = Number(record.hmr);

        // Validate submitted data
        if (
          typeof date !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
          new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date ||
          !equipment ||
          equipment.length > 100 ||
          !Number.isFinite(hmr) ||
          hmr < 0
        ) {
          return jsonResponse(
            {
              success: false,
              message: "Please provide valid Date, Equipment, and HMR values."
            },
            400
          );
        }

        // Check required Cloudflare secrets
        if (
          !env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
          !env.GOOGLE_PRIVATE_KEY ||
          !env.GOOGLE_SHEET_ID
        ) {
          throw new Error("Google Sheets configuration is incomplete.");
        }

        await saveToGoogleSheets(
          { date, equipment, hmr },
          env
        );

        return jsonResponse({
          success: true,
          message: "Record saved successfully."
        });

      } catch (error) {
        console.error("Submission failed:", error?.name, error?.message, error?.stack);

        return jsonResponse(
          {
            success: false,
            message: "Unable to save your record. Please try again."
          },
          500
        );
      }
    }

    // Serve the website's static files
    return env.ASSETS.fetch(request);
  }
};
