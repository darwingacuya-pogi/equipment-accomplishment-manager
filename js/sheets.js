
/**
 * Sends an equipment record to the backend API.
 * The backend will handle saving it to Google Sheets.
 */

async function submitEquipmentRecord(record) {
  const response = await fetch("/api/submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(record)
  });

  // Read the server response
  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error("Invalid response from the server.");
  }

  // Check whether the request was successful
  if (!response.ok) {
    throw new Error(
      result.message || "Failed to submit equipment record."
    );
  }

  return result;
}
