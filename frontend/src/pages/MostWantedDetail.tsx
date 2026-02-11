import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { peopleApi, type WantedPerson } from '../services';
import './MostWantedDetail.css';

const formatNumber = (value: number) => value.toLocaleString('fa-IR');

const severityLabel = (level: number) => {
  switch (level) {
    case 4:
      return 'بحرانی';
    case 3:
      return 'سطح ۱';
    case 2:
      return 'سطح ۲';
    case 1:
      return 'سطح ۳';
    default:
      return 'نامشخص';
  }
};

const MostWantedDetail = () => {
  const navigate = useNavigate();
  const { suspectId } = useParams();
  const [data, setData] = useState<WantedPerson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchDetail = async () => {
      if (!suspectId) return;
      try {
        setLoading(true);
        const result = await peopleApi.getWantedDetail(Number(suspectId));
        setData(result);
        setError('');
      } catch (err: any) {
        setError(err.message || 'خطا در دریافت اطلاعات مظنون');
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [suspectId]);

  return (
    <div className="wanted-detail-page">
      <div className="wanted-detail-header">
        <button className="back-button" onClick={() => navigate(-1)}>
          ← بازگشت
        </button>
        <h1>جزئیات فرد تحت پیگیری شدید</h1>
      </div>

      {loading ? (
        <div className="wanted-detail-card skeleton">
          <div className="detail-photo skeleton-block" />
          <div className="detail-content">
            <div className="skeleton-line" />
            <div className="skeleton-line short" />
            <div className="skeleton-line" />
          </div>
        </div>
      ) : error ? (
        <div className="wanted-detail-error">
          <h3>خطا</h3>
          <p>{error}</p>
        </div>
      ) : data ? (
        <div className="wanted-detail-card">
          <div className="detail-photo">
            {data.public_photo ? (
              <img src={data.public_photo} alt={data.suspect.full_name} />
            ) : (
              <div className="photo-placeholder">
                {data.suspect.full_name.slice(0, 1)}
              </div>
            )}
          </div>
          <div className="detail-content">
            <div className="detail-title">
              <div>
                <h2>{data.suspect.full_name}</h2>
                <p className="detail-subtitle">@{data.suspect.username}</p>
              </div>
              <span className="severity-tag">{severityLabel(data.case_severity)}</span>
            </div>

            <p className="detail-description">
              {data.public_details || 'جزئیات عمومی ثبت نشده است.'}
            </p>

            <div className="detail-grid">
              <div className="detail-item">
                <span>کد ملی</span>
                <strong>{data.suspect.national_id}</strong>
              </div>
              <div className="detail-item">
                <span>پرونده مرتبط</span>
                <strong>#{data.case_id}</strong>
              </div>
              <div className="detail-item">
                <span>روزهای تعقیب</span>
                <strong>{formatNumber(data.wanted_days)}</strong>
              </div>
              <div className="detail-item">
                <span>امتیاز تعقیب</span>
                <strong>{formatNumber(data.ranking_score)}</strong>
              </div>
              <div className="detail-item">
                <span>پاداش (ریال)</span>
                <strong>{formatNumber(data.reward_amount)}</strong>
              </div>
              <div className="detail-item">
                <span>وضعیت</span>
                <strong>{data.severe_tracking ? 'تحت پیگیری شدید' : 'عادی'}</strong>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default MostWantedDetail;
