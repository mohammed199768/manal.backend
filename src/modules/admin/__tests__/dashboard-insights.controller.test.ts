import { DashboardInsightsController } from '../dashboard-insights.controller';
import { prismaMock } from '../../../__tests__/setup';
import { Request, Response } from 'express';

describe('DashboardInsightsController - N+1 Query Optimization Tests', () => {
  let controller: DashboardInsightsController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    controller = new DashboardInsightsController();
    
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    
    mockRequest = {};
    mockResponse = {
      status: statusMock,
      json: jsonMock,
    };
  });

  describe('getInsights - N+1 Elimination', () => {
    it('should call prisma.partProgress.groupBy exactly ONCE (not N times)', async () => {
      // ARRANGE
      const mockStudents = Array.from({ length: 10 }, (_, i) => ({
        id: `student-${i}`,
        firstName: `Student`,
        lastName: `${i}`,
        role: 'STUDENT',
        enrollments: [
          {
            courseId: `course-${i}`,
            course: {
              lectures: [
                {
                  parts: [
                    { id: `part-${i}-1` },
                    { id: `part-${i}-2` },
                  ],
                },
              ],
            },
          },
        ],
      }));

      // Mock user.findMany
      prismaMock.user.findMany.mockResolvedValue(mockStudents as any);

      // Mock groupBy (SINGLE CALL EXPECTED)
      prismaMock.partProgress.groupBy.mockResolvedValue([
        { userId: 'student-0', _count: { id: 5 } },
        { userId: 'student-1', _count: { id: 8 } },
        { userId: 'student-2', _count: { id: 3 } },
      ] as any);

      // Mock other queries
      prismaMock.paymentRecord.groupBy.mockResolvedValue([]);
      prismaMock.user.findFirst.mockResolvedValue(null);

      // ACT
      await controller.getInsights(mockRequest as Request, mockResponse as Response);

      // ASSERT - Critical: groupBy called exactly ONCE, not 10 times
      expect(prismaMock.partProgress.groupBy).toHaveBeenCalledTimes(1);
      expect(prismaMock.partProgress.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['userId'],
          where: expect.objectContaining({
            userId: { in: expect.any(Array) },
            isVideoCompleted: true,
          }),
          _count: { id: true },
        })
      );

      // Verify no individual count() calls
      expect(prismaMock.partProgress.count).not.toHaveBeenCalled();
    });

    it('should calculate engagement score correctly', async () => {
      // ARRANGE
      const mockStudent = {
        id: 'student-123',
        firstName: 'John',
        lastName: 'Doe',
        role: 'STUDENT',
        enrollments: [
          {
            courseId: 'course-1',
            course: {
              lectures: [
                {
                  parts: [
                    { id: 'part-1' },
                    { id: 'part-2' },
                    { id: 'part-3' },
                    { id: 'part-4' },
                  ],
                },
              ],
            },
          },
          {
            courseId: 'course-2',
            course: {
              lectures: [
                {
                  parts: [
                    { id: 'part-5' },
                    { id: 'part-6' },
                  ],
                },
              ],
            },
          },
        ],
      };

      prismaMock.user.findMany.mockResolvedValue([mockStudent] as any);
      
      // Student completed 3 out of 6 parts = 50%
      prismaMock.partProgress.groupBy.mockResolvedValue([
        { userId: 'student-123', _count: { id: 3 } },
      ] as any);

      prismaMock.paymentRecord.groupBy.mockResolvedValue([]);
      prismaMock.user.findFirst.mockResolvedValue(null);

      // ACT
      await controller.getInsights(mockRequest as Request, mockResponse as Response);

      // ASSERT
      expect(jsonMock).toHaveBeenCalled();
      const response = jsonMock.mock.calls[0][0];
      
      // purchasedCoursesCount = 2 courses
      // avgCompletionPercentage = 3/6 * 100 = 50%
      // engagementScore = 2 * 100 + 50 = 250
      expect(response.data.topEngagedStudents[0]).toMatchObject({
        userId: 'student-123',
        fullName: 'John Doe',
        purchasedCoursesCount: 2,
        avgCompletionPercentage: 50,
        engagementScore: 250,
      });
    });

    it('should return top 3 students sorted by engagement score descending', async () => {
      // ARRANGE
      const mockStudents = [
        {
          id: 'student-1',
          firstName: 'Low',
          lastName: 'Scorer',
          enrollments: [{ courseId: 'c1', course: { lectures: [{ parts: [{ id: 'p1' }] }] } }],
        },
        {
          id: 'student-2',
          firstName: 'High',
          lastName: 'Scorer',
          enrollments: [
            { courseId: 'c1', course: { lectures: [{ parts: [{ id: 'p1' }] }] } },
            { courseId: 'c2', course: { lectures: [{ parts: [{ id: 'p2' }] }] } },
            { courseId: 'c3', course: { lectures: [{ parts: [{ id: 'p3' }] }] } },
          ],
        },
        {
          id: 'student-3',
          firstName: 'Mid',
          lastName: 'Scorer',
          enrollments: [
            { courseId: 'c1', course: { lectures: [{ parts: [{ id: 'p1' }] }] } },
            { courseId: 'c2', course: { lectures: [{ parts: [{ id: 'p2' }] }] } },
          ],
        },
      ];

      prismaMock.user.findMany.mockResolvedValue(mockStudents as any);
      
      prismaMock.partProgress.groupBy.mockResolvedValue([
        { userId: 'student-1', _count: { id: 0 } },  // Score: 1*100 + 0 = 100
        { userId: 'student-2', _count: { id: 3 } },  // Score: 3*100 + 100 = 400
        { userId: 'student-3', _count: { id: 1 } },  // Score: 2*100 + 50 = 250
      ] as any);

      prismaMock.paymentRecord.groupBy.mockResolvedValue([]);
      prismaMock.user.findFirst.mockResolvedValue(null);

      // ACT
      await controller.getInsights(mockRequest as Request, mockResponse as Response);

      // ASSERT
      const response = jsonMock.mock.calls[0][0];
      const topStudents = response.data.topEngagedStudents;

      expect(topStudents).toHaveLength(3);
      expect(topStudents[0].engagementScore).toBeGreaterThanOrEqual(topStudents[1].engagementScore);
      expect(topStudents[1].engagementScore).toBeGreaterThanOrEqual(topStudents[2].engagementScore);
      expect(topStudents[0].fullName).toBe('High Scorer');
    });

    it('should handle students with no progress', async () => {
      // ARRANGE
      const mockStudent = {
        id: 'student-new',
        firstName: 'New',
        lastName: 'Student',
        enrollments: [
          {
            courseId: 'c1',
            course: { lectures: [{ parts: [{ id: 'p1' }] }] },
          },
        ],
      };

      prismaMock.user.findMany.mockResolvedValue([mockStudent] as any);
      
      // No progress data
      prismaMock.partProgress.groupBy.mockResolvedValue([]);

      prismaMock.paymentRecord.groupBy.mockResolvedValue([]);
      prismaMock.user.findFirst.mockResolvedValue(null);

      // ACT
      await controller.getInsights(mockRequest as Request, mockResponse as Response);

      // ASSERT
      const response = jsonMock.mock.calls[0][0];
      
      expect(response.data.topEngagedStudents[0]).toMatchObject({
        userId: 'student-new',
        purchasedCoursesCount: 1,
        avgCompletionPercentage: 0,
        engagementScore: 100, // 1 * 100 + 0
      });
    });
  });

  describe('Performance Metrics', () => {
    it('should complete in reasonable time with 100 students', async () => {
      // ARRANGE
      const mockStudents = Array.from({ length: 100 }, (_, i) => ({
        id: `student-${i}`,
        firstName: `Student`,
        lastName: `${i}`,
        enrollments: [
          {
            courseId: `course-${i % 10}`,
            course: { lectures: [{ parts: [{ id: `part-${i}` }] }] },
          },
        ],
      }));

      prismaMock.user.findMany.mockResolvedValue(mockStudents as any);
      prismaMock.partProgress.groupBy.mockResolvedValue([]);
      prismaMock.paymentRecord.groupBy.mockResolvedValue([]);
      prismaMock.user.findFirst.mockResolvedValue(null);

      // ACT
      const startTime = Date.now();
      await controller.getInsights(mockRequest as Request, mockResponse as Response);
      const endTime = Date.now();

      // ASSERT
      const executionTime = endTime - startTime;
      
      // With optimized query, should complete in <100ms
      // (vs. >1000ms with N+1 problem)
      expect(executionTime).toBeLessThan(100);
      
      // Verify only 1 groupBy call regardless of student count
      expect(prismaMock.partProgress.groupBy).toHaveBeenCalledTimes(1);
    });
  });
});
