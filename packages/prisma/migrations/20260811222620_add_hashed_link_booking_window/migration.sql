-- AlterTable
ALTER TABLE "public"."HashedLink" ADD COLUMN     "bookingWindowEnd" TIMESTAMP(3),
ADD COLUMN     "bookingWindowStart" TIMESTAMP(3);
