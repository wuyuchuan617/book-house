import { legalPage, requestLang } from '@/lib/legal';

/** /privacy（?lang=en 或依瀏覽器語言） */
export function GET(request: Request) {
  return legalPage('privacy', requestLang(request));
}
