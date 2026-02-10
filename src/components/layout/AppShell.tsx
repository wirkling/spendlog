import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { useAuthStore } from '@/stores/authStore';
import { useRealtimeScanJob } from '@/hooks/useRealtimeScanJob';
import { WifiOff } from 'lucide-react';

export function AppShell() {
  const navigate = useNavigate();
  const { user, loading, initialize } = useAuthStore();
  const { isOnline, pendingCount } = useOfflineQueue();

  useEffect(() => {
    initialize();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    }
  }, [user, loading, navigate]);

  useRealtimeScanJob();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-white">
          <WifiOff size={16} />
          <span>Hors ligne{pendingCount > 0 ? ` - ${pendingCount} en attente` : ''}</span>
        </div>
      )}
      <main className={`pb-20 ${!isOnline ? 'pt-10' : ''}`}>
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
