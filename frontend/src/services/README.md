# API Services Documentation

This directory contains all API-related services for communicating with the Django backend.

## Structure

```
services/
├── api.client.ts       # Axios instance with interceptors
├── auth.service.ts     # Token management (localStorage)
├── auth.api.ts         # Authentication API calls
├── error.handler.ts    # Error handling and formatting
├── cases.api.ts        # Cases module API calls
└── index.ts           # Central exports
```

## Configuration

### Environment Variables

Create a `.env` file in the frontend root with:

```env
VITE_API_BASE_URL=http://localhost:8000/api
```

## Usage Examples

### Authentication

```typescript
import { authApi } from '@/services/auth.api';

// Login
const response = await authApi.login({
  username: 'user@example.com',
  password: 'password123'
});

// Logout
await authApi.logout();

// Get current user
const user = await authApi.getCurrentUser();
```

### Making API Calls

```typescript
import { casesApi } from '@/services/cases.api';

// Get all cases
const cases = await casesApi.getCases(1, 10);

// Get single case
const case = await casesApi.getCase(1);

// Create new case
const newCase = await casesApi.createCase({
  case_number: '2024-001',
  title: 'پرونده جدید',
  description: 'توضیحات پرونده',
  status: 'active'
});

// Update case
const updated = await casesApi.updateCase(1, {
  title: 'عنوان جدید'
});

// Delete case
await casesApi.deleteCase(1);
```

### Custom API Calls

```typescript
import { api } from '@/services';

// GET request
const data = await api.get('/custom-endpoint/');

// POST request
const result = await api.post('/custom-endpoint/', {
  field: 'value'
});

// PUT request
const updated = await api.put('/custom-endpoint/1/', data);

// DELETE request
await api.delete('/custom-endpoint/1/');
```

## Features

### Automatic Token Management

- Access tokens are automatically added to all requests
- Tokens are stored in localStorage
- Automatic token refresh on 401 errors

### Error Handling

- Centralized error handling for all API calls
- User-friendly error messages in Persian
- Automatic handling of network errors
- Console logging for debugging

### Interceptors

**Request Interceptor:**
- Adds Authorization header with Bearer token
- Configurable request timeout (15s default)

**Response Interceptor:**
- Handles 401 (Unauthorized) - attempts token refresh
- Handles 403 (Forbidden) - logs access denied
- Formats all errors consistently
- Shows user-friendly error messages

## Error Status Codes

| Code | Message (Persian) |
|------|-------------------|
| 400 | درخواست نامعتبر است |
| 401 | لطفاً وارد حساب کاربری خود شوید |
| 403 | شما دسترسی لازم برای این عملیات را ندارید |
| 404 | اطلاعات درخواستی یافت نشد |
| 500 | خطای سرور رخ داده است |
| 503 | سرویس در حال حاضر در دسترس نیست |

## Adding New API Services

1. Create a new file in `services/` directory (e.g., `people.api.ts`)
2. Define TypeScript interfaces for your data models
3. Create API methods using the `api` client
4. Export your service

Example:

```typescript
import { api } from './api.client';

export interface Person {
  id: number;
  name: string;
  // ... other fields
}

export const peopleApi = {
  async getPeople() {
    return api.get<Person[]>('/people/');
  },
  
  async getPerson(id: number) {
    return api.get<Person>(`/people/${id}/`);
  },
  
  // ... other methods
};
```

## TypeScript Types

All API responses are typed. The API client preserves type safety:

```typescript
// ✓ Type-safe
const case: Case = await casesApi.getCase(1);

// ✓ Type-safe list
const response: CaseListResponse = await casesApi.getCases();
```
