import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Organization, Membership, SessionResponse } from '../types';
import { apiRequest } from '../api/client';

interface AuthContextType {
  user: User | null;
  activeOrg: Organization | null;
  role: string | null;
  memberships: Membership[];
  token: string | null;
  login: (email: string, pass: string, orgId?: number) => Promise<void>;
  register: (email: string, pass: string, fullName: string, orgId?: number, role?: string, permanentLocation?: string) => Promise<void>;
  updateProfile: (profile: { full_name?: string; phone_number?: string; permanent_location?: string; home_latitude?: number | null; home_longitude?: number | null }) => Promise<void>;
  logout: () => Promise<void>;
  switchOrg: (orgId: number) => Promise<void>;
  refreshAuth: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [activeOrg, setActiveOrg] = useState<Organization | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [token, setToken] = useState<string | null>(localStorage.getItem('civicfix_token'));
  const [loading, setLoading] = useState<boolean>(true);

  const applySession = (data: SessionResponse) => {
    localStorage.setItem('civicfix_token', data.token);
    setToken(data.token);
    setUser(data.user);
    if (data.active_organization) {
      setActiveOrg(data.active_organization);
      localStorage.setItem('civicfix_org_id', data.active_organization.id.toString());
    } else {
      setActiveOrg(null);
      localStorage.removeItem('civicfix_org_id');
    }
    setRole(data.role);
    setMemberships(data.memberships);
  };

  const refreshAuth = async () => {
    const savedToken = localStorage.getItem('civicfix_token');
    if (!savedToken) {
      setLoading(false);
      return;
    }
    try {
      const data = await apiRequest<SessionResponse>('/auth/me');
      applySession(data);
    } catch {
      localStorage.removeItem('civicfix_token');
      localStorage.removeItem('civicfix_org_id');
      setUser(null);
      setActiveOrg(null);
      setRole(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAuth();
  }, []);

  const login = async (email: string, pass: string, orgId?: number) => {
    const payload: any = { email, password: pass };
    if (orgId) payload.organization_id = orgId;
    const data = await apiRequest<SessionResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    applySession(data);
  };

  const register = async (email: string, pass: string, fullName: string, orgId?: number, role?: string, permanentLocation?: string) => {
    const payload: any = { email, password: pass, full_name: fullName };
    if (orgId) payload.organization_id = orgId;
    if (role) payload.role = role;
    if (permanentLocation) payload.permanent_location = permanentLocation;
    const data = await apiRequest<SessionResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    applySession(data);
  };

  const updateProfile = async (profile: { full_name?: string; phone_number?: string; permanent_location?: string; home_latitude?: number | null; home_longitude?: number | null }) => {
    const data = await apiRequest<SessionResponse>('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(profile),
    });
    applySession(data);
  };

  const logout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } finally {
      localStorage.removeItem('civicfix_token');
      localStorage.removeItem('civicfix_org_id');
      setToken(null);
      setUser(null);
      setActiveOrg(null);
      setRole(null);
      setMemberships([]);
    }
  };

  const switchOrg = async (orgId: number) => {
    const data = await apiRequest<SessionResponse>('/auth/switch-organization', {
      method: 'POST',
      body: JSON.stringify({ organization_id: orgId }),
    });
    applySession(data);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        activeOrg,
        role,
        memberships,
        token,
        login,
        register,
        updateProfile,
        logout,
        switchOrg,
        refreshAuth,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
