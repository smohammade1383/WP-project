import './PlaceholderPage.css';

interface PlaceholderPageProps {
  title: string;
  description?: string;
  icon?: string;
}

const PlaceholderPage = ({ title, description, icon }: PlaceholderPageProps) => {
  return (
    <div className="placeholder-page">
      <div className="placeholder-header">
        <h1>{icon ? `${icon} ${title}` : title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="placeholder-card">
        <h3>این صفحه در حال توسعه است</h3>
      </div>
    </div>
  );
};

export default PlaceholderPage;
