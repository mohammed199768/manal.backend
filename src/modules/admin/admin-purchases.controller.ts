import { Request, Response } from 'express';
import prisma from '../../config/prisma';
import { EnrollmentStatus, PaymentProvider, PaymentStatus } from '@prisma/client';
import { z } from 'zod';
import { ApiResponse } from '../../utils/api-response';

export class AdminPurchasesController {
    // GET /api/v1/admin/purchases/pending
    public listPending = async (req: Request, res: Response) => {
        try {
            // Fetch Pending enrollments (Paid = 0)
            const pendingEnrollments = await prisma.enrollment.findMany({
                where: {
                    status: EnrollmentStatus.PENDING,
                    paymentRecords: {
                         none: { status: PaymentStatus.COMPLETED } // Only show truly untouched requests
                    }
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            email: true,
                            firstName: true,
                            lastName: true,
                        }
                    },
                    course: {
                        select: {
                            id: true,
                            title: true,
                            price: true,
                            university: {
                                select: {
                                    id: true,
                                    name: true
                                }
                            }
                        }
                    },
                    paymentRecords: {
                         orderBy: { createdAt: 'desc' }
                    }
                },
                orderBy: {
                    enrolledAt: 'desc'
                }
            });

            // Calculate Ledger State
            const ledger = pendingEnrollments.map(e => {
                const price = Number(e.course.price);
                const paidAmount = 0; // Filtered to 0
                const remaining = isNaN(price) ? 0 : price;
                
                return {
                    ...e,
                    ledger: {
                        price: isNaN(price) ? 0 : price,
                        paidAmount,
                        remaining,
                        paymentState: 'UNPAID'
                    }
                };
            });

