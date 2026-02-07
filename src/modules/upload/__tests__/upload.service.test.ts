import { UploadService } from '../upload.service';
import { prismaMock } from '../../../__tests__/setup';
import { AppError } from '../../../utils/app-error';
import { BunnyStorageProvider } from '../../../services/storage/bunny-storage.provider';

// Mock BunnyStorageProvider
jest.mock('../../../services/storage/bunny-storage.provider');

describe('UploadService - PDF Access Guard Tests', () => {
  let uploadService: UploadService;
  let mockStorage: jest.Mocked<BunnyStorageProvider>;

  beforeEach(() => {
    uploadService = new UploadService();
    mockStorage = new BunnyStorageProvider() as jest.Mocked<BunnyStorageProvider>;
  });

  describe('getSecurePdf', () => {
    it('should throw 403 when EnrollmentPartLock is active (isLocked: true)', async () => {
      // ARRANGE
      const userId = 'student-123';
      const assetId = 'asset-456';

      // Mock PartFile lookup
      prismaMock.partFile.findUnique.mockResolvedValue({
        id: assetId,
        partId: 'part-789',
        title: 'Test PDF',
        displayName: 'Test Document.pdf',
        type: 'PDF',
        storageKey: '/secured/test.pdf',
        renderStatus: 'COMPLETED',
        pageCount: 10,
        order: 1,
        isSecure: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        part: {
          id: 'part-789',
          lectureId: 'lecture-001',
          title: 'Part 1',
          order: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          lecture: {
            id: 'lecture-001',
            courseId: 'course-001',
            title: 'Lecture 1',
            order: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            course: {
              id: 'course-001',
              title: 'Test Course',
              instructorId: 'instructor-999',
              isFree: false,
              isPublished: true,
              slug: 'test-course',
              price: 100,
              subjectId: 'subject-1',
              createdAt: new Date(),
              updatedAt: new Date(),
              description: null,
              thumbnail: null,
            },
          },
        },
      } as any);

      // Mock Enrollment lookup
      prismaMock.enrollment.findUnique.mockResolvedValue({
        id: 'enrollment-123',
        userId,
        courseId: 'course-001',
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      // Mock User lookup (student role)
      prismaMock.user.findUnique.mockResolvedValue({
        id: userId,
        role: 'STUDENT',
        email: 'student@test.com',
        username: 'student123',
        firstName: 'Test',
        lastName: 'Student',
        createdAt: new Date(),
        updatedAt: new Date(),
        password: 'hashed',
        avatar: null,
        phoneNumber: null,
        emailVerifiedAt: null,
        refreshToken: null,
      } as any);

      // Mock ACTIVE LOCK (Critical test case)
      prismaMock.enrollmentPartLock.findUnique.mockResolvedValue({
        enrollmentId: 'enrollment-123',
        partId: 'part-789',
        isLocked: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      // ACT & ASSERT
      await expect(uploadService.getSecurePdf(userId, assetId)).rejects.toThrow(
        'This content is currently locked by the administrator.'
      );

      await expect(uploadService.getSecurePdf(userId, assetId)).rejects.toThrow(AppError);
    });

    it('should return PDF stream when NO lock exists', async () => {
      // ARRANGE
      const userId = 'student-123';
      const assetId = 'asset-456';

      // Mock PartFile
      prismaMock.partFile.findUnique.mockResolvedValue({
        id: assetId,
        partId: 'part-789',
        storageKey: '/secured/test.pdf',
        renderStatus: 'COMPLETED',
        displayName: 'Test.pdf',
        part: {
          lecture: {
            course: {
              id: 'course-001',
              instructorId: 'instructor-999',
              isFree: false,
              isPublished: true,
            },
          },
        },
      } as any);

      // Mock Enrollment
      prismaMock.enrollment.findUnique.mockResolvedValue({
        id: 'enrollment-123',
        userId,
        courseId: 'course-001',
        status: 'ACTIVE',
      } as any);

      // Mock User
      prismaMock.user.findUnique.mockResolvedValue({
        id: userId,
        role: 'STUDENT',
      } as any);

      // Mock NO LOCK (returns null)
      prismaMock.enrollmentPartLock.findUnique.mockResolvedValue(null);

      // Mock storage stream
      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn(),
      };

      jest.spyOn(BunnyStorageProvider.prototype, 'downloadStream').mockResolvedValue(mockStream as any);

      // ACT
      const result = await uploadService.getSecurePdf(userId, assetId);

      // ASSERT
      expect(result).toBeDefined();
      expect(result.stream).toBe(mockStream);
      expect(result.contentType).toBe('application/pdf');
      expect(result.filename).toBe('Test.pdf');
    });

    it('should allow access for instructor even with lock', async () => {
      // ARRANGE
      const instructorId = 'instructor-999';
      const assetId = 'asset-456';

      prismaMock.partFile.findUnique.mockResolvedValue({
        id: assetId,
        partId: 'part-789',
        storageKey: '/secured/test.pdf',
        renderStatus: 'COMPLETED',
        displayName: 'Test.pdf',
        part: {
          lecture: {
            course: {
              id: 'course-001',
              instructorId: 'instructor-999',
              isFree: false,
              isPublished: true,
            },
          },
        },
      } as any);

      prismaMock.enrollment.findUnique.mockResolvedValue(null); // No enrollment

      prismaMock.user.findUnique.mockResolvedValue({
        id: instructorId,
        role: 'INSTRUCTOR',
      } as any);

      const mockStream = { pipe: jest.fn(), on: jest.fn() };
      jest.spyOn(BunnyStorageProvider.prototype, 'downloadStream').mockResolvedValue(mockStream as any);

      // ACT
      const result = await uploadService.getSecurePdf(instructorId, assetId);

      // ASSERT
      expect(result).toBeDefined();
      expect(prismaMock.enrollmentPartLock.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('getRenderedPage', () => {
    it('should throw 403 when lock is active for page rendering', async () => {
      // ARRANGE
      const userId = 'student-123';
      const partFileId = 'file-456';
      const pageNumber = 1;

      prismaMock.partFile.findUnique.mockResolvedValue({
        id: partFileId,
        partId: 'part-789',
        pageCount: 10,
        storageKey: '/secured/test',
        part: {
          lecture: {
            course: {
              id: 'course-001',
              instructorId: 'instructor-999',
              isFree: false,
              isPublished: true,
            },
          },
        },
      } as any);

      prismaMock.enrollment.findUnique.mockResolvedValue({
        id: 'enrollment-123',
        userId,
        courseId: 'course-001',
        status: 'ACTIVE',
      } as any);

      prismaMock.user.findUnique.mockResolvedValue({
        id: userId,
        role: 'STUDENT',
      } as any);

      // LOCK EXISTS
      prismaMock.enrollmentPartLock.findUnique.mockResolvedValue({
        enrollmentId: 'enrollment-123',
        partId: 'part-789',
        isLocked: true,
      } as any);

      // ACT & ASSERT
      await expect(uploadService.getRenderedPage(userId, partFileId, pageNumber)).rejects.toThrow(
        'This content is currently locked'
      );
    });
  });
});
