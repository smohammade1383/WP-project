const MostWanted = () => {
  return (
    <div style={{ padding: '2rem', direction: 'rtl', textAlign: 'right' }}>
      <h1>⚠️ تحت پیگیری شدید</h1>
      <p>مظنونان و مجرمان تحت تعقیب</p>
      <div style={{ 
        background: 'white', 
        padding: '2rem', 
        borderRadius: '8px', 
        marginTop: '2rem',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        border: '2px solid #e74c3c'
      }}>
        <h3>این صفحه در حال توسعه است</h3>
        <p>لیست مجرمان و مظنونان با سطح خطر بالا در اینجا نمایش داده خواهد شد.</p>
      </div>
    </div>
  );
};

export default MostWanted;
