import { Request, Response } from 'express';
import prisma from '../../config/prisma';
import { Role, PaymentStatus, EnrollmentStatus } from '@prisma/client';
import { ApiResponse } from '../../utils/api-response';

export class DashboardInsightsController {
    // GET /api/v1/admin/dashboard/insights
    public getInsights = async (req: Request, res: Response) => {
        try {
            // 1. Top Purchased Course
            const topCourseAgg = await prisma.paymentRecord.groupBy({
                by: ['courseId'],
                where: {
                    status: PaymentStatus.COMPLETED
                },
                _count: {
                    id: true
                },
                orderBy: {
                    _count: {
                        id: 'desc'
                    }
                },
                take: 1
            });

            let topPurchasedCourse = null;
            if (topCourseAgg.length > 0) {
                const course = await prisma.course.findUnique({
                    where: { id: topCourseAgg[0].courseId },
                    select: { id: true, title: true }
                });
                if (course) {
                    topPurchasedCourse = {
                        courseId: course.id,
                        title: course.title,
                        purchasesCount: topCourseAgg[0]._count.id
                    };
                }
            }

            // 2. Newest Student
            const newestStudentData = await prisma.user.findFirst({
                where: { role: Role.STUDENT },
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    createdAt: true
                }
            });

            let newestStudent = null;
            if (newestStudentData) {
                newestStudent = {
                    userId: newestStudentData.id,
                    fullName: [newestStudentData.firstName, newestStudentData.lastName]
                        .filter(Boolean)
                        .join(' ') || 'Unknown',
                    email: newestStudentData.email,
                    createdAt: newestStudentData.createdAt.toISOString()
                };
            }

            // 3. Top Engaged Students (top 3)
            // PERFORMANCE FIX: Eliminated N+1 query problem (Fix #3)
            // Engagement Score = purchasedCoursesCount * 100 + avgCompletionPercentage
            
            // Step 1: Get students with active enrollments
            const studentsWithEnrollments = await prisma.user.findMany({
                where: {
                    role: Role.STUDENT,
                    enrollments: {
                        some: {
                            status: EnrollmentStatus.ACTIVE
                        }
                    }
                },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    enrollments: {
                        where: { status: EnrollmentStatus.ACTIVE },
                        select: {
                            courseId: true,
                            course: {
                                select: {
                                    lectures: {
                                        select: {
                                            parts: {
                                                select: { id: true }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                take: 50 // Limit to prevent large queries
            });

            // Step 2: Aggregate ALL partProgress data in ONE query
            const allUserIds = studentsWithEnrollments.map(s => s.id);
            const progressAggregation = await prisma.partProgress.groupBy({
                by: ['userId'],
                where: {
                    userId: { in: allUserIds },
                    isVideoCompleted: true
                },
                _count: {
                    id: true
                }
            });

            // Convert to lookup map for O(1) access
            const completedCountsByUser = new Map(
                progressAggregation.map(p => [p.userId, p._count.id])
            );

            // Step 3: Calculate engagement for each student (in-memory)
            const studentEngagements = studentsWithEnrollments.map((student) => {
                const purchasedCoursesCount = student.enrollments.length;

                // Calculate total parts and completed parts
                let totalParts = 0;
                for (const enrollment of student.enrollments) {
                    const courseParts = enrollment.course.lectures.flatMap(l => l.parts);
                    totalParts += courseParts.length;
                }

                // Get completed parts from our aggregated data
                const completedParts = completedCountsByUser.get(student.id) || 0;

                const avgCompletionPercentage = totalParts > 0
                    ? Math.round((completedParts / totalParts) * 100)
                    : 0;

                const engagementScore = purchasedCoursesCount * 100 + avgCompletionPercentage;

                return {
                    userId: student.id,
                    fullName: [student.firstName, student.lastName]
                        .filter(Boolean)
                        .join(' ') || 'Unknown',
                    purchasedCoursesCount,
                    avgCompletionPercentage,
                    engagementScore
                };
            });

            // Sort by engagement score and take top 3
            const topEngagedStudents = studentEngagements
                .sort((a, b) => b.engagementScore - a.engagementScore)
                .slice(0, 3);

            return ApiResponse.success(res, {
                topPurchasedCourse,
                newestStudent,
                topEngagedStudents
            });

        } catch (error) {
            console.error('[DashboardInsights] Error:', error);
            return ApiResponse.error(res, error, 'Internal Server Error');
        }
    };
}
