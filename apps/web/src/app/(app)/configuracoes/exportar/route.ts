import { proxyDownload } from "@/lib/download";

export function GET() {
  return proxyDownload("/organization/export");
}
