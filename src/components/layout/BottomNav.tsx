import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Camera, Receipt, FileSpreadsheet } from 'lucide-react';
import { useCaptureStore } from '@/stores/captureStore';

const navItems = [
  { path: '/', label: 'Accueil', icon: LayoutDashboard },
  { path: '/capture', label: 'Capturer', icon: Camera, primary: true },
  { path: '/receipts', label: 'Tickets', icon: Receipt },
  { path: '/export', label: 'Export', icon: FileSpreadsheet },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const shutterCallback = useCaptureStore((s) => s.shutterCallback);

  const isOnCapture = location.pathname === '/capture';

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white pb-safe">
      <div className="flex items-center justify-around px-2 py-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          if (item.primary) {
            const isShutter = isOnCapture && shutterCallback;
            return (
              <button
                key={item.path}
                onClick={() => {
                  if (isShutter) {
                    shutterCallback();
                  } else {
                    navigate(item.path);
                  }
                }}
                className={`flex -mt-4 items-center justify-center rounded-full shadow-lg active:scale-95 transition-transform
                  ${isShutter
                    ? 'h-16 w-16 border-4 border-white bg-red-500'
                    : 'h-14 w-14 bg-blue-600 text-white'
                  }`}
              >
                {isShutter ? (
                  <div className="h-12 w-12 rounded-full bg-white" />
                ) : (
                  <Icon size={24} />
                )}
              </button>
            );
          }

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 text-xs
                ${isActive ? 'text-blue-600' : 'text-gray-500'}`}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
