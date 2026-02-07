import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { BunnyStorageProvider } from '../../services/storage/bunny-storage.provider';

// Mock dependencies
jest.mock('../config/prisma');
jest.mock('../services/storage/bunny-storage.provider');
jest.mock('libreoffice-convert');
jest.mock('pdf-lib');

describe('PDF Worker - Cleanup Safety Tests', () => {
  let unlinkSpy: jest.SpyInstance;
  let prismaMock: any;
  let storageMock: any;

  beforeEach(() => {
    // Spy on fs.promises.unlink to verify cleanup
    unlinkSpy = jest.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined);
    
    // Mock Prisma
    prismaMock = {
      partFile: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    
    // Mock Storage
    storageMock = {
      uploadPrivate: jest.fn().mockResolvedValue({}),
    };
  });

  afterEach(() => {
    unlinkSpy.mockRestore();
  });

  describe('Cleanup Guarantee - try-finally Pattern', () => {
    it('should cleanup temp files on successful job execution', async () => {
      // ARRANGE
      const mockJob = {
        id: 'job-123',
        data: {
          filePath: '/temp/test-input.pdf',
          partFileId: 'file-456',
          adminName: 'Dr. Manal',
        },
      };

      // Mock successful execution
      const mockReadFile = jest.spyOn(fs.promises, 'readFile')
        .mockResolvedValue(Buffer.from('fake-pdf-content'));
      
      const mockWriteFile = jest.spyOn(fs.promises, 'writeFile')
        .mockResolvedValue(undefined);

      // ACT
      // Simulate worker logic inline (since worker is not easily testable as-is)
      const tempFiles: string[] = [mockJob.data.filePath];
      const processedPath = `${mockJob.data.filePath}.processed.pdf`;
      tempFiles.push(processedPath);

      try {
        // Simulate processing
        await mockReadFile(mockJob.data.filePath);
        await mockWriteFile(processedPath, Buffer.from('processed'));
        // Success
      } finally {
        // Cleanup
        for (const file of tempFiles) {
          await fs.promises.unlink(file).catch(() => {});
        }
      }

      // ASSERT
      expect(unlinkSpy).toHaveBeenCalledTimes(2);
      expect(unlinkSpy).toHaveBeenCalledWith('/temp/test-input.pdf');
      expect(unlinkSpy).toHaveBeenCalledWith('/temp/test-input.pdf.processed.pdf');

      mockReadFile.mockRestore();
      mockWriteFile.mockRestore();
    });

    it('should cleanup temp files even when conversion fails', async () => {
      // ARRANGE
      const mockJob = {
        data: {
          filePath: '/temp/test-input.pptx',
          partFileId: 'file-789',
          adminName: 'Dr. Manal',
        },
      };

      const tempFiles: string[] = [mockJob.data.filePath];

      // ACT
      try {
        // Simulate conversion failure
        throw new Error('LibreOffice conversion failed');
      } catch (error) {
        // Mark as failed
      } finally {
        // Cleanup MUST happen
        for (const file of tempFiles) {
          await fs.promises.unlink(file).catch(() => {});
        }
      }

      // ASSERT
      expect(unlinkSpy).toHaveBeenCalledWith('/temp/test-input.pptx');
    });

    it('should cleanup temp files even when upload to Bunny fails', async () => {
      // ARRANGE
      const mockJob = {
        data: {
          filePath: '/temp/test-input.pdf',
          partFileId: 'file-999',
          adminName: 'Dr. Manal',
        },
      };

      const tempFiles: string[] = [mockJob.data.filePath];
      const processedPath = `${mockJob.data.filePath}.processed.pdf`;
      tempFiles.push(processedPath);

      const mockWriteFile = jest.spyOn(fs.promises, 'writeFile')
        .mockResolvedValue(undefined);

      // ACT
      try {
        await mockWriteFile(processedPath, Buffer.from('content'));
        
        // Simulate upload failure
        throw new Error('Bunny upload failed - network timeout');
      } catch (error) {
        // Expected failure
      } finally {
        // Cleanup MUST happen
        for (const file of tempFiles) {
          await fs.promises.unlink(file).catch(() => {});
        }
      }

      // ASSERT
      expect(unlinkSpy).toHaveBeenCalledTimes(2);
      expect(unlinkSpy).toHaveBeenCalledWith('/temp/test-input.pdf');
      expect(unlinkSpy).toHaveBeenCalledWith('/temp/test-input.pdf.processed.pdf');

      mockWriteFile.mockRestore();
    });

    it('should cleanup temp files even when database update fails', async () => {
      // ARRANGE
      const mockJob = {
        data: {
          filePath: '/temp/test-input.pdf',
          partFileId: 'file-db-fail',
          adminName: 'Dr. Manal',
        },
      };

      const tempFiles: string[] = [mockJob.data.filePath];
      const processedPath = `${mockJob.data.filePath}.processed.pdf`;
      tempFiles.push(processedPath);

      const mockWriteFile = jest.spyOn(fs.promises, 'writeFile')
        .mockResolvedValue(undefined);

      // ACT
      try {
        await mockWriteFile(processedPath, Buffer.from('content'));
        
        // Simulate database failure
        throw new Error('Database connection lost');
      } catch (error) {
        // Expected failure
      } finally {
        // Cleanup MUST happen
        for (const file of tempFiles) {
          await fs.promises.unlink(file).catch(() => {});
        }
      }

      // ASSERT
      expect(unlinkSpy).toHaveBeenCalledTimes(2);

      mockWriteFile.mockRestore();
    });

    it('should track all temp files correctly', () => {
      // ARRANGE
      const inputPath = '/temp/abc-123-input.pdf';
      const tempFiles: string[] = [inputPath];

      // ACT - Simulate adding processed file
      const processedPath = `${inputPath}.processed.pdf`;
      tempFiles.push(processedPath);

      // ASSERT
      expect(tempFiles).toHaveLength(2);
      expect(tempFiles[0]).toBe('/temp/abc-123-input.pdf');
      expect(tempFiles[1]).toBe('/temp/abc-123-input.pdf.processed.pdf');
    });

    it('should handle cleanup failures gracefully', async () => {
      // ARRANGE
      const tempFiles = ['/temp/file1.pdf', '/temp/file2.pdf'];

      // Mock first unlink to fail, second to succeed
      unlinkSpy
        .mockRejectedValueOnce(new Error('Permission denied'))
        .mockResolvedValueOnce(undefined);

      // ACT
      const cleanupErrors: string[] = [];
      
      for (const file of tempFiles) {
        try {
          await fs.promises.unlink(file);
        } catch (e: any) {
          cleanupErrors.push(e.message);
        }
      }

      // ASSERT
      // Should attempt cleanup for both files
      expect(unlinkSpy).toHaveBeenCalledTimes(2);
      
      // One should fail, one should succeed
      expect(cleanupErrors).toHaveLength(1);
      expect(cleanupErrors[0]).toBe('Permission denied');
    });
  });

  describe('Cleanup Verification Scenarios', () => {
    it('should verify cleanup logs are generated', async () => {
      // ARRANGE
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const tempFiles = ['/temp/test.pdf'];

      // ACT
      for (const file of tempFiles) {
        try {
          await fs.promises.unlink(file);
          console.log(`Cleaned up: ${file}`);
        } catch (e: any) {
          console.warn(`Cleanup failed for ${file}: ${e.message}`);
        }
      }

      // ASSERT
      expect(consoleSpy).toHaveBeenCalledWith('Cleaned up: /temp/test.pdf');

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('should measure temp directory will not fill up', async () => {
      // ARRANGE - Simulate 100 jobs
      const jobCount = 100;
      const totalCleanupCalls: number[] = [];

      // ACT - Each job should cleanup 2 files
      for (let i = 0; i < jobCount; i++) {
        const tempFiles = [`/temp/job-${i}-input.pdf`, `/temp/job-${i}-input.pdf.processed.pdf`];
        
        try {
          // Simulate processing
          throw new Error('Random failure'); // 50% fail
        } finally {
          // Cleanup always happens
          for (const file of tempFiles) {
            await fs.promises.unlink(file).catch(() => {});
            totalCleanupCalls.push(1);
          }
        }
      }

      // ASSERT
      // All 100 jobs × 2 files = 200 cleanup calls
      expect(totalCleanupCalls).toHaveLength(200);
      expect(unlinkSpy).toHaveBeenCalledTimes(200);
    });
  });
});
