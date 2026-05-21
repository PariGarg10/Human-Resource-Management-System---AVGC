import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { formatTime } from '@/lib/datetime';

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function readOffice() {
  try {
    const raw = localStorage.getItem('office_location');
    if (raw) {
      const o = JSON.parse(raw) as { lat?: number; lng?: number; radiusMeters?: number };
      const lat = Number(o.lat);
      const lng = Number(o.lng);
      const radiusMeters = Number(o.radiusMeters) || 200;
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) return { lat, lng, radiusMeters };
    }
  } catch {
    /* ignore */
  }
  /* AVGC Studios, 3rd Floor, Plot 8, Pinnacle Tower, Sector 142, Noida */
  return { lat: 28.4995, lng: 77.4128, radiusMeters: 250 };
}

type LocState = 'checking' | 'in' | 'out';

export function PunchPanel() {
  const [now, setNow] = useState(() => new Date());
  const [punchedIn, setPunchedIn] = useState(false);
  const [todayRecord, setTodayRecord] = useState<{ punchin?: string | null; punchout?: string | null } | null>(null);
  const [loc, setLoc] = useState<LocState>('checking');
  const watchRef = useRef<number | null>(null);

  const tick = useCallback(() => setNow(new Date()), []);
  useEffect(() => {
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [tick]);

  const refreshToday = useCallback(async () => {
    try {
      const data = await api<{ record: { punchin?: string | null; punchout?: string | null } | null }>(
        '/api/attendance/today'
      );
      const rec = data.record;
      setTodayRecord(rec || null);
      setPunchedIn(Boolean(rec?.punchin && !rec?.punchout));
    } catch {
      setTodayRecord(null);
      setPunchedIn(false);
    }
  }, []);

  useEffect(() => {
    refreshToday().catch(() => {});
  }, [refreshToday]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLoc('out');
      return;
    }
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const office = readOffice();
        const d = haversineMeters(
          pos.coords.latitude,
          pos.coords.longitude,
          office.lat,
          office.lng
        );
        setLoc(d <= office.radiusMeters ? 'in' : 'out');
      },
      () => setLoc('out'),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
    return () => {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  async function onPunch() {
    try {
      const type = punchedIn ? 'out' : 'in';
      const res = await api<{ message?: string }>('/api/attendance/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      toast(res.message || 'Saved', 'success');
      await refreshToday();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Punch failed', 'error');
    }
  }

  const timeStr = now.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const dateStr = now.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const disabled = loc !== 'in';

  return (
    <div className="mx-auto max-w-md px-4 py-8 text-center">
      <div className="font-['Bebas_Neue',sans-serif] text-[72px] leading-none text-[var(--text-primary)]">
        {timeStr}
      </div>
      <div className="mt-2 font-['DM_Sans',sans-serif] text-base text-[#ed1d24]">{dateStr}</div>
      <div
        className={`mt-5 inline-block rounded-full px-4 py-2 font-['DM_Sans',sans-serif] text-xs font-bold tracking-wide text-white ${
          punchedIn ? 'bg-[#22c55e]' : 'bg-[#ed1d24]'
        }`}
      >
        {punchedIn ? 'PUNCHED IN' : 'PUNCHED OUT'}
      </div>
      <div className="mx-auto mt-4 grid max-w-sm grid-cols-2 gap-3 text-left font-['DM_Sans',sans-serif]">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Last punch in</p>
          <p className="mt-1 text-sm font-bold text-[var(--text-primary)]">{formatTime(todayRecord?.punchin)}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Last punch out</p>
          <p className="mt-1 text-sm font-bold text-[var(--text-primary)]">{formatTime(todayRecord?.punchout)}</p>
        </div>
      </div>
      {punchedIn && todayRecord?.punchin ? (
        <p className="mt-3 font-['DM_Sans',sans-serif] text-sm font-semibold text-[#166534]">
          Currently checked in since {formatTime(todayRecord.punchin)}
        </p>
      ) : null}
      <button
        type="button"
        disabled={disabled}
        onClick={() => void onPunch()}
        className={`mx-auto mt-7 flex h-40 w-40 items-center justify-center rounded-full border-0 px-4 text-center font-['Bebas_Neue',sans-serif] text-[22px] tracking-wide transition-opacity disabled:cursor-not-allowed disabled:opacity-40 ${
          punchedIn
            ? 'border-[3px] border-[#ed1d24] bg-black text-[#ed1d24]'
            : 'bg-[#ed1d24] text-white'
        }`}
      >
        {punchedIn ? 'PUNCH OUT' : 'PUNCH IN'}
      </button>
      <p
        className="mt-5 font-['DM_Sans',sans-serif] text-sm"
        style={{
          color:
            loc === 'checking'
              ? 'var(--text-muted)'
              : loc === 'in'
                ? '#22c55e'
                : '#ed1d24',
        }}
      >
        {loc === 'checking' && '📍 Verifying location...'}
        {loc === 'in' && '✓ At office — punch enabled'}
        {loc === 'out' && '✗ Not at office — punch disabled'}
      </p>
    </div>
  );
}