            return ApiResponse.success(res, ledger);
        } catch (error) {
            console.error('[AdminPurchases] List Pending Error:', error);
            return ApiResponse.error(res, error, 'Internal Server Error');
        }
    };

    // GET /api/v1/admin/purchases/ledger
    public listLedger = async (req: Request, res: Response) => {
        try {
            // Fetch All "Touched" Enrollments (Active OR Paid > 0)
            const enrollments = await prisma.enrollment.findMany({
                where: {
                    OR: [
                        { status: EnrollmentStatus.ACTIVE },
                        { paymentRecords: { some: { status: PaymentStatus.COMPLETED } } }
                    ]
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            email: true,
                            firstName: true,
                            lastName: true,
                        }
                    },
                    course: {
                        select: {
                            id: true,
                            title: true,
                            price: true,
                            university: {
                                select: {
                                    id: true,
                                    name: true
                                }
                            }
                        }
                    },
                    paymentRecords: {
                        where: { status: PaymentStatus.COMPLETED },
                        orderBy: { createdAt: 'desc' }
                    }
                },
                orderBy: {
                    enrolledAt: 'desc'
                }
            });

            const ledger = enrollments.map(e => {
                const price = Number(e.course.price);
                const validPrice = isNaN(price) ? 0 : price;

                const paidAmount = e.paymentRecords.reduce((sum, p) => sum + Number(p.amount), 0);
                const remaining = Math.max(0, validPrice - paidAmount);
                
                let paymentState = 'UNPAID';
                if (paidAmount >= validPrice) paymentState = 'FULLY_PAID'; 
                else if (paidAmount > 0) paymentState = 'PARTIALLY_PAID';

                return {
                    ...e,
                    ledger: {
                        price: validPrice,
                        paidAmount,
                        remaining,
                        paymentState
                    }
                };
            });

            return ApiResponse.success(res, ledger);
        } catch (error) {
            console.error('[AdminPurchases] List Ledger Error:', error);
            return ApiResponse.error(res, error, 'Internal Server Error');
        }
    };

    // POST /api/v1/admin/purchases/:enrollmentId/mark-paid
    public markPaid = async (req: Request, res: Response) => {
        const { enrollmentId } = req.params;
        const schema = z.object({
            amount: z.number().min(0).optional()
        });

        try {
            const { amount } = schema.parse(req.body);

            const enrollment = await prisma.enrollment.findUnique({
                where: { id: enrollmentId },
                include: { course: true, paymentRecords: true }
            });

            if (!enrollment) {
                return ApiResponse.error(res, null, 'Enrollment not found', 404);
            }

            // Calculate Financials
            const currentPaid = enrollment.paymentRecords
                .filter(p => p.status === PaymentStatus.COMPLETED)
                .reduce((sum, p) => sum + Number(p.amount), 0);
            
            const price = Number(enrollment.course.price);
            if (isNaN(price)) {
                return ApiResponse.error(res, null, 'Critical Data Error: Course Price is Invalid', 500);
            }

            const remaining = Math.max(0, price - currentPaid);
            const paymentAmount = amount !== undefined ? amount : remaining;

            // Zero Price Settlement Rule
            if (price === 0) {
                 if (paymentAmount > 0) {
                     return ApiResponse.error(res, null, 'Zero-priced courses cannot accept payments > 0', 400);
                 }
                 // Allow 0.
            } else {
                 if (paymentAmount <= 0) {
                     return ApiResponse.error(res, null, 'Payment amount must be positive for paid courses', 400);
                 }
            }

            // Strict Price Cap Validation
            if ((currentPaid + paymentAmount) > price) {
                return ApiResponse.error(res, null, `Payment exceeds course price. Max allowed: ${remaining}`, 400);
            }

            // Transaction: Create/Update Record -> Check Totals -> Update Status
            const result = await prisma.$transaction(async (tx) => {
                // 1. Handle Payment Record
                const pendingRecord = await tx.paymentRecord.findFirst({
                    where: {
                        enrollmentId: enrollment.id,
                        status: PaymentStatus.PENDING
                    }
                });

                if (pendingRecord) {
                    await tx.paymentRecord.update({
                        where: { id: pendingRecord.id },
                        data: {
                            status: PaymentStatus.COMPLETED,
                            amount: paymentAmount,
                            provider: PaymentProvider.MANUAL_WHATSAPP,
                            providerEventId: `MANUAL_APPROVE_${Date.now()}_${req.user?.userId || 'ADMIN'}`
                        }
                    });
                } else {
                    await tx.paymentRecord.create({
                        data: {
                            enrollmentId: enrollment.id,
                            userId: enrollment.userId,
                            courseId: enrollment.courseId,
                            provider: PaymentProvider.MANUAL_WHATSAPP,
                            status: PaymentStatus.COMPLETED,
                            amount: paymentAmount,
                            providerEventId: `MANUAL_APPROVE_${Date.now()}_${req.user?.userId || 'ADMIN'}`
                        }
                    });
                }

                // 2. Re-Calculate Totals
                const newTotalPaid = currentPaid + Number(paymentAmount);
                
                // 3. Enforce New Access Rule (Any payment > 0 => Active)
                let newStatus: EnrollmentStatus = EnrollmentStatus.PENDING;
                let activatedAt = enrollment.activatedAt;
                
                if (newTotalPaid > 0 || (price === 0 && newTotalPaid === 0)) {
                     newStatus = EnrollmentStatus.ACTIVE;
                     if (!activatedAt) activatedAt = new Date();
                }

                const updatedEnrollment = await tx.enrollment.update({
                    where: { id: enrollmentId },
                    data: {
                        status: newStatus,
                        activatedAt: newStatus === EnrollmentStatus.ACTIVE ? activatedAt : enrollment.activatedAt
                    }
                });

                return { updatedEnrollment, newTotalPaid, price };
            });

            return ApiResponse.success(res, { 
                enrollment: result.updatedEnrollment,
                ledger: {
                    paid: result.newTotalPaid,
                    price: result.price,
                    remaining: Math.max(0, result.price - result.newTotalPaid),
                    status: result.updatedEnrollment.status
                }
            }, 'Payment recorded');

        } catch (error) {
            console.error('[AdminPurchases] Mark Paid Error:', error);
            return ApiResponse.error(res, error, 'Internal Server Error');
        }
    };

    // PUT /api/v1/admin/purchases/payments/:paymentId
    public updatePayment = async (req: Request, res: Response) => {
        const { paymentId } = req.params;
        const schema = z.object({
            amount: z.number().min(0)
        });

        try {
            const { amount } = schema.parse(req.body);

            const payment = await prisma.paymentRecord.findUnique({
                where: { id: paymentId },
                include: { enrollment: { include: { course: true } } }
            });

            if (!payment) {
                return ApiResponse.error(res, null, 'Payment not found', 404);
            }

            if (payment.status !== PaymentStatus.COMPLETED) {
                return ApiResponse.error(res, null, 'Only completed payments can be edited', 400);
            }

            // Validation: Price Cap Check before saving
            // Need to calculate what total WOULD be
            const othersSum = await prisma.paymentRecord.aggregate({
                _sum: { amount: true },
                where: { 
                     enrollmentId: payment.enrollmentId, 
                     status: PaymentStatus.COMPLETED,
                     id: { not: paymentId } 
                }
            });
            const potentialTotal = (othersSum._sum.amount?.toNumber() || 0) + amount;
            const price = Number(payment.enrollment.course.price);

             if (isNaN(price)) {
                return ApiResponse.error(res, null, 'Critical Data Error: Course Price is Invalid', 500);
            }

            if (potentialTotal > price) {
                 return ApiResponse.error(res, null, `New total (${potentialTotal}) exceeds price (${price})`, 400);
            }

            // Zero Price Rule for Edits
            if (price === 0) {
                if (amount > 0) {
                    return ApiResponse.error(res, null, 'Zero-priced courses cannot accept payments > 0', 400);
                }
            } else {
                if (amount <= 0) {
                    return ApiResponse.error(res, null, 'Payment amount must be positive for paid courses', 400);
                }
            }

            const result = await prisma.$transaction(async (tx) => {
                // 1. Audit Log
                const previousPayload = (payment.rawPayload as any) || {};
                const auditLog = {
                    ...previousPayload,
                    audit: [
                        ...(previousPayload.audit || []),
                        {
                            action: 'UPDATE_AMOUNT',
                            previousAmount: Number(payment.amount),
                            newAmount: amount,
                            date: new Date().toISOString(),
                            adminId: req.user?.userId || 'ADMIN'
                        }
                    ]
                };

                // 2. Update Payment
                await tx.paymentRecord.update({
                    where: { id: paymentId },
                    data: {
                        amount: amount,
                        rawPayload: auditLog
                    }
                });

                // 3. Re-Calculate Enrollment Status
                let newStatus: EnrollmentStatus = EnrollmentStatus.PENDING;
                let activatedAt = payment.enrollment.activatedAt;

                if (potentialTotal > 0 || (price === 0 && potentialTotal === 0)) {
                     newStatus = EnrollmentStatus.ACTIVE;
                     if (!activatedAt) activatedAt = new Date();
                }

                // Apply Status Change
                const updatedEnrollment = await tx.enrollment.update({
                    where: { id: payment.enrollmentId },
                    data: {
                        status: newStatus,
                        activatedAt: newStatus === EnrollmentStatus.ACTIVE ? activatedAt : payment.enrollment.activatedAt
                    }
                });

                return { updatedEnrollment, totalPaid: potentialTotal };
            });

            return ApiResponse.success(res, {
                enrollment: result.updatedEnrollment,
                ledger: {
                    totalPaid: result.totalPaid
                }
            }, 'Payment updated');

        } catch (error) {
            console.error('[AdminPurchases] Update Payment Error:', error);
            return ApiResponse.error(res, error, 'Internal Server Error');
        }
    };

    // GET /api/v1/admin/purchases/history/export
    public exportHistory = async (req: Request, res: Response) => {
        try {
            // Fetch all manual completed payments
            const payments = await prisma.paymentRecord.findMany({
                where: {
                    status: PaymentStatus.COMPLETED,
                    provider: PaymentProvider.MANUAL_WHATSAPP
                },
                include: {
                    user: { select: { email: true, firstName: true, lastName: true } },
                    course: { select: { title: true, price: true, university: { select: { name: true } } } },
                    enrollment: { select: { id: true } } // Request ID matches Enrollment ID logic in controller
                },
                orderBy: { createdAt: 'desc' }
            });

            // Flatten Data
            const rows = payments.map(p => ({
                RequestID: p.enrollmentId,
                StudentName: `${p.user.firstName} ${p.user.lastName}`,
                StudentEmail: p.user.email,
                University: p.course.university.name,
                Course: p.course.title,
                CoursePrice: p.course.price,
                PaidAmount: p.amount,
                Currency: p.currency,
                Date: p.createdAt.toISOString(),
                TransactionID: p.id
            }));

            // Generate CSV
            const headers = ['RequestID', 'StudentName', 'StudentEmail', 'University', 'Course', 'CoursePrice', 'PaidAmount', 'Currency', 'Date', 'TransactionID'];
            const csvRows = [headers.join(',')];
            
            rows.forEach(row => {
                const values = headers.map(header => {
                    const val = (row as any)[header] || '';
                    const escaped = String(val).replace(/"/g, '""'); // Escape double quotes
                    return `"${escaped}"`;
                });
                csvRows.push(values.join(','));
            });

            const csvString = csvRows.join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="payments_export_${new Date().toISOString().split('T')[0]}.csv"`);
            res.send(csvString);

        } catch (error) {
            console.error('[AdminPurchases] Export Error:', error);
            return ApiResponse.error(res, error, 'Internal Server Error');
        }
    };

    // GET /api/v1/admin/revenue/summary
    public getRevenueSummary = async (req: Request, res: Response) => {
        try {
            // 1. Total Received (All approved manual payments)
            const totalRevenue = await prisma.paymentRecord.aggregate({
                where: {
                    status: PaymentStatus.COMPLETED,
                    provider: PaymentProvider.MANUAL_WHATSAPP
                },
                _sum: {
                    amount: true
                }
            });

            // 2. Revenue By Course
            const revenueByCourse = await prisma.paymentRecord.groupBy({
                by: ['courseId'],
                where: {
                    status: PaymentStatus.COMPLETED,
                    provider: PaymentProvider.MANUAL_WHATSAPP
                },
                _sum: {
                    amount: true
                },
                _count: {
                    id: true
                }
            });

            // 3. Total Outstanding Calculation (New Logic)
            // Fetch ALL enrollments that are NOT Full/Inactive? 
            // Better: Fetch all enrolled students and calculate remaining.
            // Needs Filter: user is STUDENT, course price > 0.
            const allEnrollments = await prisma.enrollment.findMany({
                where: {
                   // Optimization: Only where user is enrolled (Active or Pending)
                   // We trust 'Pending' status implies 0 payment in old logic, but 'Active' might have remaining.
                   // Actually, we should check ALL.
                   status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PENDING] }
                },
                include: {
                    course: { select: { price: true } },
                    paymentRecords: { 
                        where: { status: PaymentStatus.COMPLETED },
                        select: { amount: true }
                    }
                }
            });

            let totalOutstanding = 0;
            for (const e of allEnrollments) {
                 const price = Number(e.course.price);
                 if (!isNaN(price) && price > 0) {
                     const paid = e.paymentRecords.reduce((sum, p) => sum + Number(p.amount), 0);
                     const remaining = Math.max(0, price - paid);
                     totalOutstanding += remaining;
                 }
            }

            const courseIds = revenueByCourse.map(r => r.courseId);
            const courses = await prisma.course.findMany({
                where: { id: { in: courseIds } },
                select: { id: true, title: true }
            });

            const enrichedRevenue = revenueByCourse.map(r => ({
                courseId: r.courseId,
                title: courses.find(c => c.id === r.courseId)?.title || 'Unknown',
                amount: r._sum.amount || 0,
                count: r._count.id
            }));

            return ApiResponse.success(res, {
                total: totalRevenue._sum.amount || 0,
                outstanding: totalOutstanding,
                byCourse: enrichedRevenue
            });
        } catch (error) {
            console.error('[AdminPurchases] Revenue Summary Error:', error);
            return ApiResponse.error(res, error, 'Internal Server Error');
        }
    }
}
