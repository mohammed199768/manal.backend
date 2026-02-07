import prisma from '../../config/prisma';
import { AppError } from '../../utils/app-error';

export class UsersService {
    async getMyCourses(userId: string) {
        const enrollments = await prisma.enrollment.findMany({
            where: { userId, status: 'ACTIVE' },
            include: {
                course: {
                    include: {
                        instructor: {
                            select: {
                                firstName: true,
                                lastName: true
                            }
                        },
                        lectures: {
                            include: {
                                parts: {
                                    include: {
                                        partProgresses: {
                                            where: { userId }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        return enrollments.map((e) => {
            const course = e.course;
            let totalLessons = 0;
            let completedLessons = 0;

            const completedLessonIds: string[] = [];

            course.lectures.forEach(l => {
                l.parts.forEach(p => {
                    totalLessons++;
                    if (p.partProgresses.length > 0 && p.partProgresses[0].completedAt) {
                        completedLessons++;
                        completedLessonIds.push(p.id);
                    }
                });
            });

            const progressPercentage = totalLessons > 0
                ? Math.round((completedLessons / totalLessons) * 100)
                : 0;

            return {
                id: course.id,
                title: course.title,
                thumbnail: course.thumbnail,
                slug: course.slug,
                instructorName: `${course.instructor.firstName} ${course.instructor.lastName}`,
                progress: {
                  percentage: progressPercentage,
                  completedLessonIds: completedLessonIds,
                  totalLessons: totalLessons
                }
            };
        });
    }



    async getStudentFullDetails(studentId: string) {
        const student = await prisma.user.findUnique({
            where: { id: studentId },
            include: {
                enrollments: {
                    include: {
                        locks: true,
                        course: {
                            include: {
                                lectures: {
                                    orderBy: { order: 'asc' },
                                    include: {
                                        parts: {
                                            orderBy: { order: 'asc' },
                                            include: {
                                                files: true,
                                                lessons: true,
                                                partProgresses: {
                                                    where: { userId: studentId }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!student) {
            throw new AppError('Student not found', 404);
        }

        // Remove sensitive info
        const { password, refreshToken, ...safeStudent } = student as any;

        return safeStudent;
    }


}
