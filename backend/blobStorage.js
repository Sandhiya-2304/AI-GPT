const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions
} = require("@azure/storage-blob");

const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;

const blobServiceClient =
  BlobServiceClient.fromConnectionString(
    process.env.AZURE_STORAGE_CONNECTION_STRING
  );

/* ================= GENERIC UPLOAD FUNCTION ================= */
async function uploadToBlob({
  buffer,
  fileName,
  containerName,
  contentType
}) {
  try {
    const containerClient =
      blobServiceClient.getContainerClient(containerName);

    // Create container if not exists
    await containerClient.createIfNotExists();

    const blobClient =
      containerClient.getBlockBlobClient(fileName);

    // Upload file
    await blobClient.uploadData(buffer, {
      blobHTTPHeaders: {
        blobContentType: contentType
      }
    });

    // Create SAS token (read-only, 1 hour expiry)
    const credential =
      new StorageSharedKeyCredential(accountName, accountKey);

    const expiresOn = new Date(Date.now() + 60 * 60 * 1000);

    const sasToken =
      generateBlobSASQueryParameters(
        {
          containerName,
          blobName: fileName,
          permissions: BlobSASPermissions.parse("r"),
          expiresOn
        },
        credential
      ).toString();

    // Final secure URL
    return `${blobClient.url}?${sasToken}`;

  } catch (error) {
    console.error("Blob Upload Error:", error);
    throw new Error("Failed to upload to Azure Blob Storage");
  }
}

/* ================= IMAGE UPLOAD ================= */
async function uploadImage(buffer, fileName) {
  return uploadToBlob({
    buffer,
    fileName,
    containerName: "generated-images",
    contentType: "image/png"
  });
}

/* ================= VIDEO UPLOAD ================= */
async function uploadVideo(buffer, fileName) {
  return uploadToBlob({
    buffer,
    fileName,
    containerName: "generated-videos",
    contentType: "video/mp4"
  });
}

module.exports = {
  uploadImage,
  uploadVideo
};