/**
 * v1.8 AH：每個功能的「什麼是 xxx？」——同一個版型：一句話、怎麼用（3 步）、誰看得到、小提醒（處方箋是靈感）。
 * 第一次進那個分頁會跳一次精簡小卡（記在手機）。
 */
import type Feather from '@expo/vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Href } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';

import { tr } from '@/lib/i18n';

export type AboutKey = 'curation' | 'reading' | 'diary' | 'want' | 'place' | 'rx' | 'event' | 'trip';
export const ABOUT_KEYS: AboutKey[] = ['curation', 'reading', 'diary', 'want', 'place', 'rx', 'event', 'trip'];

export type About = {
  name: string;
  icon: ComponentProps<typeof Feather>['name'];
  color: string;
  one: string;
  steps: [string, string, string];
  who: string;
  tipLabel: string;
  tip: string;
  start: string;
  /** 「開始用」要去哪 */
  href: Href;
};

export function about(key: AboutKey): About {
  const tipLabel = tr('小提醒');
  switch (key) {
    case 'curation':
      return {
        name: tr('策展'), icon: 'layers', color: '#8B4F37',
        one: tr('每個月選幾本書、各寫一句推薦理由，像書店門口的月主題書架。'),
        steps: [tr('選一個月份，取標題'), tr('加書，每本寫一句為什麼推薦'), tr('發布或預約上架；上架前也可以先開預告')],
        who: tr('發布後所有人都看得到；草稿只有你看得到，開了預告的話，讀者只看得到你選的書。'),
        tipLabel, tip: tr('一個月一檔，最多可以先排 3 個月。'), start: tr('開始策展'), href: '/my-store?tab=curation',
      };
    case 'reading':
      return {
        name: tr('閱讀'), icon: 'book-open', color: '#2F6B3A',
        one: tr('記下正在讀、讀完的書，隨手寫心得、摘句和想法。'),
        steps: [tr('＋ › 正在讀，選一本書'), tr('讀到有感覺的地方寫一則心得或摘句'), tr('讀完按「讀完了」')],
        who: tr('公開設定的「閱讀」打開才會出現在書店頁；每一則也可以只給自己。'),
        tipLabel, tip: tr('掃描書頁可以直接把句子變成摘句。'), start: tr('記一本正在讀的書'), href: '/reading/compose',
      };
    case 'diary':
      return {
        name: tr('日記與手記'), icon: 'edit-3', color: '#5A4B8A',
        one: tr('每天用十秒記一句：今天在哪讀、讀了什麼。公開的日記就是書店頁的「手記」。'),
        steps: [tr('＋ › 寫日記，或在書店、咖啡店打卡'), tr('可以附照片、加上正在讀的書'), tr('選「公開」才會出現在探索和書店頁')],
        who: tr('預設只有自己；選公開才出現。私人地點（像家裡）永遠不公開。'),
        tipLabel, tip: tr('每週一早上會幫你整理上一週的回顧。'), start: tr('寫今天的日記'), href: '/diary/compose',
      };
    case 'want':
      return {
        name: tr('想讀與積讀'), icon: 'bookmark', color: '#8B4F37',
        one: tr('想讀＝之後想讀的書和在哪看到；積讀＝買了還沒讀的書。'),
        steps: [tr('看到喜歡的書按「想讀」，寫一句為什麼'), tr('買了按「買了」，記在哪買、哪天買'), tr('開始讀就移到正在讀')],
        who: tr('公開設定打開才出現在書店頁；積讀不顯示金額和在哪買。'),
        tipLabel, tip: tr('金額只有你看得到，購書紀錄可以看今年買了幾本。'), start: tr('加一本想讀的書'), href: '/want-book',
      };
    case 'place':
      return {
        name: tr('地點'), icon: 'map-pin', color: '#2F5D6B',
        one: tr('想去的書店、圖書館、咖啡店，和去過的地方都收在這裡。'),
        steps: [tr('在地點頁按「想去」，寫一句原因'), tr('到了按「打卡」'), tr('去過的地方會自動整理成清單')],
        who: tr('只有公開場所會出現在書店頁；私人地點永遠不公開。'),
        tipLabel, tip: tr('地點頁可以看到大家在那裡讀過的書。'), start: tr('看附近的書的地方'), href: '/?tab=posts',
      };
    case 'rx':
      return {
        name: tr('閱讀處方箋'), icon: 'message-circle', color: '#3F3566',
        one: tr('說說你的狀況，大家為你推薦一本書。'),
        steps: [tr('發起一張處方箋：寫狀況、選標籤、期限'), tr('大家各推薦一本書＋一句理由'), tr('挑喜歡的加進想讀，結案後大家看得到結果')],
        who: tr('所有人都看得到；可以選匿名發起。'),
        tipLabel: tr('靈感'), tip: tr('靈感來自《我想為你推薦一本書》：書店店員聽完一個人的故事，為他挑一本書。在書棲，每間書店都可以是那位店員。'),
        start: tr('發起一張處方箋'), href: '/rx/new',
      };
    case 'event':
      return {
        name: tr('活動'), icon: 'calendar', color: '#9A4A12',
        one: tr('分享你看到的書市集、簽書會、講座，大家一起去。'),
        steps: [tr('先找有沒有人分享過，沒有再新增'), tr('寫一句你的分享、附照片'), tr('按「我會去」，前一天提醒你')],
        who: tr('活動和分享都是公開的。'),
        tipLabel, tip: tr('同一個活動只會有一筆，大家的分享都在活動頁。'), start: tr('分享一個活動'), href: '/event/share',
      };
    case 'trip':
      return {
        name: tr('書旅'), icon: 'compass', color: '#2E5A87',
        one: tr('以城市整理書店，加上順路的咖啡、餐廳和景點，給要去那裡的人參考。'),
        steps: [tr('選城市，從想去、去過或搜尋加地點'), tr('排順序、分天，每站寫一句推薦'), tr('公開後大家可以收藏、一鍵加進想去')],
        who: tr('公開設定的「書旅」預設打開；草稿只有你看得到。'),
        tipLabel, tip: tr('打開「地圖看全部」可以一次看到所有地點。'), start: tr('整理一份書旅'), href: '/trip/edit',
      };
  }
}

const seenKey = (k: AboutKey) => `bookhaus.about-seen.${k}`;

/** 第一次進那個分頁：回傳 true 一次（記在手機） */
export function useFirstVisit(key: AboutKey | null) {
  const [show, setShow] = useState<AboutKey | null>(null);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    AsyncStorage.getItem(seenKey(key))
      .then((v) => {
        if (alive && !v) setShow(key);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]);
  const dismiss = () => {
    if (show) AsyncStorage.setItem(seenKey(show), '1').catch(() => {});
    setShow(null);
  };
  return { show, dismiss };
}
