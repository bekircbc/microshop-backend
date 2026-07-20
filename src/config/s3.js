// src/config/s3.js
const { S3Client } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'MOCK_KEY',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'MOCK_SECRET',
  },
  // Cloudflare R2 oder MinIO endpoint
  ...(process.env.S3_ENDPOINT && { endpoint: process.env.S3_ENDPOINT }),
});

const S3_BUCKET_URL = process.env.S3_BUCKET_URL || 'https://microshop-assets.s3.amazonaws.com';

/**
 * URL will be created from imagename
 */
function getImageUrl(imageName) {
  if (!imageName) return `${S3_BUCKET_URL}/default.jpg`;
  if (imageName.startsWith('http')) return imageName; // Zaten full URL ise
  return `${S3_BUCKET_URL}/products/${imageName}`;
}

module.exports = { s3Client, getImageUrl };