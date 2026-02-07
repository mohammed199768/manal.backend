import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';

// Mock Prisma Client globally
jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: mockDeep<PrismaClient>(),
}));

// Reset mocks before each test
beforeEach(() => {
  mockReset(prismaMock);
});

// Export typed mock for use in tests
import prisma from '../config/prisma';
export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;
