// ── LOCAL DEVELOPMENT ONLY ────────────────────────────────────────────────────
// Copy this file to dist/runtime-config.js for local development.
// Replace the URL with your deployed API Gateway endpoint.
//
//   cp public/runtime-config.example.js dist/runtime-config.js
//
// In production, CDK injects the real runtime-config.js into the S3 bucket.
// ─────────────────────────────────────────────────────────────────────────────
window.RUNTIME_CONFIG = {
  apiUrl: 'https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com',
};
