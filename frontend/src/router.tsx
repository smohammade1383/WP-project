import { createBrowserRouter } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import ComponentsDemo from './pages/ComponentsDemo';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import DetectiveBoard from './pages/DetectiveBoard';
import Cases from './pages/Cases';
import Complaints from './pages/Complaints';
import MostWanted from './pages/MostWanted';
import MostWantedDetail from './pages/MostWantedDetail';
import Evidence from './pages/Evidence';
import Reports from './pages/Reports';
import Profile from './pages/Profile';
import Notifications from './pages/Notifications';
import Trials from './pages/Trials';
import Finance from './pages/Finance';
import Rewards from './pages/Rewards';
import AdminPanel from './pages/AdminPanel';
import Users from './pages/Users';
import MyCases from './pages/MyCases';
import PlaceholderPage from './pages/PlaceholderPage';
import CitizenComplaints from './pages/CitizenComplaints';
import CitizenComplaintNew from './pages/CitizenComplaintNew';
import CitizenRewards from './pages/CitizenRewards';
import CadetComplaintsInbox from './pages/CadetComplaintsInbox';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <Home />,
      },
      {
        path: 'demo',
        element: <ComponentsDemo />,
      },
      {
        path: 'auth',
        element: <Auth />,
      },
      {
        path: 'dashboard',
        element: <Dashboard />,
      },
      {
        path: 'detective-board',
        element: <DetectiveBoard />,
      },
      {
        path: 'cases',
        element: <Cases />,
      },
      {
        path: 'complaints',
        element: <Complaints />,
      },
      {
        path: 'most-wanted',
        element: <MostWanted />,
      },
      {
        path: 'most-wanted/:suspectId',
        element: <MostWantedDetail />,
      },
      {
        path: 'evidence',
        element: <Evidence />,
      },
      {
        path: 'reports',
        element: <Reports />,
      },
      {
        path: 'profile',
        element: <Profile />,
      },
      {
        path: 'notifications',
        element: <Notifications />,
      },
      {
        path: 'trials',
        element: <Trials />,
      },
      {
        path: 'finance',
        element: <Finance />,
      },
      {
        path: 'rewards',
        element: <Rewards />,
      },
      {
        path: 'admin',
        element: <AdminPanel />,
      },
      {
        path: 'users',
        element: <Users />,
      },
      {
        path: 'my-cases',
        element: <MyCases />,
      },
      {
        path: 'citizen/complaints',
        element: <CitizenComplaints />,
      },
      {
        path: 'citizen/complaints/new',
        element: <CitizenComplaintNew />,
      },
      {
        path: 'citizen/rewards',
        element: <CitizenRewards />,
      },
      {
        path: 'cadet/complaints',
        element: <CadetComplaintsInbox />,
      },
      {
        path: 'officer/complaints',
        element: (
          <PlaceholderPage
            icon="✅"
            title="تایید نهایی شکایات"
            description="بررسی شکایات تایید شده توسط کارآموز"
          />
        ),
      },
      {
        path: 'officer/tips',
        element: (
          <PlaceholderPage
            icon="📣"
            title="گزارش‌های مردمی"
            description="بررسی گزارش‌های شهروندان درباره مظنونین"
          />
        ),
      },
      {
        path: 'officer/crime-scene',
        element: (
          <PlaceholderPage
            icon="🚨"
            title="ثبت سریع صحنه جرم"
            description="ثبت صحنه جرم بدون شاکی"
          />
        ),
      },
      {
        path: 'detective/cases',
        element: <MyCases />,
      },
      {
        path: 'detective/rewards',
        element: (
          <PlaceholderPage
            icon="🔖"
            title="تاییدیه پاداش"
            description="اعتبارسنجی گزارش‌های مردمی تایید شده"
          />
        ),
      },
      {
        path: 'detective/evidence',
        element: (
          <PlaceholderPage
            icon="🧪"
            title="مدارک جدید"
            description="مدارک تازه اضافه شده به پرونده‌ها"
          />
        ),
      },
      {
        path: 'sergeant/crime-scenes',
        element: (
          <PlaceholderPage
            icon="🛡️"
            title="تایید صحنه جرم"
            description="بررسی پرونده‌های ثبت شده توسط افسران"
          />
        ),
      },
      {
        path: 'sergeant/operations',
        element: (
          <PlaceholderPage
            icon="📌"
            title="درخواست‌های عملیاتی"
            description="درخواست‌های دستگیری کارآگاهان"
          />
        ),
      },
      {
        path: 'sergeant/detention',
        element: (
          <PlaceholderPage
            icon="🔒"
            title="بازداشتگاه"
            description="مدیریت متهمین و وثیقه‌ها"
          />
        ),
      },
      {
        path: 'captain/interrogations',
        element: (
          <PlaceholderPage
            icon="🎯"
            title="نظارت بر بازجویی"
            description="بررسی نمرات بازجویی و تایید نهایی"
          />
        ),
      },
      {
        path: 'chief/critical-cases',
        element: (
          <PlaceholderPage
            icon="🚩"
            title="پرونده‌های بحرانی"
            description="پرونده‌های سطح بحرانی برای تایید نهایی"
          />
        ),
      },
      {
        path: 'chief/stats',
        element: (
          <PlaceholderPage
            icon="📈"
            title="آمار کلان"
            description="نمودارهای مدیریتی از وضعیت جرم و جنایت"
          />
        ),
      },
      {
        path: 'coroner/lab',
        element: (
          <PlaceholderPage
            icon="🧬"
            title="آزمایشگاه مدارک"
            description="مدیریت نتایج آزمایش مدارک زیستی"
          />
        ),
      },
      {
        path: 'judge/bench',
        element: (
          <PlaceholderPage
            icon="⚖️"
            title="میز قضاوت"
            description="بررسی پرونده‌های تکمیل شده و صدور رای"
          />
        ),
      },
      // Additional routes will be added here
    ],
  },
]);
