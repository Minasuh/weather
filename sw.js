// sw.js — 모닝 날씨 알리미 Service Worker

const CACHE = 'weather-pwa-v1';

// ── 설치 ───────────────────────────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// ── 알림 클릭 시 앱 열기 ───────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      if (list.length > 0) return list[0].focus();
      return clients.openWindow('/');
    })
  );
});

// ── 메인 페이지로부터 알람 메시지 수신 ─────────────────
self.addEventListener('message', e => {
  if (e.data?.type === 'SCHEDULE_ALARM') {
    const { timeStr, apiKey, city } = e.data;
    scheduleAlarm(timeStr, apiKey, city);
  }
  if (e.data?.type === 'CANCEL_ALARMS') {
    cancelAlarms();
  }
});

// ── 알람 스케줄러 ──────────────────────────────────────
const alarmTimers = {};

function cancelAlarms() {
  Object.values(alarmTimers).forEach(id => clearTimeout(id));
  for (const k in alarmTimers) delete alarmTimers[k];
}

function scheduleAlarm(timeStr, apiKey, city) {
  if (alarmTimers[timeStr]) clearTimeout(alarmTimers[timeStr]);

  const now = new Date();
  const [h, m] = timeStr.split(':').map(Number);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const ms = target - now;

  alarmTimers[timeStr] = setTimeout(async () => {
    await fireWeatherNotification(apiKey, city);
    // 24시간 뒤 재등록
    alarmTimers[timeStr] = setTimeout(() => scheduleAlarm(timeStr, apiKey, city), 500);
  }, ms);
}

// ── 날씨 fetch & 알림 발송 ─────────────────────────────
async function fireWeatherNotification(apiKey, city) {
  try {
    const wRes = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=kr`
    );
    if (!wRes.ok) throw new Error('날씨 API 오류');
    const w = await wRes.json();

    const { lat, lon } = w.coord;
    const aRes = await fetch(
      `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`
    );
    const a = aRes.ok ? await aRes.json() : null;
    const pm25 = a?.list?.[0]?.components?.pm2_5 ?? null;

    const temp  = Math.round(w.main.temp);
    const feels = Math.round(w.main.feels_like);
    const desc  = w.weather[0].description;
    const outfit = getOutfit(temp, pm25);
    const pmText = pm25 !== null ? `PM2.5 ${pm25.toFixed(1)}µg/m³ ${pmGrade(pm25)}` : '';

    await self.registration.showNotification(`☀️ ${w.name} 오늘의 날씨`, {
      body: `🌡 ${temp}°C (체감 ${feels}°C) · ${desc}\n💨 ${pmText}\n👗 ${outfit}`,
      icon: `https://openweathermap.org/img/wn/${w.weather[0].icon}@2x.png`,
      badge: 'https://openweathermap.org/img/wn/01d.png',
      tag: 'morning-weather',
      renotify: true,
      requireInteraction: false
    });
  } catch (err) {
    await self.registration.showNotification('모닝 날씨 알리미', {
      body: '날씨 정보를 불러오지 못했어요. 앱을 확인해주세요.',
      icon: 'https://openweathermap.org/img/wn/01d@2x.png',
      tag: 'morning-weather-error'
    });
  }
}

function getOutfit(temp, pm25) {
  let c = '';
  if      (temp >= 28) c = '반팔·반바지';
  else if (temp >= 23) c = '반팔 티셔츠';
  else if (temp >= 17) c = '긴팔·가디건';
  else if (temp >= 12) c = '자켓·후드티';
  else if (temp >= 6)  c = '코트·니트·머플러';
  else                 c = '패딩·방한용품';

  if (pm25 !== null && pm25 >= 35) c += ' + 마스크 필수';
  return c;
}

function pmGrade(pm25) {
  if (pm25 < 15) return '😊좋음';
  if (pm25 < 35) return '🙂보통';
  if (pm25 < 75) return '😟나쁨';
  return '😷매우나쁨';
}
