import './Skeleton.css';

interface SkeletonProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  className?: string;
}

export const Skeleton = ({ 
  width = '100%', 
  height = '1rem', 
  borderRadius = '4px',
  className = '' 
}: SkeletonProps) => {
  return (
    <div 
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius }}
    />
  );
};

export const SkeletonText = ({ lines = 3 }: { lines?: number }) => {
  return (
    <div className="skeleton-text">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton 
          key={index} 
          height="1rem" 
          width={index === lines - 1 ? '70%' : '100%'}
        />
      ))}
    </div>
  );
};

export const SkeletonCard = () => {
  return (
    <div className="skeleton-card">
      <Skeleton height="200px" borderRadius="8px 8px 0 0" />
      <div className="skeleton-card-content">
        <Skeleton height="1.5rem" width="80%" />
        <SkeletonText lines={2} />
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <Skeleton height="2rem" width="80px" borderRadius="4px" />
          <Skeleton height="2rem" width="80px" borderRadius="4px" />
        </div>
      </div>
    </div>
  );
};

export const SkeletonTable = ({ rows = 5 }: { rows?: number }) => {
  return (
    <div className="skeleton-table">
      <div className="skeleton-table-header">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} height="2rem" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="skeleton-table-row">
          {Array.from({ length: 4 }).map((_, colIndex) => (
            <Skeleton key={colIndex} height="1.5rem" />
          ))}
        </div>
      ))}
    </div>
  );
};

export const SkeletonList = ({ items = 5 }: { items?: number }) => {
  return (
    <div className="skeleton-list">
      {Array.from({ length: items }).map((_, index) => (
        <div key={index} className="skeleton-list-item">
          <Skeleton width="48px" height="48px" borderRadius="50%" />
          <div className="skeleton-list-content">
            <Skeleton height="1rem" width="60%" />
            <Skeleton height="0.875rem" width="40%" />
          </div>
        </div>
      ))}
    </div>
  );
};

export default Skeleton;
