import type { AxiosError } from 'axios';

export interface ApiError {
  message: string;
  status?: number;
  statusText?: string;
  data?: any;
}

/**
 * Error Handler for API responses
 * Handles different types of errors and formats them consistently
 */
export class ErrorHandler {
  /**
   * Handle Axios errors
   */
  static handleError(error: AxiosError): ApiError {
    if (error.response) {
      // Server responded with error status
      const { status, statusText, data } = error.response;
      
      return {
        message: this.getErrorMessage(status, data),
        status,
        statusText,
        data,
      };
    } else if (error.request) {
      // Request was made but no response received
      return {
        message: 'خطا در برقراری ارتباط با سرور. لطفاً اتصال اینترنت خود را بررسی کنید.',
        status: 0,
        statusText: 'Network Error',
      };
    } else {
      // Something else happened
      return {
        message: error.message || 'خطای نامشخص رخ داده است',
        status: undefined,
        statusText: 'Unknown Error',
      };
    }
  }

  /**
   * Get appropriate error message based on status code
   */
  private static getErrorMessage(status: number, data: any): string {
    // Try to get message from response data
    if (data?.message) {
      return data.message;
    }

    if (data?.detail) {
      return data.detail;
    }

    // Default messages based on status code
    switch (status) {
      case 400:
        return 'درخواست نامعتبر است';
      case 401:
        return 'لطفاً وارد حساب کاربری خود شوید';
      case 403:
        return 'شما دسترسی لازم برای این عملیات را ندارید';
      case 404:
        return 'اطلاعات درخواستی یافت نشد';
      case 500:
        return 'خطای سرور رخ داده است';
      case 503:
        return 'سرویس در حال حاضر در دسترس نیست';
      default:
        return `خطا: ${status}`;
    }
  }

  /**
   * Display error to user (can be connected to toast/notification system)
   */
  static showError(error: ApiError): void {
    // For now, just console.error
    // Later, this can be connected to a toast notification system
    console.error('API Error:', error.message);
    
    // You can integrate with toast libraries like react-toastify here
    // toast.error(error.message);
  }
}
