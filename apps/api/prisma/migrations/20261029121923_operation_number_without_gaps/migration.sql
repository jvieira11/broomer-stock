-- O número das operações passa a ser atribuído pela API (maior número + 1,
-- sob trava), para não deixar buracos quando uma operação é recusada.
-- Os números já gravados não mudam.
ALTER TABLE "stock_operations" ALTER COLUMN "number" DROP DEFAULT;
DROP SEQUENCE "stock_operations_number_seq";
