import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/Login';
import { DashboardPage } from '@/pages/Dashboard';
import { CapturePage } from '@/pages/Capture';
import { ReceiptListPage } from '@/pages/ReceiptList';
import { ReceiptDetailPage } from '@/pages/ReceiptDetail';
import { ExportPage } from '@/pages/Export';
import { SettingsPage } from '@/pages/Settings';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/capture', element: <CapturePage /> },
      { path: '/receipts', element: <ReceiptListPage /> },
      { path: '/receipts/:id', element: <ReceiptDetailPage /> },
      { path: '/export', element: <ExportPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
]);
