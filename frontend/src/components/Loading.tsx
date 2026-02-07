import './Loading.css';

interface LoadingProps {
  size?: 'small' | 'medium' | 'large';
  message?: string;
  fullScreen?: boolean;
}

const Loading = ({ size = 'medium', message, fullScreen = false }: LoadingProps) => {
  const content = (
    <div className="loading-container">
      <div className={`spinner spinner-${size}`}>
        <div className="spinner-circle"></div>
      </div>
      {message && <p className="loading-message">{message}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="loading-overlay">
        {content}
      </div>
    );
  }

  return content;
};

export default Loading;
