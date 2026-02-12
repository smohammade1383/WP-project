/**
 * Example component demonstrating API usage
 * This shows how to use the API services in React components
 */

import { useEffect, useState } from 'react';
import { casesApi, type Case } from '../services/cases.api';
import { authApi } from '../services/auth.api';

const errorMessage = (err: unknown): string => {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return 'خطا در انجام عملیات';
};

const ExampleApiUsage = () => {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Example: Fetch data on component mount
  useEffect(() => {
    loadCases();
  }, []);

  const loadCases = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await casesApi.getCases(1, 10);
      setCases(response.results);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Example: Login
  const handleLogin = async () => {
    try {
      const response = await authApi.login({
        identifier: 'user@example.com',
        password: 'password123',
      });
      
      console.log('Logged in:', response.user);
    } catch (err: unknown) {
      console.error('Login failed:', errorMessage(err));
    }
  };

  // Example: Create new case
  const handleCreateCase = async () => {
    try {
      const newCase = await casesApi.createCase({
        case_number: '2024-001',
        title: 'پرونده جدید',
        description: 'توضیحات پرونده',
        status: 'active',
      });
      
      console.log('Case created:', newCase);
      loadCases(); // Reload list
    } catch (err: unknown) {
      console.error('Create failed:', errorMessage(err));
    }
  };

  if (loading) {
    return <div>در حال بارگذاری...</div>;
  }

  if (error) {
    return <div>خطا: {error}</div>;
  }

  return (
    <div>
      <h2>مثال استفاده از API</h2>
      
      <button onClick={handleLogin}>ورود</button>
      <button onClick={handleCreateCase}>ایجاد پرونده جدید</button>
      <button onClick={loadCases}>بارگذاری مجدد</button>

      <ul>
        {cases.map((caseItem) => (
          <li key={caseItem.id}>
            {caseItem.title} - {caseItem.case_number}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ExampleApiUsage;
