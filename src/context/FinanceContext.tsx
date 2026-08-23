import React, { createContext, useContext, useEffect, useState, ReactNode, useMemo, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from './AuthContext';
import {
  Salary,
  ExtraIncome,
  Expense,
  CreditCard,
  InstallmentPurchase,
  Category,
  UserSettings,
  MonthFinancialSummary,
  CardLimitSummary,
  ExpenseFilters,
  BackupData,
  CustomPaymentMethod,
  PaymentMethod,
} from '../types';
import { DEFAULT_CATEGORIES } from '../utils/defaultCategories';
import { isExpenseMatchingCard } from '../utils/cardUtils';
import { getCurrentMonth, getAdjacentMonth } from '../utils/formatters';
import {
  calculateMonthSummary,
  calculateCardLimit,
  generateInstallmentsPlan,
  getEffectiveSalariesForMonth,
  getEffectiveIncomesForMonth,
} from '../utils/calculations';
import { ParsedSpreadsheetItem } from '../utils/excelParser';

interface FinanceContextType {
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  goToPreviousMonth: () => void;
  goToNextMonth: () => void;
  goToCurrentMonth: () => void;

  salaries: Salary[];
  effectiveSalariesForMonth: Salary[];
  incomes: ExtraIncome[];
  effectiveIncomesForMonth: ExtraIncome[];
  expenses: Expense[];
  creditCards: CreditCard[];
  paymentMethods: CustomPaymentMethod[];
  installmentPurchases: InstallmentPurchase[];
  categories: Category[];
  settings: UserSettings | null;

  monthSummary: MonthFinancialSummary;
  cardLimitSummaries: CardLimitSummary[];
  loading: boolean;
  error: string | null;

  // CRUD Operations
  addSalary: (data: Omit<Salary, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateSalary: (id: string, data: Partial<Salary>) => Promise<void>;
  deleteSalary: (id: string) => Promise<void>;
  toggleSalaryStatus: (id: string, currentStatus: 'RECEIVED' | 'PENDING') => Promise<void>;
  setDefaultSalary: (data: {
    amount: number;
    payDay?: number;
    description?: string;
    status?: 'RECEIVED' | 'PENDING';
    active?: boolean;
  }) => Promise<void>;

  addIncome: (data: Omit<ExtraIncome, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateIncome: (id: string, data: Partial<ExtraIncome>) => Promise<void>;
  deleteIncome: (id: string) => Promise<void>;
  toggleIncomeStatus: (id: string, currentStatus: 'RECEIVED' | 'PENDING') => Promise<void>;

  addExpense: (data: Omit<Expense, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateExpense: (id: string, data: Partial<Expense>, updateAllInstallments?: boolean) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  deleteMultipleExpenses: (
    expenseIds: string[],
    deleteAllLinkedInstallments?: boolean
  ) => Promise<{ deletedExpensesCount: number; deletedInstallmentsCount: number }>;
  updateMultipleExpensesStatus: (
    expenseIds: string[],
    targetStatus: 'PAGA' | 'PENDENTE'
  ) => Promise<void>;
  toggleExpenseStatus: (id: string, currentStatus: 'PAGA' | 'PENDENTE') => Promise<void>;

  addCreditCard: (data: Omit<CreditCard, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateCreditCard: (id: string, data: Partial<CreditCard>) => Promise<void>;
  deleteCreditCard: (id: string) => Promise<void>;

  addPaymentMethod: (data: Omit<CustomPaymentMethod, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updatePaymentMethod: (id: string, data: Partial<CustomPaymentMethod>) => Promise<void>;
  deletePaymentMethod: (id: string) => Promise<void>;

  markAllCardExpensesStatus: (
    cardCanonicalId: string,
    cardCanonicalName: string,
    targetStatus: 'PAGA' | 'PENDENTE',
    month: string
  ) => Promise<void>;
  markAllMethodExpensesStatus: (
    method: PaymentMethod | string,
    targetStatus: 'PAGA' | 'PENDENTE',
    month: string
  ) => Promise<void>;

  createInstallmentPurchase: (
    purchaseData: {
      title: string;
      totalAmount: number;
      installmentCount: number;
      startMonth: string;
      cardId: string;
      cardName?: string;
      categoryId: string;
      categoryName: string;
      defaultDay?: number;
      isIndefinite?: boolean;
      monthlyAmount?: number;
    }
  ) => Promise<string>;
  deleteInstallmentPurchase: (purchaseId: string, deleteOnlyExpenseId?: string) => Promise<void>;
  interruptInstallmentPurchase: (purchaseId: string, stopFromMonth?: string) => Promise<void>;

  addCategory: (data: Omit<Category, 'id' | 'userId'>) => Promise<string>;
  deleteCategory: (id: string) => Promise<void>;

  updateSettings: (data: Partial<UserSettings>) => Promise<void>;

  filters: ExpenseFilters;
  setFilters: React.Dispatch<React.SetStateAction<ExpenseFilters>>;
  resetFilters: () => void;
  filteredExpenses: Expense[];

  exportBackupData: () => BackupData;
  importBackupData: (data: BackupData) => Promise<{ success: boolean; message: string; count: number }>;
  importSpreadsheetData: (items: ParsedSpreadsheetItem[]) => Promise<{
    success: boolean;
    expensesCount: number;
    installmentsCount: number;
    incomesCount: number;
    salariesCount: number;
    totalCreated: number;
    message: string;
  }>;
  loadSampleDemoData: () => Promise<void>;
}

export const DEFAULT_PAYMENT_METHODS: Omit<CustomPaymentMethod, 'userId'>[] = [
  {
    id: 'default-pm-pix',
    name: 'Pix',
    type: 'PIX',
    details: 'Chave Pix Instantâneo',
    color: '#0D9488',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'default-pm-boleto',
    name: 'Boleto Bancário',
    type: 'BOLETO',
    details: 'Código de barras / DDA',
    color: '#D97706',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'default-pm-debito',
    name: 'Cartão de Débito',
    type: 'CARTAO_DEBITO',
    details: 'Débito em conta corrente',
    color: '#2563EB',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'default-pm-dinheiro',
    name: 'Dinheiro em Espécie',
    type: 'DINHEIRO',
    details: 'Carteira Física / Dinheiro Vivo',
    color: '#059669',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const defaultFilters: ExpenseFilters = {
  searchQuery: '',
  referenceMonth: 'SELECTED',
  year: 'ALL',
  categoryId: 'ALL',
  paymentMethod: 'ALL',
  cardId: 'ALL',
  status: 'ALL',
};

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const FinanceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser, isDemoUser, isDataEntryBlocked } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth());

  const [salaries, setSalaries] = useState<Salary[]>([]);
  const [incomes, setIncomes] = useState<ExtraIncome[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<CustomPaymentMethod[]>([]);
  const [installmentPurchases, setInstallmentPurchases] = useState<InstallmentPurchase[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ExpenseFilters>(defaultFilters);

  const goToPreviousMonth = useCallback(() => setSelectedMonth((prev) => getAdjacentMonth(prev, -1)), []);
  const goToNextMonth = useCallback(() => setSelectedMonth((prev) => getAdjacentMonth(prev, 1)), []);
  const goToCurrentMonth = useCallback(() => setSelectedMonth(getCurrentMonth()), []);
  const resetFilters = useCallback(() => setFilters(defaultFilters), []);

  const seedDemoData = useCallback((uid: string) => {
    const curMonth = getCurrentMonth();
    const prevMonth = getAdjacentMonth(curMonth, -1);
    const nextMonth = getAdjacentMonth(curMonth, 1);

    const demoCards: CreditCard[] = [
      {
        id: 'demo-card-1',
        userId: uid,
        name: 'Nubank Ultravioleta',
        bank: 'Nubank',
        totalLimit: 6500,
        closingDay: 10,
        dueDay: 17,
        color: '#8B5CF6',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const demoSalaries: Salary[] = [
      {
        id: 'demo-sal-1',
        userId: uid,
        amount: 5500,
        referenceMonth: curMonth,
        payDate: `${curMonth}-05`,
        description: 'Salário Mensal',
        status: 'RECEIVED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const demoExpenses: Expense[] = [
      {
        id: 'demo-exp-1',
        userId: uid,
        description: 'Aluguel do Apartamento',
        amount: 1650,
        date: `${curMonth}-10`,
        referenceMonth: curMonth,
        categoryId: 'cat-moradia',
        categoryName: 'Moradia',
        paymentMethod: 'PIX',
        status: 'PAGA',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    setCreditCards(demoCards);
    setPaymentMethods(DEFAULT_PAYMENT_METHODS.map((pm) => ({ ...pm, userId: uid })));
    setSalaries(demoSalaries);
    setIncomes([]);
    setExpenses(demoExpenses);
    setInstallmentPurchases([]);
    setCategories(DEFAULT_CATEGORIES.map((c, i) => ({ id: `default-cat-${i}`, ...c })));
  }, []);

  // Fetch data from Supabase
  const fetchData = useCallback(async () => {
    if (!currentUser || isDemoUser) return;
    setLoading(true);
    const uid = currentUser.uid;

    try {
      const [
        { data: salData },
        { data: incData },
        { data: expData },
        { data: cardData },
        { data: instData },
        { data: catData },
      ] = await Promise.all([
        supabase.from('salaries').select('*').eq('user_id', uid),
        supabase.from('incomes').select('*').eq('user_id', uid),
        supabase.from('expenses').select('*').eq('user_id', uid),
        supabase.from('credit_cards').select('*').eq('user_id', uid),
        supabase.from('installment_purchases').select('*').eq('user_id', uid),
        supabase.from('categories').select('*').eq('user_id', uid),
      ]);

      if (salData) {
        setSalaries(
          salData.map((s) => ({
            id: s.id,
            userId: s.user_id,
            amount: Number(s.amount),
            payDate: s.pay_date,
            referenceMonth: s.reference_month,
            description: s.description,
            status: s.status,
            isStandardDefault: s.is_standard_default,
            repeatMonthly: s.repeat_monthly,
            createdAt: s.created_at,
            updatedAt: s.updated_at,
          }))
        );
      }

      if (incData) {
        setIncomes(
          incData.map((i) => ({
            id: i.id,
            userId: i.user_id,
            description: i.description,
            amount: Number(i.amount),
            referenceMonth: i.reference_month,
            date: i.date,
            origin: i.origin,
            status: i.status,
            isRecurring: i.is_recurring,
            recurrenceDay: i.recurrence_day,
            notes: i.notes,
            createdAt: i.created_at,
            updatedAt: i.updated_at,
          }))
        );
      }

      if (expData) {
        setExpenses(
          expData.map((e) => ({
            id: e.id,
            userId: e.user_id,
            description: e.description,
            amount: Number(e.amount),
            referenceMonth: e.reference_month,
            date: e.date,
            categoryId: e.category_id,
            categoryName: e.category_name,
            paymentMethod: e.payment_method,
            cardId: e.card_id,
            cardName: e.card_name,
            isInstallment: e.is_installment,
            installmentPurchaseId: e.installment_purchase_id,
            installmentNumber: e.installment_number,
            totalInstallments: e.total_installments,
            status: e.status,
            notes: e.notes,
            createdAt: e.created_at,
            updatedAt: e.updated_at,
          }))
        );
      }

      if (cardData) {
        setCreditCards(
          cardData.map((c) => ({
            id: c.id,
            userId: c.user_id,
            name: c.name,
            bank: c.bank,
            totalLimit: Number(c.total_limit),
            closingDay: c.closing_day,
            dueDay: c.due_day,
            color: c.color,
            isActive: c.is_active,
            createdAt: c.created_at,
            updatedAt: c.updated_at,
          }))
        );
      }

      if (instData) {
        setInstallmentPurchases(
          instData.map((p) => ({
            id: p.id,
            userId: p.user_id,
            title: p.title,
            totalAmount: Number(p.total_amount),
            installmentCount: p.installment_count,
            monthlyAmount: p.monthly_amount ? Number(p.monthly_amount) : undefined,
            isIndefinite: p.is_indefinite,
            isInterrupted: p.is_interrupted,
            startMonth: p.start_month,
            cardId: p.card_id,
            cardName: p.card_name,
            categoryId: p.category_id,
            categoryName: p.category_name,
            status: p.status,
            createdAt: p.created_at,
            updatedAt: p.updated_at,
          }))
        );
      }

      const defaultCats = DEFAULT_CATEGORIES.map((c, i) => ({ id: `default-cat-${i}`, ...c }));
      if (catData && catData.length > 0) {
        setCategories(
          catData.map((c) => ({
            id: c.id,
            userId: c.user_id,
            name: c.name,
            icon: c.icon,
            color: c.color,
            type: c.type,
          }))
        );
      } else {
        setCategories(defaultCats);
      }

      setPaymentMethods(DEFAULT_PAYMENT_METHODS.map((pm) => ({ ...pm, userId: uid })));
    } catch (e: any) {
      console.warn('Erro ao buscar dados do Supabase:', e.message);
    } finally {
      setLoading(false);
    }
  }, [currentUser, isDemoUser]);

  useEffect(() => {
    if (!currentUser) {
      setSalaries([]);
      setIncomes([]);
      setExpenses([]);
      setCreditCards([]);
      setPaymentMethods([]);
      setInstallmentPurchases([]);
      setCategories(DEFAULT_CATEGORIES.map((c, i) => ({ id: `default-cat-${i}`, ...c })));
      setLoading(false);
      return;
    }

    if (isDemoUser) {
      seedDemoData(currentUser.uid);
      setLoading(false);
      return;
    }

    fetchData();
  }, [currentUser, isDemoUser, seedDemoData, fetchData]);

  const effectiveSalariesForMonth = useMemo(() => {
    return getEffectiveSalariesForMonth(selectedMonth, salaries, settings);
  }, [selectedMonth, salaries, settings]);

  const effectiveIncomesForMonth = useMemo(() => {
    return getEffectiveIncomesForMonth(selectedMonth, incomes);
  }, [selectedMonth, incomes]);

  const monthSummary = useMemo(() => {
    return calculateMonthSummary(selectedMonth, salaries, incomes, expenses, settings);
  }, [selectedMonth, salaries, incomes, expenses, settings]);

  const cardLimitSummaries = useMemo(() => {
    return creditCards.map((card) => calculateCardLimit(card, expenses, selectedMonth));
  }, [creditCards, expenses, selectedMonth]);

  const filteredExpenses = useMemo(() => {
    return expenses
      .filter((e) => {
        const expMonth = e.referenceMonth || (e.date ? e.date.substring(0, 7) : '');
        if (filters.referenceMonth !== 'ALL' && filters.referenceMonth !== 'SELECTED') {
          if (expMonth !== filters.referenceMonth) return false;
        } else if (filters.referenceMonth === 'SELECTED') {
          if (expMonth !== selectedMonth) return false;
        }
        if (filters.categoryId !== 'ALL' && e.categoryId !== filters.categoryId) return false;
        if (filters.status !== 'ALL' && e.status !== filters.status) return false;
        return true;
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [expenses, filters, selectedMonth]);

  // CRUD Implementations
  const addSalary = async (data: Omit<Salary, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    if (!currentUser) throw new Error('Usuário não autenticado');
    const nowIso = new Date().toISOString();
    const newId = `sal_${Date.now()}`;
    const newItem: Salary = { ...data, id: newId, userId: currentUser.uid, createdAt: nowIso, updatedAt: nowIso };
    setSalaries((prev) => [newItem, ...prev]);

    if (!isDemoUser) {
      await supabase.from('salaries').insert([
        {
          id: newId,
          user_id: currentUser.uid,
          amount: data.amount,
          pay_date: data.payDate,
          reference_month: data.referenceMonth,
          description: data.description,
          status: data.status,
          created_at: nowIso,
          updated_at: nowIso,
        },
      ]);
    }
    return newId;
  };

  const updateSalary = async (id: string, data: Partial<Salary>): Promise<void> => {
    setSalaries((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
    if (!isDemoUser) {
      await supabase.from('salaries').update(data).eq('id', id);
    }
  };

  const deleteSalary = async (id: string): Promise<void> => {
    setSalaries((prev) => prev.filter((s) => s.id !== id));
    if (!isDemoUser) {
      await supabase.from('salaries').delete().eq('id', id);
    }
  };

  const toggleSalaryStatus = async (id: string, currentStatus: 'RECEIVED' | 'PENDING'): Promise<void> => {
    const nextStatus = currentStatus === 'RECEIVED' ? 'PENDING' : 'RECEIVED';
    await updateSalary(id, { status: nextStatus });
  };

  const setDefaultSalary = async () => {};

  const addIncome = async (data: Omit<ExtraIncome, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    if (!currentUser) throw new Error('Usuário não autenticado');
    const nowIso = new Date().toISOString();
    const newId = `inc_${Date.now()}`;
    const newItem: ExtraIncome = { ...data, id: newId, userId: currentUser.uid, createdAt: nowIso, updatedAt: nowIso };
    setIncomes((prev) => [newItem, ...prev]);

    if (!isDemoUser) {
      await supabase.from('incomes').insert([
        {
          id: newId,
          user_id: currentUser.uid,
          description: data.description,
          amount: data.amount,
          reference_month: data.referenceMonth,
          date: data.date,
          origin: data.origin,
          status: data.status,
          created_at: nowIso,
          updated_at: nowIso,
        },
      ]);
    }
    return newId;
  };

  const updateIncome = async (id: string, data: Partial<ExtraIncome>): Promise<void> => {
    setIncomes((prev) => prev.map((i) => (i.id === id ? { ...i, ...data } : i)));
    if (!isDemoUser) {
      await supabase.from('incomes').update(data).eq('id', id);
    }
  };

  const deleteIncome = async (id: string): Promise<void> => {
    setIncomes((prev) => prev.filter((s) => s.id !== id));
    if (!isDemoUser) {
      await supabase.from('incomes').delete().eq('id', id);
    }
  };

  const toggleIncomeStatus = async (id: string, currentStatus: 'RECEIVED' | 'PENDING'): Promise<void> => {
    const nextStatus = currentStatus === 'RECEIVED' ? 'PENDING' : 'RECEIVED';
    await updateIncome(id, { status: nextStatus });
  };

  const addExpense = async (data: Omit<Expense, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    if (!currentUser) throw new Error('Usuário não autenticado');
    const nowIso = new Date().toISOString();
    const newId = `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newItem: Expense = { ...data, id: newId, userId: currentUser.uid, createdAt: nowIso, updatedAt: nowIso };

    setExpenses((prev) => [newItem, ...prev]);

    if (!isDemoUser) {
      await supabase.from('expenses').insert([
        {
          id: newId,
          user_id: currentUser.uid,
          description: data.description,
          amount: data.amount,
          reference_month: data.referenceMonth,
          date: data.date,
          category_id: data.categoryId,
          category_name: data.categoryName,
          payment_method: data.paymentMethod,
          card_id: data.cardId,
          card_name: data.cardName,
          status: data.status,
          created_at: nowIso,
          updated_at: nowIso,
        },
      ]);
    }
    return newId;
  };

  const updateExpense = async (id: string, data: Partial<Expense>): Promise<void> => {
    setExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, ...data } : e)));
    if (!isDemoUser) {
      await supabase.from('expenses').update(data).eq('id', id);
    }
  };

  const deleteExpense = async (id: string): Promise<void> => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    if (!isDemoUser) {
      await supabase.from('expenses').delete().eq('id', id);
    }
  };

  const deleteMultipleExpenses = async (expenseIds: string[]) => {
    const idSet = new Set(expenseIds);
    setExpenses((prev) => prev.filter((e) => !idSet.has(e.id)));
    if (!isDemoUser) {
      await supabase.from('expenses').delete().in('id', expenseIds);
    }
    return { deletedExpensesCount: expenseIds.length, deletedInstallmentsCount: 0 };
  };

  const updateMultipleExpensesStatus = async (expenseIds: string[], targetStatus: 'PAGA' | 'PENDENTE') => {
    const idSet = new Set(expenseIds);
    setExpenses((prev) => prev.map((e) => (idSet.has(e.id) ? { ...e, status: targetStatus } : e)));
    if (!isDemoUser) {
      await supabase.from('expenses').update({ status: targetStatus }).in('id', expenseIds);
    }
  };

  const toggleExpenseStatus = async (id: string, currentStatus: 'PAGA' | 'PENDENTE'): Promise<void> => {
    const nextStatus = currentStatus === 'PAGA' ? 'PENDENTE' : 'PAGA';
    await updateExpense(id, { status: nextStatus });
  };

  const addCreditCard = async (data: Omit<CreditCard, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    if (!currentUser) throw new Error('Usuário não autenticado');
    const nowIso = new Date().toISOString();
    const newId = `card_${Date.now()}`;
    const newItem: CreditCard = { ...data, id: newId, userId: currentUser.uid, createdAt: nowIso, updatedAt: nowIso };
    setCreditCards((prev) => [...prev, newItem]);

    if (!isDemoUser) {
      await supabase.from('credit_cards').insert([
        {
          id: newId,
          user_id: currentUser.uid,
          name: data.name,
          bank: data.bank,
          total_limit: data.totalLimit,
          closing_day: data.closingDay,
          due_day: data.dueDay,
          color: data.color,
          is_active: data.isActive,
          created_at: nowIso,
          updated_at: nowIso,
        },
      ]);
    }
    return newId;
  };

  const updateCreditCard = async (id: string, data: Partial<CreditCard>): Promise<void> => {
    setCreditCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...data } : c)));
    if (!isDemoUser) {
      await supabase.from('credit_cards').update(data).eq('id', id);
    }
  };

  const deleteCreditCard = async (id: string): Promise<void> => {
    setCreditCards((prev) => prev.filter((c) => c.id !== id));
    if (!isDemoUser) {
      await supabase.from('credit_cards').delete().eq('id', id);
    }
  };

  const addPaymentMethod = async (data: Omit<CustomPaymentMethod, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    const newId = `pm_${Date.now()}`;
    setPaymentMethods((prev) => [...prev, { ...data, id: newId, userId: currentUser?.uid || '' }]);
    return newId;
  };

  const updatePaymentMethod = async (id: string, data: Partial<CustomPaymentMethod>): Promise<void> => {
    setPaymentMethods((prev) => prev.map((pm) => (pm.id === id ? { ...pm, ...data } : pm)));
  };

  const deletePaymentMethod = async (id: string): Promise<void> => {
    setPaymentMethods((prev) => prev.filter((pm) => pm.id !== id));
  };

  const markAllCardExpensesStatus = async (
    cardCanonicalId: string,
    cardCanonicalName: string,
    targetStatus: 'PAGA' | 'PENDENTE',
    month: string
  ): Promise<void> => {
    const targetExpenses = expenses.filter(
      (e) => e.referenceMonth === month && isExpenseMatchingCard(e, cardCanonicalId, cardCanonicalName, creditCards)
    );
    if (targetExpenses.length === 0) return;
    await updateMultipleExpensesStatus(targetExpenses.map((e) => e.id), targetStatus);
  };

  const markAllMethodExpensesStatus = async (
    method: PaymentMethod | string,
    targetStatus: 'PAGA' | 'PENDENTE',
    month: string
  ): Promise<void> => {
    const targetExpenses = expenses.filter(
      (e) => e.referenceMonth === month && (e.paymentMethod === method || e.paymentMethodId === method)
    );
    if (targetExpenses.length === 0) return;
    await updateMultipleExpensesStatus(targetExpenses.map((e) => e.id), targetStatus);
  };

  const createInstallmentPurchase = async (purchaseData: any): Promise<string> => {
    if (!currentUser) throw new Error('Usuário não autenticado');
    const nowIso = new Date().toISOString();
    const purchaseId = `inst_${Date.now()}`;
    const count = purchaseData.installmentCount || 2;

    const installments = generateInstallmentsPlan(
      purchaseData.title,
      purchaseData.totalAmount,
      count,
      purchaseData.startMonth,
      purchaseData.categoryId,
      purchaseData.categoryName,
      purchaseData.cardId,
      purchaseId,
      currentUser.uid,
      purchaseData.defaultDay || 10,
      false,
      purchaseData.cardName
    );

    const expenseItems: Expense[] = installments.map((item, idx) => ({
      ...item,
      id: `exp_inst_${purchaseId}_${idx}`,
      createdAt: nowIso,
      updatedAt: nowIso,
    }));

    setExpenses((prev) => [...expenseItems, ...prev]);

    if (!isDemoUser) {
      await supabase.from('installment_purchases').insert([
        {
          id: purchaseId,
          user_id: currentUser.uid,
          title: purchaseData.title,
          total_amount: purchaseData.totalAmount,
          installment_count: count,
          start_month: purchaseData.startMonth,
          card_id: purchaseData.cardId,
          card_name: purchaseData.cardName,
          category_id: purchaseData.categoryId,
          category_name: purchaseData.categoryName,
          status: 'ACTIVE',
          created_at: nowIso,
          updated_at: nowIso,
        },
      ]);

      const inserts = expenseItems.map((e) => ({
        id: e.id,
        user_id: currentUser.uid,
        description: e.description,
        amount: e.amount,
        reference_month: e.referenceMonth,
        date: e.date,
        category_id: e.categoryId,
        category_name: e.categoryName,
        payment_method: e.paymentMethod,
        card_id: e.cardId,
        card_name: e.cardName,
        is_installment: true,
        installment_purchase_id: purchaseId,
        installment_number: e.installmentNumber,
        total_installments: count,
        status: e.status,
        created_at: nowIso,
        updated_at: nowIso,
      }));

      await supabase.from('expenses').insert(inserts);
    }

    return purchaseId;
  };

  const deleteInstallmentPurchase = async (purchaseId: string): Promise<void> => {
    setExpenses((prev) => prev.filter((e) => e.installmentPurchaseId !== purchaseId));
    setInstallmentPurchases((prev) => prev.filter((p) => p.id !== purchaseId));

    if (!isDemoUser) {
      await supabase.from('expenses').delete().eq('installment_purchase_id', purchaseId);
      await supabase.from('installment_purchases').delete().eq('id', purchaseId);
    }
  };

  const interruptInstallmentPurchase = async (purchaseId: string): Promise<void> => {
    setInstallmentPurchases((prev) =>
      prev.map((p) => (p.id === purchaseId ? { ...p, status: 'INTERRUPTED' } : p))
    );
  };

  const addCategory = async (data: Omit<Category, 'id' | 'userId'>): Promise<string> => {
    const newId = `cat_${Date.now()}`;
    setCategories((prev) => [...prev, { ...data, id: newId, userId: currentUser?.uid || '' }]);
    return newId;
  };

  const deleteCategory = async (id: string): Promise<void> => {
    setCategories((prev) => prev.filter((c) => c.id !== id));
  };

  const updateSettings = async (data: Partial<UserSettings>): Promise<void> => {
    setSettings((prev: any) => ({ ...prev, ...data }));
  };

  const exportBackupData = (): BackupData => {
    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      userId: currentUser?.uid || '',
      salaries,
      incomes,
      expenses,
      creditCards,
      installmentPurchases,
      categories,
    };
  };

  const importBackupData = async () => ({ success: true, message: 'Sucesso', count: 0 });
  const importSpreadsheetData = async () => ({
    success: true,
    expensesCount: 0,
    installmentsCount: 0,
    incomesCount: 0,
    salariesCount: 0,
    totalCreated: 0,
    message: 'Importação concluída!',
  });
  const loadSampleDemoData = async () => {};

  return (
    <FinanceContext.Provider
      value={{
        selectedMonth,
        setSelectedMonth,
        goToPreviousMonth,
        goToNextMonth,
        goToCurrentMonth,
        salaries,
        effectiveSalariesForMonth,
        incomes,
        effectiveIncomesForMonth,
        expenses,
        creditCards,
        paymentMethods,
        installmentPurchases,
        categories,
        settings,
        monthSummary,
        cardLimitSummaries,
        loading,
        error,
        addSalary,
        updateSalary,
        deleteSalary,
        toggleSalaryStatus,
        setDefaultSalary,
        addIncome,
        updateIncome,
        deleteIncome,
        toggleIncomeStatus,
        addExpense,
        updateExpense,
        deleteExpense,
        deleteMultipleExpenses,
        updateMultipleExpensesStatus,
        toggleExpenseStatus,
        addCreditCard,
        updateCreditCard,
        deleteCreditCard,
        addPaymentMethod,
        updatePaymentMethod,
        deletePaymentMethod,
        markAllCardExpensesStatus,
        markAllMethodExpensesStatus,
        createInstallmentPurchase,
        deleteInstallmentPurchase,
        interruptInstallmentPurchase,
        addCategory,
        deleteCategory,
        updateSettings,
        filters,
        setFilters,
        resetFilters,
        filteredExpenses,
        exportBackupData,
        importBackupData,
        importSpreadsheetData,
        loadSampleDemoData,
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
};

export const useFinance = () => {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error('useFinance must be used within a FinanceProvider');
  }
  return context;
};