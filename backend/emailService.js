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
async function getEmails(token) {
  const client = getClient(token);

  // Using /me/messages gets inbox items. 
  // To ensure we catch things you JUST sent, we pull the top 20 recent messages globally.
  const result = await client
    .api("/me/messages") 
    .top(20) // 💡 Increased to 20 to make sure we catch both sent and received items
    .select("id,subject,from,toRecipients,receivedDateTime") // 💡 Added toRecipients
    .orderby("receivedDateTime DESC")
    .get();

  return result.value;
}

// ======================
// DELETE EMAIL
// ======================
async function deleteEmail(token, messageId) {
  const client = getClient(token);

  await client.api(`/me/messages/${messageId}`).delete();

  return "Email deleted successfully 🗑️";
}

module.exports = {
  sendEmail,
  getEmails,
  deleteEmail,
};