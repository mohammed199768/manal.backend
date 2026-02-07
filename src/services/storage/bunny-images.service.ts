import axios from 'axios';
import { AppError } from '../../utils/app-error';
import { v4 as uuidv4 } from 'uuid';

const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE;
const BUNNY_STORAGE_API_KEY = process.env.BUNNY_STORAGE_API_KEY;
const BUNNY_STORAGE_REGION = process.env.BUNNY_STORAGE_REGION; // Optional
const BUNNY_IMAGES_PULL_ZONE_URL = process.env.BUNNY_IMAGES_PULL_ZONE_URL?.replace(/\/$/, ''); // Remove trailing slash if present

if (!BUNNY_STORAGE_ZONE || !BUNNY_STORAGE_API_KEY || !BUNNY_IMAGES_PULL_ZONE_URL) {
    console.error('Missing Bunny Storage configuration env vars');
}

/**
 * Builds the Bunny Storage endpoint URL
 */
function buildBunnyStorageEndpoint(key: string): string {
    // Normalize key to not start with slash
    const normalizedKey = key.startsWith('/') ? key.slice(1) : key;

    if (BUNNY_STORAGE_REGION) {
        return `https://${BUNNY_STORAGE_REGION}.storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}/${normalizedKey}`;
    }
    return `https://storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}/${normalizedKey}`;
}

/**
 * Uploads a buffer to Bunny Storage
 */
export async function uploadToBunnyStorage(
    buffer: Buffer,
    contentType: string,
    storageKey: string
): Promise<void> {
    const endpoint = buildBunnyStorageEndpoint(storageKey);

    try {
        await axios.put(endpoint, buffer, {
            headers: {
                'AccessKey': BUNNY_STORAGE_API_KEY,
                'Content-Type': contentType,
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
        });
    } catch (error: any) {
        console.error('Bunny Storage Upload Error:', error.message);
        throw new AppError('Failed to upload image to storage', 500);
    }
}

/**
 * Deletes a file from Bunny Storage
 */
export async function deleteFromBunnyStorage(storageKey: string): Promise<void> {
    const endpoint = buildBunnyStorageEndpoint(storageKey);

    try {
        await axios.delete(endpoint, {
            headers: {
                'AccessKey': BUNNY_STORAGE_API_KEY,
            },
        });
    } catch (error: any) {
        // If 404, file already gone, consider success
        if (error.response?.status === 404) {
            return;
        }
        console.error('Bunny Storage Delete Error:', error.message);
        // We do not throw here to allow "best effort" deletion without breaking the main flow
    }
}

/**
 * Converts a storage key to a public Pull Zone URL
 */
export function toPublicCdnUrl(storageKey: string): string {
    const normalizedKey = storageKey.startsWith('/') ? storageKey.slice(1) : storageKey;
    return `${BUNNY_IMAGES_PULL_ZONE_URL}/${normalizedKey}`;
}

/**
 * Extracts the storage key from a full Pull Zone URL
 * Returns null if the URL does not belong to our Pull Zone
 */
export function extractStorageKeyFromLogoUrl(logoUrl: string): string | null {
    if (!logoUrl || !logoUrl.startsWith(BUNNY_IMAGES_PULL_ZONE_URL!)) {
        return null;
    }

    // "https://cdn.example.com/universities/logos/abc.jpg"
    // -> "/universities/logos/abc.jpg"
    let path = logoUrl.replace(BUNNY_IMAGES_PULL_ZONE_URL!, '');
    if (path.startsWith('/')) {
        path = path.slice(1);
    }

    return path || null;
}
