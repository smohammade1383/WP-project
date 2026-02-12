/**
 * Dashboard Modules Configuration
 * Defines available modules and their role-based access control
 */

import type { DashboardModule } from '../types/dashboard.types';

const ALL_ROLES = [
  'Administrator',
  'Chief',
  'Captain',
  'Sergeant',
  'Detective',
  'Police Officer',
  'Patrol Officer',
  'Cadet',
  'Complainant',
  'Witness',
  'Suspect',
  'Criminal',
  'Judge',
  'Coroner',
  'Basic User',
];

export const DASHBOARD_MODULES: DashboardModule[] = [
  // Shared Modules
  {
    id: 'most-wanted',
    title: 'تحت پیگیری شدید',
    description: 'مظنونان و مجرمان تحت تعقیب',
    icon: '⚠️',
    route: '/most-wanted',
    allowedRoles: ALL_ROLES,
    color: '#E74C3C',
    badge: 'مهم',
  },
  {
    id: 'notifications',
    title: 'اعلان‌ها',
    description: 'پیام‌ها و اطلاعیه‌های شما',
    icon: '🔔',
    route: '/notifications',
    allowedRoles: ALL_ROLES,
    color: '#1ABC9C',
  },

  {
    id: 'profile',
    title: 'پروفایل من',
    description: 'مشاهده و ویرایش اطلاعات شخصی',
    icon: '👤',
    route: '/profile',
    allowedRoles: ALL_ROLES,
    color: '#7F8C8D',
  },
  {
    id: 'legal-bail',
    title: 'وضعیت حقوقی و وثیقه',
    description: 'مشاهده وضعیت بازداشت و پرداخت آنلاین وثیقه/جریمه',
    icon: '💳',
    route: '/legal-bail',
    allowedRoles: ['Basic User', 'Suspect', 'Criminal'],
    color: '#0F766E',
  },

  // Citizen Modules
  {
    id: 'citizen-complaints',
    title: 'پیگیری شکایات',
    description: 'مشاهده وضعیت شکایات ثبت شده',
    icon: '📝',
    route: '/citizen/complaints',
    allowedRoles: ['Basic User', 'Complainant', 'Witness'],
    color: '#F39C12',
  },
  {
    id: 'citizen-complaint-new',
    title: 'ثبت شکایت جدید',
    description: 'ایجاد شکایت جدید برای پیگیری',
    icon: '➕',
    route: '/citizen/complaints/new',
    allowedRoles: ['Basic User', 'Complainant', 'Witness'],
    color: '#F1C40F',
  },
  {
    id: 'citizen-rewards',
    title: 'وضعیت پاداش‌ها',
    description: 'پیگیری گزارش‌های مردمی و پاداش‌ها',
    icon: '🎁',
    route: '/citizen/rewards',
    allowedRoles: ['Basic User', 'Complainant', 'Witness'],
    color: '#E67E22',
  },

  // Cadet Modules
  {
    id: 'cadet-complaints',
    title: 'شکایات دریافتی',
    description: 'بررسی شکایات جدید شهروندان',
    icon: '📥',
    route: '/cadet/complaints',
    allowedRoles: ['Cadet'],
    color: '#3498DB',
  },

  // Officer Modules
  {
    id: 'officer-complaints',
    title: 'تایید نهایی شکایات',
    description: 'بررسی شکایات تایید شده توسط کارآموز',
    icon: '✅',
    route: '/officer/complaints',
    allowedRoles: ['Police Officer', 'Patrol Officer'],
    color: '#16A085',
  },
  {
    id: 'officer-tips',
    title: 'گزارش‌های مردمی',
    description: 'بررسی اولیه گزارش‌های ارسالی درباره مظنونین',
    icon: '📨',
    route: '/officer/tips',
    allowedRoles: ['Police Officer', 'Patrol Officer', 'Sergeant', 'Captain', 'Chief', 'Administrator'],
    color: '#0EA5E9',
  },
  {
    id: 'officer-crime-scene',
    title: 'ثبت سریع صحنه جرم',
    description: 'ثبت صحنه جرم بدون شاکی',
    icon: '🚨',
    route: '/officer/crime-scene',
    allowedRoles: ['Police Officer', 'Patrol Officer', 'Detective', 'Sergeant', 'Captain', 'Chief', 'Administrator'],
    color: '#E74C3C',
  },

  // Detective Modules
  {
    id: 'detective-cases',
    title: 'پرونده‌های فعال من',
    description: 'پرونده‌های تخصیص داده شده به شما',
    icon: '📂',
    route: '/detective/cases',
    allowedRoles: ['Detective'],
    color: '#4A90E2',
  },
  {
    id: 'detective-board',
    title: 'تخته کارآگاه',
    description: 'مدیریت شواهد و ارتباطات بین مدارک پرونده',
    icon: '🧵',
    route: '/detective-board',
    allowedRoles: ['Detective'],
    color: '#3B82F6',
  },
  {
    id: 'detective-rewards',
    title: 'تاییدیه پاداش',
    description: 'اعتبارسنجی گزارش‌های مردمی تایید شده',
    icon: '🔖',
    route: '/detective/rewards',
    allowedRoles: ['Detective'],
    color: '#F97316',
  },
  {
    id: 'detective-evidence',
    title: 'مدارک جدید',
    description: 'مدارک تازه اضافه شده به پرونده‌ها',
    icon: '🧪',
    route: '/detective/evidence',
    allowedRoles: ['Detective'],
    color: '#8B5CF6',
  },

  // Sergeant Modules
  {
    id: 'sergeant-crime-scenes',
    title: 'تایید صحنه جرم',
    description: 'بررسی پرونده‌های ثبت شده توسط افسران',
    icon: '🛡️',
    route: '/sergeant/crime-scenes',
    allowedRoles: ['Sergeant'],
    color: '#0EA5E9',
  },
  {
    id: 'sergeant-operations',
    title: 'درخواست‌های عملیاتی',
    description: 'درخواست‌های دستگیری کارآگاهان',
    icon: '📌',
    route: '/sergeant/operations',
    allowedRoles: ['Sergeant'],
    color: '#14B8A6',
  },
  {
    id: 'sergeant-detention',
    title: 'بازداشتگاه',
    description: 'مدیریت متهمین و وثیقه‌ها',
    icon: '🔒',
    route: '/sergeant/detention',
    allowedRoles: ['Sergeant'],
    color: '#F59E0B',
  },

  // Captain Modules
  {
    id: 'captain-interrogations',
    title: 'نظارت بر بازجویی',
    description: 'بررسی نمرات بازجویی و تایید نهایی',
    icon: '🎯',
    route: '/captain/interrogations',
    allowedRoles: ['Captain'],
    color: '#6366F1',
  },

  // Chief Modules
  {
    id: 'chief-critical',
    title: 'پرونده‌های بحرانی',
    description: 'پرونده‌های سطح بحرانی برای تایید نهایی',
    icon: '🚩',
    route: '/chief/critical-cases',
    allowedRoles: ['Chief'],
    color: '#DC2626',
  },
  {
    id: 'chief-stats',
    title: 'آمار کلان',
    description: 'نمودارهای مدیریتی از وضعیت جرم و جنایت',
    icon: '📈',
    route: '/chief/stats',
    allowedRoles: ['Chief'],
    color: '#0F766E',
  },

  // Coroner Modules
  {
    id: 'coroner-lab',
    title: 'آزمایشگاه مدارک',
    description: 'مدیریت نتایج آزمایش مدارک زیستی',
    icon: '🧬',
    route: '/coroner/lab',
    allowedRoles: ['Coroner'],
    color: '#9333EA',
  },

  // Judge Modules
  {
    id: 'judge-bench',
    title: 'میز قضاوت',
    description: 'بررسی پرونده‌های تکمیل شده و صدور رای',
    icon: '⚖️',
    route: '/judge/bench',
    allowedRoles: ['Judge'],
    color: '#10B981',
  },
  {
    id: 'reports',
    title: 'گزارش‌گیری کلی',
    description: 'گزارش‌های جامع از پرونده‌ها',
    icon: '📊',
    route: '/reports',
    allowedRoles: ['Judge', 'Captain', 'Chief'],
    color: '#16A085',
  },

  // Admin Modules
  {
    id: 'admin-panel',
    title: 'پنل ادمین',
    description: 'مدیریت نقش‌ها و تنظیمات دسترسی',
    icon: '⚙️',
    route: '/admin',
    allowedRoles: ['Administrator'],
    color: '#34495E',
  },
  {
    id: 'users',
    title: 'مدیریت کاربران',
    description: 'لیست و ویرایش کاربران سامانه',
    icon: '👥',
    route: '/users',
    allowedRoles: ['Administrator'],
    color: '#1F2937',
  },
];

/**
 * Filter modules based on user roles
 */
export const getModulesForUser = (userRoles: string[]): DashboardModule[] => {
  if (!userRoles || userRoles.length === 0) {
    // If no roles, return only basic user modules
    return DASHBOARD_MODULES.filter((module) =>
      module.allowedRoles.includes('Basic User')
    );
  }

  return DASHBOARD_MODULES.filter((module) =>
    module.allowedRoles.some((role) => userRoles.includes(role))
  );
};

/**
 * Check if user has access to a specific module
 */
export const hasModuleAccess = (
  moduleId: string,
  userRoles: string[]
): boolean => {
  const module = DASHBOARD_MODULES.find((m) => m.id === moduleId);
  if (!module) return false;

  if (!userRoles || userRoles.length === 0) {
    return module.allowedRoles.includes('Basic User');
  }

  return module.allowedRoles.some((role) => userRoles.includes(role));
};
