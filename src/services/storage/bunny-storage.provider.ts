import axios from 'axios';
import { StorageProvider } from './storage.interface';
import { AppError } from '../../utils/app-error';

export class BunnyStorageProvider implements StorageProvider {
    private apiKey: string;
    private storageZone: string;
    private baseUrl: string;
    private pullZoneUrl: string;

    constructor() {
        this.apiKey = process.env.BUNNY_STORAGE_API_KEY || '';
        this.storageZone = process.env.BUNNY_STORAGE_ZONE || '';
        this.pullZoneUrl = process.env.BUNNY_ASSETS_CDN_BASE_URL || '';

        const region = process.env.BUNNY_STORAGE_REGION || '';
        this.baseUrl = region
            ? `https://${region}.storage.bunnycdn.com`
            : 'https://storage.bunnycdn.com';

        if (!this.apiKey || !this.storageZone) {
            throw new AppError('Bunny Storage is not properly configured. Missing credentials.', 500);
        }
    }

    private async _putFile(file: Express.Multer.File, path: string): Promise<string> {
        if (!this.apiKey || !this.storageZone) {
            throw new AppError('Storage not configured', 500);
        }

        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        const normalizedKey = `${this.storageZone}${cleanPath}`;
        const url = `${this.baseUrl}/${normalizedKey}`;

        try {
            console.log(`[Bunny] PUT to: ${url}`);
            await axios.put(url, file.buffer, {
                headers: {
                    AccessKey: this.apiKey,
                    'Content-Type': file.mimetype || 'application/octet-stream',
                },
            });
            console.log(`[Bunny] Upload success for: ${cleanPath}`);
            return cleanPath;
        } catch (error: any) {
            console.error('[Bunny] Upload Error Details:', {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                url: url
            });
            throw new AppError(`File upload failed: ${error.response?.data?.Message || error.message}`, 502);
        }
    }

    async upload(file: Express.Multer.File, path: string): Promise<{ url: string; key: string }> {
        // Legacy wrapper
        const key = await this._putFile(file, path);
        return {
            url: `${this.pullZoneUrl}${key}`,
            key,
        };
    }

    async uploadPublic(file: Express.Multer.File, path: string, publicBaseUrl?: string): Promise<{ url: string; key: string }> {
        const baseUrl = publicBaseUrl || process.env.BUNNY_IMAGES_PULL_ZONE_URL || process.env.BUNNY_ASSETS_CDN_BASE_URL;
        if (!baseUrl) {
            throw new AppError('Images CDN not configured (BUNNY_ASSETS_CDN_BASE_URL missing)', 500);
        }

        const key = await this._putFile(file, path);
        // Ensure strictly no double slashes if baseUrl has trailing slash
        const safeBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        return {
            url: `${safeBase}${key}`,
            key,
        };
    }

    async uploadPrivate(file: Express.Multer.File, path: string): Promise<{ key: string }> {
        const key = await this._putFile(file, path);
        return { key };
    }

    async delete(key: string): Promise<void> {
        if (!this.apiKey || !this.storageZone) {
            throw new AppError('Storage not configured', 500);
        }

        const cleanPath = key.startsWith('/') ? key : `/${key}`;
        const normalizedKey = `${this.storageZone}${cleanPath}`;
        const url = `${this.baseUrl}/${normalizedKey}`;

        try {
            await axios.delete(url, {
                headers: { AccessKey: this.apiKey },
            });
            console.log(`[Bunny] Delete success for: ${cleanPath}`);
        } catch (error: any) {
            // Bunny returns non-2xx for missing keys; caller can decide how to handle.
            throw new AppError(`File delete failed: ${error.response?.data?.Message || error.message}`, 502);
        }
    }

    async getDownloadUrl(key: string): Promise<string> {
        return `${this.pullZoneUrl}${key}`;
    }

    async downloadStream(key: string): Promise<NodeJS.ReadableStream> {
        if (!this.apiKey || !this.storageZone) {
            throw new AppError('Storage not configured', 500);
        }

        const normalizedKey = `${this.storageZone}${key.startsWith('/') ? key : '/' + key}`;
        const url = `${this.baseUrl}/${normalizedKey}`;

        try {
            const response = await axios.get(url, {
                headers: { AccessKey: this.apiKey },
                responseType: 'stream',
            });
            return response.data;
        } catch (error) {
            throw new AppError('File not found', 404);
        }
    }
}
