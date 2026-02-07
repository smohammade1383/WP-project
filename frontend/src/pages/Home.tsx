import './Home.css';

const Home = () => {
  return (
    <div className="home-page">
      <div className="hero-section">
        <h2>خوش آمدید به وکیل پلاس</h2>
        <p className="subtitle">سیستم مدیریت پرونده‌های حقوقی</p>
        <p className="description">
          یک پلتفرم جامع برای مدیریت پرونده‌ها، مشتریان، و اسناد حقوقی
        </p>
      </div>

      <div className="features-grid">
        <div className="feature-card">
          <div className="feature-icon">📁</div>
          <h3>مدیریت پرونده‌ها</h3>
          <p>سازماندهی و پیگیری پرونده‌های حقوقی به صورت حرفه‌ای</p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">👥</div>
          <h3>مدیریت مشتریان</h3>
          <p>نگهداری اطلاعات کامل مشتریان و ارتباط با آنها</p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">📊</div>
          <h3>گزارش‌گیری</h3>
          <p>تهیه گزارش‌های تحلیلی و آماری از فعالیت‌ها</p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">🔒</div>
          <h3>امنیت بالا</h3>
          <p>حفاظت از اطلاعات حساس با بالاترین استانداردهای امنیتی</p>
        </div>
      </div>
    </div>
  );
};

export default Home;
