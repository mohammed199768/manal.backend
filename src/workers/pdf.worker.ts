import { Worker, Job } from 'bullmq';
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { BunnyStorageProvider as StorageService } from '../services/storage/bunny-storage.provider';
import { AppError } from '../utils/app-error';
import libre from 'libreoffice-convert';
import util from 'util';
import IORedis from 'ioredis';

const convertAsync = util.promisify(libre.convert);

const prisma = new PrismaClient();
const storageService = new StorageService();

interface PdfJobData {
  filePath: string;
  partFileId: string;
  adminName: string;
}

// Support Railway REDIS_URL with TLS (rediss://)
const connection = process.env.REDIS_URL
  ? new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      tls: process.env.REDIS_URL.startsWith('rediss://') ? {} : undefined,
    })
  : new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: null,
    });

export const pdfWorker = new Worker<PdfJobData>(
  'pdf-processing',
  async (job: Job<PdfJobData>) => {
    const { filePath, partFileId, adminName } = job.data;
    console.log(`[PDF Worker] Processing job ${job.id} for PartFile ${partFileId}`);

    // RELIABILITY FIX: Track all temp files for guaranteed cleanup (Fix #4)
    const tempFiles: string[] = [filePath]; // Track input file
    
    // Smoke Test: Check LibreOffice Availability
    try {
        const { execSync } = require('child_process');
        // Try soffice or libreoffice
        try {
            const version = execSync('soffice --version', { encoding: 'utf8' }).trim();
            console.log(`[PDF Worker] LibreOffice Check: Detected (${version})`);
        } catch (e) {
            console.warn(`[PDF Worker] LibreOffice Check: 'soffice' command failed. Trying default path...`);
        }
    } catch(err) {
        console.warn(`[PDF Worker] LibreOffice Check: Failed to execute smoke test.`);
    }

    try {
      console.log(`[PDF Worker] Step 1: Updating status to PROCESSING for ${partFileId}`);
      await prisma.partFile.update({
        where: { id: partFileId },
        data: { renderStatus: 'PROCESSING' },
      });

      // 2. Normalize to PDF (Universal Doc Support)
      let pdfBytes: Buffer;
      const ext = path.extname(filePath).toLowerCase();
      
      console.log(`[PDF Worker] Step 2: Normalization. Extension: ${ext}`);

      if (ext !== '.pdf') {
          console.log(`[PDF Worker] Converting ${ext} to PDF using libreoffice...`);
          const inputBuffer = await fs.promises.readFile(filePath);
          // Convert to PDF format ('pdf' identifier)
          pdfBytes = await convertAsync(inputBuffer, 'pdf', undefined);
          console.log(`[PDF Worker] Conversion successful. New Buffer Size: ${pdfBytes.length}`);
      } else {
          console.log(`[PDF Worker] File is already PDF. Reading direct.`);
          pdfBytes = await fs.promises.readFile(filePath);
      }

      // 3. Load PDF for Watermarking
      console.log(`[PDF Worker] Step 3: Loading PDF Document for Watermarking...`);
      const pdfDoc = await PDFDocument.load(pdfBytes);

      // 4. Watermark Pages
      const pages = pdfDoc.getPages();
      const watermarkText = adminName || 'Dr. Manal';
      console.log(`[PDF Worker] Step 4: Applying Watermark '${watermarkText}' to ${pages.length} pages...`);

      pages.forEach((page) => {
        const { width, height } = page.getSize();
        page.drawText(watermarkText, {
          x: width / 2 - 100, // Approximate centering
          y: height / 2,
          size: 50,
          color: rgb(0.8, 0.8, 0.8), // Light gray
          opacity: 0.3,
          rotate: degrees(45),
        });
      });

      // 5. Save Processed PDF (Watermarked)
      console.log(`[PDF Worker] Step 5: Saving Watermarked PDF to temp...`);
      const watermarkedPdfBytes = await pdfDoc.save();
      
      const tempProcessedPath = filePath + '.processed.pdf';
      tempFiles.push(tempProcessedPath); // Track processed file
      
      await fs.promises.writeFile(tempProcessedPath, watermarkedPdfBytes);
      console.log(`[PDF Worker] Temp file written to: ${tempProcessedPath}`);
      
      const processedPdfBytes = await fs.promises.readFile(tempProcessedPath);
      
      // Mock Multer File for the provider
      const filePayload: any = {
        buffer: processedPdfBytes,
        mimetype: 'application/pdf',
        originalname: `${partFileId}.pdf`
      };

      // 6. Upload to Bunny (Secure/Private Zone)
      const destinationPath = `/secured/${partFileId}.pdf`; 
      console.log(`[PDF Worker] Step 6: Uploading to Bunny Storage at ${destinationPath}...`);
      await storageService.uploadPrivate(filePayload, destinationPath);
      console.log(`[PDF Worker] Upload successful.`);

      // 7. Update DB Status
      console.log(`[PDF Worker] Step 7: Updating DB Record to COMPLETED...`);
      await prisma.partFile.update({
        where: { id: partFileId },
        data: { 
          renderStatus: 'COMPLETED',
          storageKey: destinationPath,
          title: path.basename(filePath, ext) + '.pdf', // Optional: Update title logic or keep original? Keeping original but updating key.
          pageCount: pages.length // FIX: Phase 10-FINAL - Ensure page count is saved
        },
      });

      console.log(`[PDF Worker] Job ${job.id} completed successfully.`);

    } catch (error: any) {
      console.error(`[PDF Worker] CRITICAL ERROR Job ${job.id}:`, error);
      
      try {
          await prisma.partFile.update({
            where: { id: partFileId },
            data: { renderStatus: 'FAILED' },
          });
          console.log(`[PDF Worker] Marked Job ${job.id} as FAILED in DB.`);
      } catch (dbError) {
          console.error(`[PDF Worker] FAILED TO UPDATE DB STATUS:`, dbError);
      }

      throw error;
    } finally {
      // RELIABILITY FIX: Guaranteed cleanup (Fix #4)
      console.log(`[PDF Worker] Step 8: Cleanup temp files... (${tempFiles.length} files)`);
      for (const file of tempFiles) {
        try {
          await fs.promises.unlink(file);
          console.log(`[PDF Worker] Cleaned up: ${file}`);
        } catch (e: any) {
          console.warn(`[PDF Worker] Cleanup failed for ${file}: ${e.message}`);
        }
      }
    }
  },
  { connection }
);

console.log('[PDF Worker] Worker Service Initialized and Listening...');

pdfWorker.on('completed', (job) => {
  console.log(`[PDF Worker] Job ${job.id} has completed!`);
});

pdfWorker.on('failed', (job, err) => {
  console.error(`[PDF Worker] Job ${job?.id} has failed with ${err.message}`);
});
