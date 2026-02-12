import { useNavigate } from 'react-router-dom';
import './Forbidden.css';

const Forbidden = () => {
  const navigate = useNavigate();

  return (
    <div className="forbidden-page">
      <div className="forbidden-card">
        <div className="forbidden-code">403</div>
        <h1>Access Denied</h1>
        <h2>Restricted Area</h2>
        <p>
          شما مجوز دسترسی به این بخش را ندارید.
          <br />
          لطفا به داشبورد بازگردید یا با مدیر سامانه تماس بگیرید.
        </p>
        <button type="button" onClick={() => navigate('/dashboard')}>
          Go Back to Dashboard
        </button>
      </div>
    </div>
  );
};

export default Forbidden;
