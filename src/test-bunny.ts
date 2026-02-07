
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '../.env.test') });

async function testBunny() {
    const apiKey = process.env.BUNNY_STORAGE_API_KEY;
    const storageZone = process.env.BUNNY_STORAGE_ZONE;
    const region = process.env.BUNNY_STORAGE_REGION || '';

    console.log('--- Bunny Storage Test ---');
    console.log('API Key:', apiKey ? '***' : 'MISSING');
    console.log('Storage Zone:', storageZone);
    console.log('Region:', region || 'Main (Frankfurt)');

    if (!apiKey || !storageZone) {
        console.error('Missing credentials in .env');
        return;
    }

    const regions = ['', 'ny', 'la', 'sg', 'syd', 'uk', 'se', 'br', 'jh'];
    const filename = 'test-upload.txt';
    const content = Buffer.from('Hello from Bunny Test Script');

    for (const reg of regions) {
        const baseUrl = reg
            ? `https://${reg}.storage.bunnycdn.com`
            : 'https://storage.bunnycdn.com';

        const url = `${baseUrl}/${storageZone}/${filename}`;
        console.log(`\nTesting Region: ${reg || 'Main'} (${baseUrl})`);

        try {
            await axios.put(url, content, {
                headers: {
                    AccessKey: apiKey,
                    'Content-Type': 'text/plain',
                },
            });
            console.log('✅ Upload Success for Region:', reg || 'Main');
            // Cleanup and exit found
            try {
                await axios.delete(url, { headers: { AccessKey: apiKey } });
            } catch (e) { }
            return;
        } catch (error: any) {
            if (error.response) {
                console.log(`❌ Failed: ${error.response.status} ${error.response.data?.Message || 'Unknown Error'}`);
            } else {
                console.log('❌ Error:', error.message);
            }
        }
    }

}

testBunny();
