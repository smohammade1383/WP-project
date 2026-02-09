import { authService } from '../services/auth.service';
import ProtectedModule from '../components/ProtectedModule';

const DetectiveBoard = () => {
  const user = authService.getUserData();

  return (
    <ProtectedModule moduleId="detective-board">
      <div style={{ padding: '2rem', direction: 'rtl', textAlign: 'right' }}>
        <h1>🔍 تخته کارآگاه</h1>
        <p>این صفحه به زودی تکمیل خواهد شد.</p>
        <div style={{ 
          background: 'white', 
          padding: '2rem', 
          borderRadius: '8px', 
          marginTop: '2rem',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
        }}>
          <h3>ویژگی‌های آینده:</h3>
          <ul>
            <li>درگ و دراپ برای مدارک و یادداشت‌ها</li>
            <li>اتصال مدارک با خطوط قرمز</li>
            <li>خروجی تصویری از تخته</li>
            <li>مدیریت شواهد پرونده</li>
          </ul>
        </div>
      </div>
    </ProtectedModule>
  );
};

export default DetectiveBoard;
