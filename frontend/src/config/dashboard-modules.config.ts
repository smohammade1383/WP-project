/**
 * Dashboard Modules Configuration
 * Defines available modules and their role-based access control
 */

import type { DashboardModule } from '../types/dashboard.types';

export const DASHBOARD_MODULES: DashboardModule[] = [
  // Investigation & Detective Modules
  {
    id: 'detective-board',
    title: 'تخته کارآگاه',
    description: 'مدیریت شواهد و ارتباطات بین مدارک پرونده',
    icon: '🔍',
    route: '/detective-board',
    allowedRoles: ['Detective', 'Captain', 'Chief', 'Administrator'],
    color: '#4A90E2',
  },
  {
    id: 'cases',
    title: 'پرونده‌ها',
    description: 'مشاهده و مدیریت پرونده‌های قضایی',
    icon: '📁',
    route: '/cases',
    allowedRoles: [
      'Detective',
      'Police Officer',
      'Patrol Officer',
      'Sergeant',
      'Captain',
      'Chief',
      'Judge',
      'Administrator',
    ],
    color: '#E94B3C',
  },
  {
    id: 'complaints',
    title: 'شکایات',
    description: 'مدیریت شکایات و گزارش‌های مردمی',
    icon: '📝',
    route: '/complaints',
    allowedRoles: [
      'Police Officer',
      'Patrol Officer',
      'Sergeant',
      'Detective',
      'Captain',
      'Chief',
      'Administrator',
    ],
    color: '#F39C12',
  },
  {
    id: 'most-wanted',
    title: 'تحت پیگیری شدید',
    description: 'مظنونان و مجرمان تحت تعقیب',
    icon: '⚠️',
    route: '/most-wanted',
    allowedRoles: [
      'Detective',
      'Police Officer',
      'Patrol Officer',
      'Sergeant',
      'Captain',
      'Chief',
      'Judge',
      'Coroner',
      'Cadet',
      'Complainant',
      'Witness',
      'Suspect',
      'Criminal',
      'Basic User',
      'Administrator',
    ],
    color: '#E74C3C',
    badge: 'مهم',
  },

  // Evidence & Forensics
  {
    id: 'evidence',
    title: 'مدارک و شواهد',
    description: 'ثبت و بررسی مدارک و شواهد',
    icon: '🔬',
    route: '/evidence',
    allowedRoles: [
      'Detective',
      'Coroner',
      'Police Officer',
      'Sergeant',
      'Captain',
      'Chief',
      'Administrator',
    ],
    color: '#9B59B6',
  },

  // Judicial & Reports
  {
    id: 'reports',
    title: 'گزارش‌گیری کلی',
    description: 'گزارش‌های جامع از پرونده‌ها',
    icon: '📊',
    route: '/reports',
    allowedRoles: ['Judge', 'Captain', 'Chief', 'Administrator'],
    color: '#16A085',
  },
  {
    id: 'trials',
    title: 'محاکمات',
    description: 'مدیریت جلسات دادگاه و احکام',
    icon: '⚖️',
    route: '/trials',
    allowedRoles: ['Judge', 'Captain', 'Chief', 'Administrator'],
    color: '#27AE60',
  },

  // Financial Management
  {
    id: 'finance',
    title: 'امور مالی',
    description: 'مدیریت پرداخت‌ها، وثیقه‌ها و جریمه‌ها',
    icon: '💰',
    route: '/finance',
    allowedRoles: ['Sergeant', 'Captain', 'Chief', 'Administrator'],
    color: '#F1C40F',
  },
  {
    id: 'rewards',
    title: 'پاداش‌ها',
    description: 'مدیریت پاداش اطلاعات مفید',
    icon: '🎁',
    route: '/rewards',
    allowedRoles: [
      'Police Officer',
      'Patrol Officer',
      'Sergeant',
      'Detective',
      'Captain',
      'Chief',
      'Administrator',
    ],
    color: '#E67E22',
  },

  // User Management & Admin
  {
    id: 'admin-panel',
    title: 'پنل مدیریت',
    description: 'مدیریت کاربران و تنظیمات سیستم',
    icon: '⚙️',
    route: '/admin',
    allowedRoles: ['Administrator', 'Chief'],
    color: '#34495E',
  },
  {
    id: 'users',
    title: 'مدیریت کاربران',
    description: 'مشاهده و ویرایش کاربران',
    icon: '👥',
    route: '/users',
    allowedRoles: ['Administrator', 'Chief', 'Captain'],
    color: '#95A5A6',
  },

  // Personal Modules
  {
    id: 'my-cases',
    title: 'پرونده‌های من',
    description: 'پرونده‌های تحت مسئولیت شما',
    icon: '📋',
    route: '/my-cases',
    allowedRoles: [
      'Detective',
      'Complainant',
      'Witness',
      'Suspect',
      'Criminal',
      'Judge',
      'Basic User',
    ],
    color: '#3498DB',
  },
  {
    id: 'notifications',
    title: 'اعلان‌ها',
    description: 'پیام‌ها و اطلاعیه‌های شما',
    icon: '🔔',
    route: '/notifications',
    allowedRoles: [
      'Detective',
      'Police Officer',
      'Patrol Officer',
      'Sergeant',
      'Captain',
      'Chief',
      'Judge',
      'Complainant',
      'Witness',
      'Suspect',
      'Criminal',
      'Basic User',
      'Administrator',
    ],
    color: '#1ABC9C',
  },
  {
    id: 'profile',
    title: 'پروفایل من',
    description: 'مشاهده و ویرایش اطلاعات شخصی',
    icon: '👤',
    route: '/profile',
    allowedRoles: [
      'Detective',
      'Police Officer',
      'Patrol Officer',
      'Sergeant',
      'Captain',
      'Chief',
      'Cadet',
      'Complainant',
      'Witness',
      'Suspect',
      'Criminal',
      'Judge',
      'Coroner',
      'Basic User',
      'Administrator',
    ],
    color: '#7F8C8D',
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
