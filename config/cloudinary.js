const { v2: cloudinary } = require('cloudinary');
const cloudUrl = process.env.CLOUDINARY_URL;
let credentials = {};
if (cloudUrl) {
  const parsed = new URL(cloudUrl);
  credentials = { cloud_name: parsed.hostname, api_key: decodeURIComponent(parsed.username), api_secret: decodeURIComponent(parsed.password) };
} else {
  credentials = { cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET };
}
cloudinary.config(credentials);
module.exports = cloudinary;
