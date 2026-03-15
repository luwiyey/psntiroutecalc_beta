import React, { useMemo, useState } from 'react';
import {
  AIRCON_BAYAMBANG_ROUTE_ID,
  CABANATUAN_ROUTE_ID,
  CABANATUAN_VIA_SAN_JOSE_ROUTE_ID,
  CABANATUAN_VIA_TARLAC_ROUTE_ID,
  ORDINARY_BAYAMBANG_ROUTE_ID,
  TARLAC_ROUTE_ID,
  VICE_VERSA
} from '../constants';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

interface Props {
  onComplete?: () => void;
}

const RouteSelectionScreen: React.FC<Props> = ({ onComplete }) => {
  const { routes, selectRoute } = useApp();
  const { authState, completeRouteSelection, logout } = useAuth();
  const [isBayambangPickerOpen, setIsBayambangPickerOpen] = useState(false);

  const tarlacRoute = useMemo(() => routes.find(route => route.id === TARLAC_ROUTE_ID), [routes]);
  const ordinaryBayambangRoute = useMemo(
    () => routes.find(route => route.id === ORDINARY_BAYAMBANG_ROUTE_ID),
    [routes]
  );
  const airconBayambangRoute = useMemo(
    () => routes.find(route => route.id === AIRCON_BAYAMBANG_ROUTE_ID),
    [routes]
  );
  const cabanatuanRoute = useMemo(() => routes.find(route => route.id === CABANATUAN_ROUTE_ID), [routes]);
  const cabanatuanViaSanJoseRoute = useMemo(
    () => routes.find(route => route.id === CABANATUAN_VIA_SAN_JOSE_ROUTE_ID),
    [routes]
  );
  const cabanatuanViaTarlacRoute = useMemo(
    () => routes.find(route => route.id === CABANATUAN_VIA_TARLAC_ROUTE_ID),
    [routes]
  );

  const handleSelectRoute = (routeId: string) => {
    selectRoute(routeId);
    completeRouteSelection();
    onComplete?.();
  };

  const bayambangRoutes = [ordinaryBayambangRoute, airconBayambangRoute].filter(
    (route): route is NonNullable<typeof route> => Boolean(route)
  );

  const cards = [
    {
      id: 'tarlac',
      label: `Tarlac ${VICE_VERSA} Baguio`,
      badge: 'Use Route',
      status: tarlacRoute?.status ?? 'locked',
      onSelect: () => tarlacRoute && handleSelectRoute(tarlacRoute.id)
    },
    {
      id: 'bayambang',
      label: `Bayambang ${VICE_VERSA} Baguio`,
      badge: 'Choose Type',
      status:
        bayambangRoutes.length === 2 &&
        bayambangRoutes.every(route => route.status === 'ready')
          ? 'ready'
          : 'locked',
      onSelect: () => setIsBayambangPickerOpen(true)
    },
    {
      id: 'cabanatuan-via-tarlac',
      label: `Cabanatuan via Tarlac ${VICE_VERSA} Baguio`,
      badge: 'Use Route',
      status: cabanatuanViaTarlacRoute?.status ?? 'locked',
      onSelect: () => cabanatuanViaTarlacRoute && handleSelectRoute(cabanatuanViaTarlacRoute.id)
    },
    {
      id: 'cabanatuan-via-san-jose',
      label: `Cabanatuan via San Jose ${VICE_VERSA} Baguio`,
      badge: 'Use Route',
      status: cabanatuanViaSanJoseRoute?.status ?? 'locked',
      onSelect: () => cabanatuanViaSanJoseRoute && handleSelectRoute(cabanatuanViaSanJoseRoute.id)
    },
    {
      id: 'cabanatuan',
      label: `Cabanatuan ${VICE_VERSA} Baguio`,
      badge: 'Data Pending',
      status: cabanatuanRoute?.status ?? 'locked',
      onSelect: () => undefined
    }
  ] as const;

  return (
    <div className="min-h-screen bg-[#f8f6f6] px-4 py-6 dark:bg-black">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-lg flex-col">
        <div className="rounded-[2rem] bg-primary px-6 py-6 text-white shadow-xl">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/70">Assigned Route</p>
          <h1 className="mt-3 text-3xl font-black leading-tight">Choose Your Route</h1>
          <p className="mt-3 max-w-md text-sm text-white/80">
            Pick the corridor you are handling today. This sets your calculator, tally sheet, and logs.
          </p>
          <div className="mt-5 rounded-3xl bg-white/10 px-4 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/60">Signed In</p>
            <p className="mt-2 text-lg font-black">{authState.employeeName}</p>
            <p className="text-xs font-bold text-white/75">ID: {authState.employeeId}</p>
          </div>
        </div>

        <div className="mt-5 flex-1 space-y-3">
          {cards.map(card => {
            const isLocked = card.status === 'locked';

            return (
              <button
                key={card.id}
                onClick={() => !isLocked && card.onSelect()}
                disabled={isLocked}
                className={`w-full rounded-[2rem] p-5 text-left shadow-md transition-all ${
                  isLocked
                    ? 'bg-white/70 text-slate-400 dark:bg-white/5'
                    : 'bg-white text-slate-800 active:scale-[0.99] dark:bg-night-charcoal dark:text-white'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${isLocked ? 'text-slate-400' : 'text-primary'}`}>
                      {isLocked ? 'Locked Route' : 'Ready To Use'}
                    </p>
                    <h2 className="mt-3 text-xl font-black leading-tight">{card.label}</h2>
                  </div>
                  <div
                    className={`shrink-0 rounded-2xl px-3 py-2 text-[10px] font-black uppercase tracking-widest ${
                      isLocked ? 'bg-slate-100 text-slate-400 dark:bg-white/10' : 'bg-primary/10 text-primary'
                    }`}
                  >
                    {isLocked ? 'Data Pending' : card.badge}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <button
          onClick={logout}
          className="mt-5 rounded-[1.75rem] bg-white px-5 py-4 text-sm font-black uppercase tracking-[0.2em] text-slate-600 shadow-md transition-all active:scale-[0.99] dark:bg-night-charcoal dark:text-slate-300"
        >
          Logout
        </button>
      </div>

      {isBayambangPickerOpen && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 px-4 pb-4 pt-10 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-5 shadow-2xl dark:bg-night-charcoal">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">{`Bayambang ${VICE_VERSA} Baguio`}</p>
                <h2 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">Choose Service</h2>
              </div>
              <button
                onClick={() => setIsBayambangPickerOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 active:scale-90 dark:bg-white/10"
              >
                <span className="material-icons text-base">close</span>
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {bayambangRoutes.map(route => (
                <button
                  key={route.id}
                  onClick={() => handleSelectRoute(route.id)}
                  className="w-full rounded-[1.5rem] bg-slate-50 p-4 text-left shadow-sm transition-all active:scale-[0.99] dark:bg-white/5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">
                        {route.id === ORDINARY_BAYAMBANG_ROUTE_ID ? 'Ordinary' : 'Aircon'}
                      </p>
                      <h3 className="mt-2 text-lg font-black text-slate-900 dark:text-white">{route.label}</h3>
                    </div>
                    <div className="rounded-2xl bg-primary/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-primary">
                      Choose
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RouteSelectionScreen;
