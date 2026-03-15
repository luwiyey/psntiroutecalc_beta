
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const LoginScreen: React.FC = () => {
  const [employeeName, setEmployeeName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [idPhoto, setIdPhoto] = useState<File | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const { login } = useAuth();

  const handleLogin = async () => {
    if (!employeeName || !employeeId) {
      alert('Please enter your name and employee ID.');
      return;
    }
    if (!idPhoto) {
      alert('Please upload a photo of your ID.');
      return;
    }

    setIsVerifying(true);

    // Simulate ID verification
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Here you would typically use an OCR library or a backend service
    // to analyze the uploaded ID photo and verify the details.
    // For this example, we'll just simulate a successful verification.

    console.log('Verifying details...', { employeeName, employeeId });
    console.log('Analyzing ID photo...', idPhoto.name);

    // Simulate successful login
    login(employeeName, employeeId);
    
    setIsVerifying(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 dark:bg-black p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary">Conductor Login</h1>
          <p className="text-slate-500">Please enter your details to begin.</p>
        </div>

        <div className="bg-white dark:bg-night-charcoal p-8 rounded-2xl shadow-lg space-y-6">
          <div className="flex flex-col">
            <label className="text-sm font-bold text-slate-500 mb-2">Full Name</label>
            <input
              type="text"
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
              placeholder="e.g., Mark Joseph M. Galvan"
              className="px-4 py-3 bg-slate-50 dark:bg-black rounded-lg border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-sm font-bold text-slate-500 mb-2">Employee ID</label>
            <input
              type="text"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="e.g., 03-1123"
              className="px-4 py-3 bg-slate-50 dark:bg-black rounded-lg border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-sm font-bold text-slate-500 mb-2">Scan/Upload ID</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files && setIdPhoto(e.target.files[0])}
              className="block w-full text-sm text-slate-500 dark:text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
            />
          </div>

          <button
            onClick={handleLogin}
            disabled={isVerifying}
            className="w-full bg-primary text-white py-4 rounded-lg font-bold uppercase tracking-wider shadow-lg hover:bg-primary/90 transition-all disabled:bg-slate-300"
          >
            {isVerifying ? 'Verifying...' : 'Login'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;

