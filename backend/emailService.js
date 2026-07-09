const { Client } = require("@microsoft/microsoft-graph-client");
require("isomorphic-fetch");

// ======================
// GRAPH CLIENT
// ======================
function getClient(token) {
  return Client.init({
    authProvider: (done) => done(null, token),
  });
}

// ======================
// SEND EMAIL
// ======================
async function sendEmail(token, to, subject, body) {
  const client = getClient(token);

  await client.api("/me/sendMail").post({
    message: {
      subject: subject || "No Subject",
      body: {
        contentType: "Text",
        content: body,
      },
      toRecipients: [
        {
          emailAddress: { address: to },
        },
      ],
    },
    saveToSentItems: true,
  });

  return "Email sent successfully 📧";
}

// ======================
// GET EMAILS (UPDATED TO SEARCH ALL MESSAGES)
// ======================
// ======================
// GET EMAILS (UPDATED - SEARCHES ALL FOLDERS)
// ======================
async function getEmails(token) {
  const client = getClient(token);

  try {
    // Search ALL messages (inbox + sent + all folders)
    const result = await client
      .api("/me/messages") 
      .top(50) // Increased to 50
      .select("id,subject,from,toRecipients,receivedDateTime,sentDateTime")
      .orderby("receivedDateTime DESC")
      .get();

    console.log("📧 Found", result.value.length, "messages");
    
    return result.value;
  } catch (error) {
    console.error("Get emails error:", error);
    throw new Error(`Failed to get emails: ${error.message}`);
  }
}

// ======================
// DELETE EMAIL
// ======================
// ======================
// DELETE EMAIL (FIXED)
// ======================
async function deleteEmail(token, messageId) {
  try {
    // Use Node's fetch (available in Node 18+) or global fetch
    const url = `https://graph.microsoft.com/v1.0/me/messages/${messageId}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    // 204 = Success (No Content)
    if (response.status === 204) {
      return "Email deleted successfully 🗑️";
    }

    // Try to get error details
    const errorData = await response.json().catch(() => {});
    throw new Error(errorData?.error?.message || `Delete failed with status ${response.status}`);

  } catch (error) {
    console.error("Delete email error:", error);

    if (error.message?.includes("404")) {
      throw new Error("Email not found or already deleted");
    }
    if (error.message?.includes("403")) {
      throw new Error("Access denied. Check your Mail.ReadWrite permissions");
    }

    throw new Error(`Failed to delete email: ${error.message}`);
  }
}
module.exports = {
  sendEmail,
  getEmails,
  deleteEmail,
};


