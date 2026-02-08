import { useEffect, useState } from 'react';
import './Home.css';
import { statsApi, type AggregatedStats } from '../services';

const Home = () => {
  const [stats, setStats] = useState<AggregatedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const data = await statsApi.getAggregatedStats();
        setStats(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching statistics:', err);
        setError('خطا در دریافت آمار');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="home-page">
      <div className="hero-section">
        <h2>سامانه مدیریت پلیس</h2>
        <p className="subtitle">سیستم جامع مدیریت پرونده‌های پلیسی و قضایی</p>
        <p className="description">
          سامانه‌ای کامل برای مدیریت پرونده‌های جنایی، شواهد، مظنونین و فرآیندهای قضایی
          با قابلیت‌های پیشرفته از ثبت شکایت تا صدور حکم
        </p>
      </div>

      {/* Statistics Section */}
      <div className="stats-section">
        <h3 className="stats-title">آمار کلی سامانه</h3>
        <div className="stats-grid">
          {loading ? (
            // Skeleton Loading
            <>
              <div className="stat-card skeleton">
                <div className="stat-icon-skeleton"></div>
                <div className="stat-number-skeleton"></div>
                <div className="stat-label-skeleton"></div>
              </div>
              <div className="stat-card skeleton">
                <div className="stat-icon-skeleton"></div>
                <div className="stat-number-skeleton"></div>
                <div className="stat-label-skeleton"></div>
              </div>
              <div className="stat-card skeleton">
                <div className="stat-icon-skeleton"></div>
                <div className="stat-number-skeleton"></div>
                <div className="stat-label-skeleton"></div>
              </div>
            </>
          ) : error ? (
            <div className="error-message">{error}</div>
          ) : stats ? (
            <>
              <div className="stat-card">
                <div className="stat-icon">✅</div>
                <div className="stat-number">{stats.solved_cases.toLocaleString('fa-IR')}</div>
                <div className="stat-label">پرونده‌های حل شده</div>
              </div>
              
              <div className="stat-card">
                <div className="stat-icon">👮</div>
                <div className="stat-number">{stats.staff_count.toLocaleString('fa-IR')}</div>
                <div className="stat-label">کارمندان سازمان</div>
              </div>
              
              <div className="stat-card">
                <div className="stat-icon">📁</div>
                <div className="stat-number">{stats.active_cases.toLocaleString('fa-IR')}</div>
                <div className="stat-label">پرونده‌های فعال</div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* About Section */}
      <div className="about-section">
        <h3 className="section-title">درباره اداره پلیس</h3>
        <div className="about-content">
          <p>
            اداره پلیس با هدف حفظ نظم و امنیت جامعه، وظیفه پیشگیری، کشف و رسیدگی به جرائم را بر عهده دارد.
            این سامانه جامع با بهره‌گیری از فناوری‌های نوین، امکان مدیریت کارآمد و شفاف فرآیندهای مختلف پلیسی را فراهم می‌آورد.
          </p>
        </div>
      </div>

      {/* Features Grid */}
      <div className="features-section">
        <h3 className="section-title">وظایف و خدمات</h3>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">🔍</div>
            <h4>تحقیق و کشف جرم</h4>
            <p>بررسی و تحقیق در مورد جرائم، جمع‌آوری شواهد و شناسایی مجرمان</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">📋</div>
            <h4>مدیریت پرونده‌ها</h4>
            <p>ثبت، پیگیری و مدیریت کامل پرونده‌های جنایی با سطوح مختلف شدت</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">⚖️</div>
            <h4>فرآیند قضایی</h4>
            <p>هماهنگی با دستگاه قضایی جهت محاکمه و صدور احکام</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🎯</div>
            <h4>ردیابی مظنونین</h4>
            <p>پیگیری و رتبه‌بندی مظنونین بر اساس شواهد و سوابق</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🔬</div>
            <h4>شواهد علمی</h4>
            <p>ثبت و تحلیل شواهد پزشکی قانونی و آزمایشگاهی</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">💰</div>
            <h4>مدیریت مالی</h4>
            <p>مدیریت پرداخت وثیقه، جریمه و پاداش‌های شهروندان</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
