import { legalPage, PRIVACY } from '@/lib/legal';

export function GET() {
  return legalPage('隱私權政策', PRIVACY);
}
