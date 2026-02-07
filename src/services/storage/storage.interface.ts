export interface StorageProvider {
    upload(file: Express.Multer.File, path: string): Promise<{ url: string; key: string }>;
    uploadPublic(file: Express.Multer.File, key: string, publicBaseUrl?: string): Promise<{ url: string; key: string }>;
    uploadPrivate(file: Express.Multer.File, key: string): Promise<{ key: string }>;
    delete(key: string): Promise<void>;
    getDownloadUrl(key: string): Promise<string>; // Deprecate?
    downloadStream(key: string): Promise<NodeJS.ReadableStream>;
}
