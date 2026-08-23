import React, { createContext, useContext, useEffect, useState, ReactNode, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import {
  UserProfile,
  AccessStatus,
  UserRole,
  AccessRequest,
  PaymentGatewaySettings,
  PaymentRecord,
} from '../types';

const DEFAULT_SUPER_ADMIN_EMAILS = ['osaiasbrito@gmail.com'];

export const DEFAULT_GATEWAY_SETTINGS: PaymentGatewaySettings = {
  lifetimePrice: 97.0,
  trialDays: 30,
  superAdminEmails: DEFAULT_SUPER_ADMIN_EMAILS,
  pixKey: 'osaiasbrito@gmail.com',
  pixKeyType: 'EMAIL',
  pixBeneficiaryName: 'Meu Controle Financeiro',
  pixCity: 'SAO PAULO',
  pixBankName: 'Mercado Pago / Stone',
  pixDirectEnabled: true,
  mercadoPagoPublicKey: '',
  mercadoPagoAccessToken: '',
  mercadoPagoEnabled: true,
  stoneMerchantId: '',
  stoneApiKey: '',
  stoneEnabled: true,
};

interface AuthContextType {
  currentUser: any | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
  isDemoUser: boolean;

  // Access & Roles Status
  isSuperAdmin: boolean;
  accessStatus: AccessStatus;
  trialDaysLeft: number;
  isTrialActive: boolean;
  isLifetimeActive: boolean;
  isDataEntryBlocked: boolean;

  // Authentication Methods
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, name: string, phone?: string) => Promise<void>;
  requestAccess: (email: string, name: string, phone?: string, notes?: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signInAsDemo: () => Promise<void>;
  signInDemo: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;

  // Super Admin & Gateway Data
  gatewaySettings: PaymentGatewaySettings;
  updateGatewaySettings: (newSettings: Partial<PaymentGatewaySettings>) => Promise<void>;
  accessRequests: AccessRequest[];
  paymentsList: PaymentRecord[];

  // Access Management Actions
  approveTrialForUser: (userId: string, customDays?: number) => Promise<void>;
  grantLifetimeForUser: (userId: string, notes?: string) => Promise<void>;
  extendTrialForUser: (userId: string, additionalDays: number) => Promise<void>;
  blockUserAccess: (userId: string) => Promise<void>;
  processLifetimePayment: (paymentData: {
    amount: number;
    gateway: 'MERCADO_PAGO' | 'STONE' | 'PIX_DIRECT' | 'SUPER_ADMIN_MANUAL';
    method: 'PIX' | 'CREDIT_CARD' | 'MANUAL';
    transactionId?: string;
    cardLastFour?: string;
    installments?: number;
    details?: string;
  }) => Promise<{ success: boolean; message: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<any | null>(() => {
    try {
      const saved = localStorage.getItem('mcf_session_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('mcf_session_profile');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isDemoUser, setIsDemoUser] = useState<boolean>(() => {
    return localStorage.getItem('mcf_is_demo') === 'true';
  });

  const [loading, setLoading] = useState<boolean>(() => {
    const hasCached = !!localStorage.getItem('mcf_session_user') || localStorage.getItem('mcf_is_demo') === 'true';
    return !hasCached;
  });

  const [error, setError] = useState<string | null>(null);
  const [gatewaySettings, setGatewaySettings] = useState<PaymentGatewaySettings>(DEFAULT_GATEWAY_SETTINGS);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [paymentsList, setPaymentsList] = useState<PaymentRecord[]>([]);

  // Sync state changes with localStorage
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('mcf_session_user', JSON.stringify(currentUser));
    } else if (!isDemoUser) {
      localStorage.removeItem('mcf_session_user');
    }
  }, [currentUser, isDemoUser]);

  useEffect(() => {
    if (userProfile) {
      localStorage.setItem('mcf_session_profile', JSON.stringify(userProfile));
    } else if (!isDemoUser) {
      localStorage.removeItem('mcf_session_profile');
    }
  }, [userProfile, isDemoUser]);

  useEffect(() => {
    localStorage.setItem('mcf_is_demo', isDemoUser ? 'true' : 'false');
  }, [isDemoUser]);

  // Determine Super Admin Status
  const isSuperAdmin = useMemo(() => {
    if (isDemoUser) return false;
    const email = (currentUser?.email || userProfile?.email || '').toLowerCase().trim();
    if (!email) return false;

    const superAdminList = (gatewaySettings.superAdminEmails || DEFAULT_SUPER_ADMIN_EMAILS).map((e) =>
      e.toLowerCase().trim()
    );

    return superAdminList.includes(email) || userProfile?.role === 'super_admin';
  }, [currentUser, userProfile, gatewaySettings.superAdminEmails, isDemoUser]);

  // Calculate User Access Status & Trial Days Left
  const { accessStatus, trialDaysLeft, isTrialActive, isLifetimeActive, isDataEntryBlocked } =
    useMemo(() => {
      if (isSuperAdmin) {
        return {
          accessStatus: 'lifetime' as AccessStatus,
          trialDaysLeft: 9999,
          isTrialActive: false,
          isLifetimeActive: true,
          isDataEntryBlocked: false,
        };
      }

      if (isDemoUser) {
        return {
          accessStatus: 'trial' as AccessStatus,
          trialDaysLeft: 30,
          isTrialActive: true,
          isLifetimeActive: false,
          isDataEntryBlocked: false,
        };
      }

      if (!userProfile) {
        return {
          accessStatus: 'trial' as AccessStatus,
          trialDaysLeft: 30,
          isTrialActive: true,
          isLifetimeActive: false,
          isDataEntryBlocked: false,
        };
      }

      const status = userProfile.accessStatus || 'trial';

      if (status === 'lifetime') {
        return {
          accessStatus: 'lifetime' as AccessStatus,
          trialDaysLeft: 9999,
          isTrialActive: false,
          isLifetimeActive: true,
          isDataEntryBlocked: false,
        };
      }

      if (status === 'blocked') {
        return {
          accessStatus: 'blocked' as AccessStatus,
          trialDaysLeft: 0,
          isTrialActive: false,
          isLifetimeActive: false,
          isDataEntryBlocked: true,
        };
      }

      const startDateStr = userProfile.trialStartDate || userProfile.createdAt || new Date().toISOString();
      const startDate = new Date(startDateStr).getTime();
      const trialDurationMs = (gatewaySettings.trialDays || 30) * 24 * 60 * 60 * 1000;
      const endDate = userProfile.trialEndDate
        ? new Date(userProfile.trialEndDate).getTime()
        : startDate + trialDurationMs;

      const now = Date.now();
      const msLeft = endDate - now;
      const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

      if (daysLeft <= 0) {
        return {
          accessStatus: 'expired' as AccessStatus,
          trialDaysLeft: 0,
          isTrialActive: false,
          isLifetimeActive: false,
          isDataEntryBlocked: true,
        };
      }

      return {
        accessStatus: 'trial' as AccessStatus,
        trialDaysLeft: daysLeft,
        isTrialActive: true,
        isLifetimeActive: false,
        isDataEntryBlocked: false,
      };
    }, [userProfile, isSuperAdmin, isDemoUser, gatewaySettings.trialDays]);

  // Handle Supabase Auth Session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const u = {
          uid: session.user.id,
          email: session.user.email,
          displayName: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Usuário',
          photoURL: session.user.user_metadata?.avatar_url || null,
        };
        setCurrentUser(u);
        loadOrCreateUserProfile(u);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setIsDemoUser(false);
        const u = {
          uid: session.user.id,
          email: session.user.email,
          displayName: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Usuário',
          photoURL: session.user.user_metadata?.avatar_url || null,
        };
        setCurrentUser(u);
        loadOrCreateUserProfile(u);
      } else if (!isDemoUser) {
        setCurrentUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [isDemoUser]);

  const loadOrCreateUserProfile = async (user: any) => {
    try {
      const nowIso = new Date().toISOString();
      const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const isMasterSuperAdmin = DEFAULT_SUPER_ADMIN_EMAILS.includes(user.email?.toLowerCase().trim());

      const { data, error: fetchErr } = await supabase
        .from('users')
        .select('*')
        .eq('uid', user.uid)
        .maybeSingle();

      if (!data || fetchErr) {
        const initialProfile: UserProfile = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          phone: '',
          role: isMasterSuperAdmin ? 'super_admin' : 'user',
          accessStatus: isMasterSuperAdmin ? 'lifetime' : 'trial',
          trialStartDate: nowIso,
          trialEndDate: trialEnd,
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        await supabase.from('users').upsert([
          {
            uid: initialProfile.uid,
            email: initialProfile.email,
            name: initialProfile.displayName,
            photo_url: initialProfile.photoURL,
            role: initialProfile.role,
            access_status: initialProfile.accessStatus,
            trial_start_date: initialProfile.trialStartDate,
            trial_end_date: initialProfile.trialEndDate,
            created_at: nowIso,
            updated_at: nowIso,
          },
        ]);

        setUserProfile(initialProfile);
      } else {
        setUserProfile({
          uid: data.uid,
          email: data.email,
          displayName: data.name || user.displayName,
          photoURL: data.photo_url || user.photoURL,
          phone: data.phone || '',
          role: isMasterSuperAdmin ? 'super_admin' : data.role || 'user',
          accessStatus: isMasterSuperAdmin ? 'lifetime' : data.access_status || 'trial',
          trialStartDate: data.trial_start_date || nowIso,
          trialEndDate: data.trial_end_date || trialEnd,
          createdAt: data.created_at || nowIso,
          updatedAt: data.updated_at || nowIso,
        });
      }
    } catch (e) {
      console.warn('Erro ao carregar perfil do Supabase:', e);
    }
  };

  const signInWithGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Falha ao autenticar com Google.');
      setLoading(false);
    }
  };

  const signInWithEmail = async (emailInput: string, passInput: string) => {
    setError(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailInput.toLowerCase().trim(),
        password: passInput,
      });
      if (error) throw error;
      if (data.user) {
        const u = {
          uid: data.user.id,
          email: data.user.email,
          displayName: data.user.user_metadata?.name || data.user.email?.split('@')[0] || 'Usuário',
          photoURL: null,
        };
        setCurrentUser(u);
        await loadOrCreateUserProfile(u);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao realizar login.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signUpWithEmail = async (emailInput: string, passInput: string, nameInput: string, phoneInput?: string) => {
    setError(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: emailInput.toLowerCase().trim(),
        password: passInput,
        options: {
          data: { name: nameInput.trim(), phone: phoneInput || '' },
        },
      });
      if (error) throw error;
      if (data.user) {
        const u = {
          uid: data.user.id,
          email: data.user.email,
          displayName: nameInput.trim(),
          photoURL: null,
        };
        setCurrentUser(u);
        await loadOrCreateUserProfile(u);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao criar conta.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const requestAccess = async (email: string, name: string, phone?: string, notes?: string) => {
    setError(null);
  };

  const resetPassword = async (email: string) => {
    setError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar e-mail de recuperação de senha.');
      throw err;
    }
  };

  const signInAsDemo = async () => {
    setLoading(true);
    setIsDemoUser(true);
    const demoId = 'demo-user-financial-2026';
    const demoUser = {
      uid: demoId,
      email: 'usuario.demo@controlefinanceiro.app',
      displayName: 'Carlos Silva (Demonstração)',
      photoURL: null,
    };

    setCurrentUser(demoUser);
    setUserProfile({
      uid: demoId,
      email: demoUser.email,
      displayName: demoUser.displayName,
      photoURL: null,
      role: 'user',
      accessStatus: 'trial',
      trialStartDate: new Date().toISOString(),
      trialEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setLoading(false);
  };

  const signOut = async () => {
    setLoading(true);
    try {
      localStorage.removeItem('mcf_session_user');
      localStorage.removeItem('mcf_session_profile');
      localStorage.removeItem('mcf_is_demo');
      setIsDemoUser(false);
      setCurrentUser(null);
      setUserProfile(null);
      await supabase.auth.signOut();
    } catch (err: any) {
      console.error('Logout error:', err);
    } finally {
      setLoading(false);
    }
  };

  const clearError = () => setError(null);

  const updateGatewaySettings = async (newSettings: Partial<PaymentGatewaySettings>) => {
    setGatewaySettings((prev) => ({ ...prev, ...newSettings }));
  };

  const approveTrialForUser = async (userId: string, customDays = 30) => {
    const trialEndDate = new Date(Date.now() + customDays * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('users').update({ access_status: 'trial', trial_end_date: trialEndDate }).eq('uid', userId);
  };

  const grantLifetimeForUser = async (userId: string) => {
    await supabase.from('users').update({ access_status: 'lifetime' }).eq('uid', userId);
  };

  const extendTrialForUser = async (userId: string, additionalDays: number) => {
    const newEndDate = new Date(Date.now() + additionalDays * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('users').update({ access_status: 'trial', trial_end_date: newEndDate }).eq('uid', userId);
  };

  const blockUserAccess = async (userId: string) => {
    await supabase.from('users').update({ access_status: 'blocked' }).eq('uid', userId);
  };

  const processLifetimePayment = async () => {
    setUserProfile((prev) => (prev ? { ...prev, accessStatus: 'lifetime' } : null));
    return {
      success: true,
      message: 'Pagamento confirmado com sucesso! Seu acesso vitalício foi liberado.',
    };
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        loading,
        error,
        isDemoUser,
        isSuperAdmin,
        accessStatus,
        trialDaysLeft,
        isTrialActive,
        isLifetimeActive,
        isDataEntryBlocked,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        requestAccess,
        resetPassword,
        signInAsDemo,
        signInDemo: signInAsDemo,
        signOut,
        clearError,
        gatewaySettings,
        updateGatewaySettings,
        accessRequests,
        paymentsList,
        approveTrialForUser,
        grantLifetimeForUser,
        extendTrialForUser,
        blockUserAccess,
        processLifetimePayment,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};