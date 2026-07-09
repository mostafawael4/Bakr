/**
 * One-time script to configure CORS on the B2 bucket via B2 Native API.
 * This sets CORS rules that include s3_put for direct browser uploads.
 * Run: node setup-cors.js
 */
import 'dotenv/config';

const B2_KEY_ID = process.env.B2_KEY_ID;
const B2_APP_KEY = process.env.B2_APP_KEY;
const B2_BUCKET_ID = process.env.B2_BUCKET_ID;

async function main() {
  try {
    // Step 1: Authorize with B2
    console.log('Authorizing with B2...');
    const authResponse = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${B2_KEY_ID}:${B2_APP_KEY}`).toString('base64'),
      },
    });

    if (!authResponse.ok) {
      throw new Error(`Auth failed: ${authResponse.status} ${await authResponse.text()}`);
    }

    const authData = await authResponse.json();
    const { apiUrl, authorizationToken } = authData;
    console.log('✅ Authorized successfully');

    // Step 2: Update bucket CORS rules
    console.log('Updating CORS rules...');
    const updateResponse = await fetch(`${apiUrl}/b2api/v2/b2_update_bucket`, {
      method: 'POST',
      headers: {
        Authorization: authorizationToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accountId: authData.accountId,
        bucketId: B2_BUCKET_ID,
        corsRules: [
          {
            corsRuleName: 'allowBrowserUploads',
            allowedOrigins: ['*'],
            allowedOperations: ['s3_put', 's3_get', 's3_head', 's3_post', 's3_delete'],
            allowedHeaders: ['*'],
            exposeHeaders: ['ETag', 'x-amz-request-id'],
            maxAgeSeconds: 3600,
          },
        ],
      }),
    });

    if (!updateResponse.ok) {
      throw new Error(`Update failed: ${updateResponse.status} ${await updateResponse.text()}`);
    }

    const result = await updateResponse.json();
    console.log('✅ CORS rules updated successfully!');
    console.log('Bucket:', result.bucketName);
    console.log('CORS Rules:', JSON.stringify(result.corsRules, null, 2));
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

main();
