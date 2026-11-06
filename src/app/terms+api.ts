import { legalPage, TERMS } from '@/lib/legal';

export function GET() {
  return legalPage('服務條款', TERMS);
}
