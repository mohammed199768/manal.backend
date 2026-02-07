export function validateBunnyEnv() {
    const requiredVars = [
        'BUNNY_STORAGE_ZONE',
        'BUNNY_STORAGE_API_KEY',
        'BUNNY_ASSETS_CDN_BASE_URL',
        'BUNNY_STREAM_LIBRARY_ID',
        'BUNNY_STREAM_API_KEY',
        'BUNNY_STREAM_TOKEN_KEY'
    ];

    const missing = requiredVars.filter(v => !process.env[v]);

    if (missing.length > 0) {
        console.error('\n❌ CRITICAL ERROR: Missing Required Bunny.net Environment Variables');
        console.error('The following environment variables must be defined in .env:');
        missing.forEach(v => console.error(`   - ${v}`));
        console.error('\nAborting startup to prevent security risks or service failure.\n');
        process.exit(1);
    }
}
