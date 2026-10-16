import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();
export { Prisma, PrismaClient } from '@prisma/client';
export * from './private-documents';
