
const { BlobServiceClient } = require("@azure/storage-blob");
require("dotenv").config();

const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING
);

async function uploadToBlob({ buffer, fileName, containerName, contentType }) {
  try {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.createIfNotExists();

    const blockBlobClient = containerClient.getBlockBlobClient(fileName);

    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: {
        blobContentType: contentType,
      },
    });

    console.log("UPLOAD SUCCESS:", fileName);

    // Return public URL (container should be set to "Blob" access level)
    return blockBlobClient.url;
  } catch (error) {
    console.error("Blob Upload Error:", error);
    return null;
  }
}

async function uploadImage(buffer, fileName) {
  return uploadToBlob({
    buffer,
    fileName,
    containerName: "generated-images",
    contentType: "image/png",
  });
}

async function uploadVideo(buffer, fileName) {
  return uploadToBlob({
    buffer,
    fileName,
    containerName: "video",
    contentType: "video/mp4",
  });
}

module.exports = {
  uploadImage,
  uploadVideo,
};