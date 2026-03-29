import React, { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import SupportContactSheet from './SupportContactSheet';

const normalizeFullName = (value: string) => value.replace(/\s+/g, ' ').trim();

const normalizeEmployeeId = (value: string) => value.replace(/\s+/g, '').toUpperCase();

const FULL_NAME_ALLOWED_PATTERN = /^[\p{L}][\p{L}.'-]*(?: [\p{L}][\p{L}.'-]*)+$/u;
const DISALLOWED_NAME_PARTS = new Set([
  'admin',
  'anonymous',
  'conductor',
  'employee',
  'name',
  'none',
  'nobody',
  'sample',
  'test',
  'unknown',
  'user'
]);

const getFullNameError = (value: string) => {
  const normalized = normalizeFullName(value);
  if (!normalized) {
    return 'Please enter your full name.';
  }

  if (!FULL_NAME_ALLOWED_PATTERN.test(normalized)) {
    return 'Use your full name with at least first name and surname only.';
  }

  const parts = normalized.split(' ');
  if (parts.length < 2) {
    return 'Please enter at least your first name and surname.';
  }

  const meaningfulParts = parts.filter(part => part.replace(/[.'-]/g, '').length >= 2);
  if (meaningfulParts.length < 2) {
    return 'Please enter a complete full name.';
  }

  const normalizedParts = meaningfulParts.map(part => part.replace(/[.'-]/g, '').toLowerCase());
  if (normalizedParts.every(part => DISALLOWED_NAME_PARTS.has(part))) {
    return 'Please enter your real full name.';
  }

  return '';
};

const LoginScreen: React.FC = () => {
  const [employeeName, setEmployeeName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const { login } = useAuth();

  const normalizedName = useMemo(() => normalizeFullName(employeeName), [employeeName]);
  const normalizedEmployeeId = useMemo(() => normalizeEmployeeId(employeeId), [employeeId]);
  const fullNameError = useMemo(() => getFullNameError(employeeName), [employeeName]);
  const employeeIdError = useMemo(
    () => (normalizedEmployeeId ? '' : 'Please enter your employee ID.'),
    [normalizedEmployeeId]
  );

  const handleLogin = () => {
    setShowErrors(true);

    if (fullNameError || employeeIdError) {
      return;
    }

    login(normalizedName, normalizedEmployeeId);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 p-4 dark:bg-black">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-primary">Conductor Login</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Enter your full name and employee ID to begin.
          </p>
        </div>

        <div className="space-y-6 rounded-2xl bg-white p-8 shadow-lg dark:bg-night-charcoal">
          <div className="flex flex-col">
            <label className="mb-2 text-sm font-bold text-slate-500">Full Name</label>
            <input
              type="text"
              value={employeeName}
              onChange={event => setEmployeeName(event.target.value)}
              placeholder="e.g., Mark Joseph M. Galvan"
              autoComplete="name"
              className={`rounded-lg border px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 dark:bg-black dark:text-white dark:placeholder:text-slate-500 ${
                showErrors && fullNameError
                  ? 'border-primary/60 bg-primary/5 focus:ring-primary'
                  : 'border-slate-200 bg-slate-50 focus:ring-primary dark:border-white/10'
              }`}
            />
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              Use your full legal name. First name and surname are required.
            </p>
            {showErrors && fullNameError ? (
              <p className="mt-2 text-sm font-semibold text-primary">{fullNameError}</p>
            ) : null}
          </div>

          <div className="flex flex-col">
            <label className="mb-2 text-sm font-bold text-slate-500">Employee ID</label>
            <input
              type="text"
              value={employeeId}
              onChange={event => setEmployeeId(event.target.value)}
              placeholder="e.g., 03-1123"
              autoComplete="username"
              className={`rounded-lg border px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 dark:bg-black dark:text-white dark:placeholder:text-slate-500 ${
                showErrors && employeeIdError
                  ? 'border-primary/60 bg-primary/5 focus:ring-primary'
                  : 'border-slate-200 bg-slate-50 focus:ring-primary dark:border-white/10'
              }`}
            />
            {showErrors && employeeIdError ? (
              <p className="mt-2 text-sm font-semibold text-primary">{employeeIdError}</p>
            ) : null}
          </div>

          <button
            onClick={handleLogin}
            className="w-full rounded-lg bg-primary py-4 font-bold uppercase tracking-wider text-white shadow-lg transition-all hover:bg-primary/90"
          >
            Login
          </button>
        </div>

        <div className="mt-6 flex justify-center">
          <button
            onClick={() => setIsSupportOpen(true)}
            className="mx-auto flex items-center justify-center gap-2 text-center text-[11px] font-semibold text-slate-400 transition-all active:scale-[0.99] dark:text-slate-500"
          >
            <span>Developed by Zia Louise Mariano</span>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current text-[#1877F2]" aria-hidden="true">
              <path d="M22 12.07C22 6.5 17.52 2 12 2S2 6.5 2 12.07c0 5.02 3.66 9.18 8.44 9.93v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.49-3.91 3.78-3.91 1.1 0 2.24.2 2.24.2v2.47H15.2c-1.24 0-1.63.78-1.63 1.58v1.89h2.77l-.44 2.9h-2.33V22c4.78-.75 8.43-4.91 8.43-9.93z" />
            </svg>
          </button>
        </div>
      </div>

      <SupportContactSheet isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
    </div>
  );
};

export default LoginScreen;
