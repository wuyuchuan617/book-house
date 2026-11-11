import { legalPage, requestLang } from '@/lib/legal';

/** /terms（?lang=en 或依瀏覽器語言） */
export function GET(request: Request) {
  return legalPage('terms', requestLang(request));
}
