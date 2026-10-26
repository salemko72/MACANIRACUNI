import type { Bill } from "../domain";
export function paymentAfterScan(
  bill: Bill,
): Pick<Bill, "paymentStatus" | "paidAt"> {
  return bill.isDemo === true
    ? { paymentStatus: "unpaid", paidAt: undefined }
    : { paymentStatus: bill.paymentStatus, paidAt: bill.paidAt };
}
