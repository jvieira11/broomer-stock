/*
  Warnings:

  - Added the required column `balance_after` to the `stock_movements` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "balance_after" INTEGER NOT NULL;
