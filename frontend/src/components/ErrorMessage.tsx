import './ErrorMessage.css';

interface ErrorMessageProps {
  message: string;
  type?: 'error' | 'warning' | 'info' | 'network' | 'permission' | 'validation';
  onRetry?: () => void;
  onDismiss?: () => void;
  fullScreen?: boolean;
}

const ErrorMessage = ({ 
  message, 
  type = 'error', 
  onRetry, 
  onDismiss,
  fullScreen = false 
}: ErrorMessageProps) => {
  const getIcon = () => {
    switch (type) {
      case 'network':
        return '🌐';
      case 'permission':
        return '🔒';
      case 'validation':
        return '⚠️';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '❌';
    }
  };

  const getTitle = () => {
    switch (type) {
      case 'network':
        return 'خطا در اتصال';
      case 'permission':
        return 'عدم دسترسی';
      case 'validation':
        return 'خطای اعتبارسنجی';
      case 'warning':
        return 'هشدار';
      case 'info':
        return 'اطلاعات';
      default:
        return 'خطا';
    }
  };

  const content = (
    <div className={`error-message error-${type}`}>
      <div className="error-icon">{getIcon()}</div>
      <div className="error-content">
        <h3 className="error-title">{getTitle()}</h3>
        <p className="error-text">{message}</p>
        <div className="error-actions">
          {onRetry && (
            <button onClick={onRetry} className="btn-retry">
              تلاش مجدد
            </button>
          )}
          {onDismiss && (
            <button onClick={onDismiss} className="btn-dismiss">
              بستن
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="error-overlay">
        {content}
      </div>
    );
  }

  return content;
};

export default ErrorMessage;
