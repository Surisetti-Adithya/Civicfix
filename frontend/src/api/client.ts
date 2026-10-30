import { ApiError } from '../types';

const API_BASE = '/api';

export class ApiException extends Error {
  code: string;
  details: Record<string, string>;

  constructor(error: ApiError) {
    super(error.message);
    this.name = 'ApiException';
    this.code = error.code;
    this.details = error.details || {};
  }
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('civicfix_token');
  const orgId = localStorage.getItem('civicfix_org_id');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (orgId) {
    headers['X-Organization-Id'] = orgId;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData: ApiError;
    try {
      errorData = await response.json();
    } catch {
      errorData = {
        code: 'NETWORK_ERROR',
        message: response.statusText || 'Unknown error occurred.',
        details: {},
      };
    }
    throw new ApiException(errorData);
  }

  return response.json() as Promise<T>;
}
