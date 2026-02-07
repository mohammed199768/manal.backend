
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

// Load .env
const envPath = path.join(__dirname, '../.env');
dotenv.config({ path: envPath });

console.log('--- Bunny.net Diagnostic ---');
console.log('Loaded .env from:', envPath);

const ZONE = process.env.BUNNY_STORAGE_ZONE;
const KEY = process.env.BUNNY_STORAGE_API_KEY;
const REGION = process.env.BUNNY_STORAGE_REGION;

console.log('Zone:', ZONE);
console.log('Key:', KEY ? `${KEY.substring(0, 5)}...` : 'MISSING');
console.log('Region:', REGION || 'Main (Frankfurt)');

if (!ZONE || !KEY) {
    console.error('CRITICAL: Missing configuration variables.');
    process.exit(1);
}

const regions = [
    { code: '', name: 'Frankfurt (Main)', url: 'https://storage.bunnycdn.com' },
    { code: 'ny', name: 'New York', url: 'https://ny.storage.bunnycdn.com' },
    { code: 'la', name: 'Los Angeles', url: 'https://la.storage.bunnycdn.com' },
    { code: 'sg', name: 'Singapore', url: 'https://sg.storage.bunnycdn.com' },
    { code: 'syd', name: 'Sydney', url: 'https://syd.storage.bunnycdn.com' },
    { code: 'uk', name: 'London', url: 'https://uk.storage.bunnycdn.com' },
];

async function check() {
    console.log('\n--- Connectivity Test ---');

    for (const r of regions) {
        // We will try to upload a tiny file
        const targetUrl = `${r.url}/${ZONE}/connectivity-test.txt`;
        console.log(`\nTesting: ${r.name} (${r.url})`);

        try {
            await axios.put(targetUrl, 'ok', {
                headers: {
                    AccessKey: KEY,
                    'Content-Type': 'text/plain'
                },
                timeout: 5000
            });
            console.log('✅ SUCCESS! Connected to this region.');

            // Cleanup
            try {
                await axios.delete(targetUrl, { headers: { AccessKey: KEY } });
                console.log('   (Cleanup successful)');
            } catch (e) {
                console.log('   (Cleanup failed)');
            }
            return; // Exit on first success
        } catch (error: any) {
            if (error.response) {
                console.log(`❌ FAILED: Status ${error.response.status} - ${error.response.statusText}`);
                if (error.response.data) console.log('   Response:', JSON.stringify(error.response.data));
            } else if (error.request) {
                console.log('❌ FAILED: No response received (Timeout/Network)');
            } else {
                console.log('❌ FAILED: Error setting up request', error.message);
            }
        }
    }
    console.log('\n--- DIAGNOSIS ---');
    console.log('All regions failed.');
    console.log('Most likely cause: INCORRECT PASSWORD or ZONE NAME.');
    console.log('Please verify in Bunny Dashboard > Storage > [Your Zone] > FTP & API Access.');
}

check();
