import { AuthService } from '../auth.service';
import { prismaMock } from '../../../__tests__/setup';
import { AppError } from '../../../utils/app-error';

// Mock bcryptjs
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn().mockResolvedValue(true),
}));

// Mock email service
jest.mock('../../../services/email/email.service', () => ({
  emailService: {
    sendVerificationCode: jest.fn().mockResolvedValue(true),
  },
}));

describe('AuthService - Username Generation Tests', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
  });

  describe('generateUsername - Random Suffix Implementation', () => {
    it('should generate username with 4-digit random suffix', async () => {
      // ARRANGE
      const email = 'john.doe@example.com';
      
      // Mock: No existing user (unique username)
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.findFirst.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        id: 'user-123',
        email,
        username: 'johndoe1234',
        role: 'STUDENT',
      } as any);
      prismaMock.verificationCode.deleteMany.mockResolvedValue({ count: 0 });
      prismaMock.verificationCode.create.mockResolvedValue({} as any);

      // ACT
      const result = await authService.register({
        email,
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '1234567890',
      });

      // ASSERT
      const createdUser = prismaMock.user.create.mock.calls[0][0].data;
      const username = createdUser.username;

      // Verify format: prefix + 4 digits
      expect(username).toMatch(/^[a-z0-9.]+\d{4}$/);
      
      // Verify suffix is exactly 4 digits
      const suffix = username.slice(-4);
      expect(suffix).toHaveLength(4);
      expect(suffix).toMatch(/^\d{4}$/);
    });

    it('should generate username with zero-padded suffix (e.g., 0042)', async () => {
      // ARRANGE
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.findFirst.mockResolvedValue(null);
      
      // Spy on Math.random to control suffix generation
      const originalRandom = Math.random;
      Math.random = jest.fn().mockReturnValue(0.0042); // Should produce '0042'

      prismaMock.user.create.mockResolvedValue({
        id: 'user-123',
        username: 'testuser0042',
      } as any);
      prismaMock.verificationCode.deleteMany.mockResolvedValue({ count: 0 });
      prismaMock.verificationCode.create.mockResolvedValue({} as any);

      // ACT
      await authService.register({
        email: 'test@example.com',
        password: 'password',
        firstName: 'Test',
        lastName: 'User',
        phoneNumber: '123',
      });

      // ASSERT
      const username = prismaMock.user.create.mock.calls[0][0].data.username;
      expect(username).toContain('0042');

      // Restore Math.random
      Math.random = originalRandom;
    });

    it('should call prisma.user.findUnique exactly ONCE (no while loop)', async () => {
      // ARRANGE
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.findFirst.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({
        id: 'user-123',
      } as any);
      prismaMock.verificationCode.deleteMany.mockResolvedValue({ count: 0 });
      prismaMock.verificationCode.create.mockResolvedValue({} as any);

      // ACT
      await authService.register({
        email: 'unique@example.com',
        password: 'password',
        firstName: 'Unique',
        lastName: 'User',
        phoneNumber: '123',
      });

      // ASSERT - Critical: Should call findUnique exactly once for username check
      // The other findUnique call is for checking email existence
      const findUniqueCalls = prismaMock.user.findUnique.mock.calls;
      
      // First call: check email
      expect(findUniqueCalls[0][0].where).toHaveProperty('email');
      
      // Second call: check username uniqueness (should be ONLY ONE)
      const usernameChecks = findUniqueCalls.filter(
        call => call[0].where.hasOwnProperty('username')
      );
      expect(usernameChecks).toHaveLength(1);
    });

    it('should throw AppError 500 on username collision (fail-fast)', async () => {
      // ARRANGE
      prismaMock.user.findFirst.mockResolvedValue(null); // Email check passes
      
      // First findUnique for email check
      prismaMock.user.findUnique
        .mockResolvedValueOnce(null) // Email doesn't exist (good)
        .mockResolvedValueOnce({     // Username collision!
          id: 'existing-user',
          username: 'john1234',
        } as any);

      // ACT & ASSERT
      await expect(
        authService.register({
          email: 'john@example.com',
          password: 'password',
          firstName: 'John',
          lastName: 'Doe',
          phoneNumber: '123',
        })
      ).rejects.toThrow('Username generation collision');

      await expect(
        authService.register({
          email: 'john@example.com',
          password: 'password',
          firstName: 'John',
          lastName: 'Doe',
          phoneNumber: '123',
        })
      ).rejects.toThrow(AppError);
    });

    it('should sanitize email prefix correctly', async () => {
      // ARRANGE
      const specialEmail = 'john+test@example.com';
      
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.findFirst.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue({ id: 'user-123' } as any);
      prismaMock.verificationCode.deleteMany.mockResolvedValue({ count: 0 });
      prismaMock.verificationCode.create.mockResolvedValue({} as any);

      // ACT
      await authService.register({
        email: specialEmail,
        password: 'password',
        firstName: 'John',
        lastName: 'Test',
        phoneNumber: '123',
      });

      // ASSERT
      const username = prismaMock.user.create.mock.calls[0][0].data.username;
      
      // '+' should be removed (only alphanumeric and dots allowed)
      expect(username).not.toContain('+');
      expect(username).toMatch(/^[a-z0-9.]+\d{4}$/);
    });
  });

  describe('Performance - No Database Hammering', () => {
    it('should not retry in a loop on collision', async () => {
      // ARRANGE
      prismaMock.user.findFirst.mockResolvedValue(null);
      prismaMock.user.findUnique
        .mockResolvedValueOnce(null)  // Email check
        .mockResolvedValueOnce({ id: 'collision' } as any); // Username collision

      const startTime = Date.now();

      // ACT
      try {
        await authService.register({
          email: 'test@example.com',
          password: 'password',
          firstName: 'Test',
          lastName: 'User',
          phoneNumber: '123',
        });
      } catch (error) {
        // Expected to fail
      }

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // ASSERT
      // Should complete almost instantly (< 50ms)
      // vs. old while loop which could take 100ms+ with retries
      expect(executionTime).toBeLessThan(50);
      
      // Should not have multiple username check attempts
      const usernameChecks = prismaMock.user.findUnique.mock.calls.filter(
        call => call[0].where.hasOwnProperty('username')
      );
      expect(usernameChecks.length).toBe(1);
    });
  });
});
