import {
  Salary,
  ExtraIncome,
  Expense,
  CreditCard,
  Category,
  CategoryBudget,
  UserSettings,
  MonthFinancialSummary,
  CardLimitSummary,
  MonthBudgetSummary,
  BudgetExecutionItem,
} from '../types';
import { getAdjacentMonth, splitInstallments } from './formatters';

/**
 * Returns the effective salaries for a given month.
 * If specific salaries exist for this month, returns them.
 * If no specific salaries exist for this month, but a standard default salary is configured in UserSettings,
 * synthesizes a standard salary entry for this month.
 */
export const getEffectiveSalariesForMonth = (
  month: string,
  salaries: Salary[],
  settings?: UserSettings | null
): Salary[] => {
  const monthSalaries = salaries.filter((s) => s.referenceMonth === month);
  if (monthSalaries.length > 0) {
    return monthSalaries;
  }

  // If no specific salary registered for this month, check default standardized salary
  if (settings?.defaultSalaryAmount && settings.defaultSalaryAmount > 0 && settings.defaultSalaryActive !== false) {
    const payDay = settings.defaultSalaryPayDay || 5;
    const dayStr = String(Math.min(28, Math.max(1, payDay))).padStart(2, '0');
    return [
      {
        id: `std-salary-${month}`,
        userId: settings.userId,
        amount: settings.defaultSalaryAmount,
        referenceMonth: month,
        payDate: `${month}-${dayStr}`,
        description: settings.defaultSalaryDescription || 'Salário Mensal Base (Padrão)',
        status: settings.defaultSalaryStatus || 'RECEIVED',
        isStandardDefault: true,
        repeatMonthly: true,
        createdAt: settings.createdAt || new Date().toISOString(),
        updatedAt: settings.updatedAt || new Date().toISOString(),
      },
    ];
  }

  return [];
};

/**
 * Returns all effective extra incomes for a given month:
 * - Recurring standard extra incomes (isRecurring === true, which repeat across all months)
 * - Punctual extra incomes specifically assigned to this month (referenceMonth === month && !isRecurring)
 */
export const getEffectiveIncomesForMonth = (
  month: string,
  incomes: ExtraIncome[]
): ExtraIncome[] => {
  return incomes.filter((i) => {
    if (i.isRecurring) return true;
    return i.referenceMonth === month;
  });
};

export const calculateMonthSummary = (
  month: string,
  salaries: Salary[],
  incomes: ExtraIncome[],
  expenses: Expense[],
  settings?: UserSettings | null
): MonthFinancialSummary => {
  // 1. Effective salaries for target referenceMonth (including standardized default if applicable)
  const monthSalaries = getEffectiveSalariesForMonth(month, salaries, settings);

  // 2. Effective extra incomes (recurring standard incomes + month punctual incomes)
  const monthIncomes = getEffectiveIncomesForMonth(month, incomes);

  // 3. Expenses for target referenceMonth
  const monthExpenses = expenses.filter((e) => e.referenceMonth === month);

  // Salaries calculations
  const totalSalary = monthSalaries.reduce((acc, curr) => acc + (curr.amount || 0), 0);
  const receivedSalary = monthSalaries
    .filter((s) => s.status === 'RECEIVED')
    .reduce((acc, curr) => acc + (curr.amount || 0), 0);
  const pendingSalary = totalSalary - receivedSalary;

  // Extra Incomes calculations
  const totalExtraIncome = monthIncomes.reduce((acc, curr) => acc + (curr.amount || 0), 0);
  const receivedExtraIncome = monthIncomes
    .filter((i) => i.status === 'RECEIVED')
    .reduce((acc, curr) => acc + (curr.amount || 0), 0);
  const pendingExtraIncome = totalExtraIncome - receivedExtraIncome;

  // Total Revenues
  const totalRevenue = totalSalary + totalExtraIncome;
  const receivedRevenue = receivedSalary + receivedExtraIncome;
  const pendingRevenue = pendingSalary + pendingExtraIncome;

  // Expenses calculations
  const totalExpenses = monthExpenses.reduce((acc, curr) => acc + (curr.amount || 0), 0);
  const paidExpenses = monthExpenses
    .filter((e) => e.status === 'PAGA')
    .reduce((acc, curr) => acc + (curr.amount || 0), 0);
  const pendingExpenses = totalExpenses - paidExpenses;

  // Credit card invoice for this month
  const creditCardInvoiceTotal = monthExpenses
    .filter((e) => e.paymentMethod === 'CARTAO_CREDITO')
    .reduce((acc, curr) => acc + (curr.amount || 0), 0);

  // Balances
  // Saldo do Salário: Salário total - Total de despesas
  const salaryBalance = totalSalary - totalExpenses;
  // Saldo Total: Receita Total - Total de despesas
  const totalBalance = totalRevenue - totalExpenses;
  // Saldo Efetivo Atual: Receitas já recebidas - Despesas já pagas
  const currentEffectiveBalance = receivedRevenue - paidExpenses;

  return {
    referenceMonth: month,
    totalSalary,
    receivedSalary,
    pendingSalary,
    totalExtraIncome,
    receivedExtraIncome,
    pendingExtraIncome,
    totalRevenue,
    receivedRevenue,
    pendingRevenue,
    totalExpenses,
    paidExpenses,
    pendingExpenses,
    salaryBalance,
    totalBalance,
    currentEffectiveBalance,
    creditCardInvoiceTotal,
    expensesCount: monthExpenses.length,
  };
};

export const calculateCardLimit = (
  card: CreditCard,
  allExpenses: Expense[],
  currentMonth: string
): CardLimitSummary => {
  // All credit card expenses for this card that are not yet paid, or future installments
  const cardExpenses = allExpenses.filter((e) => e.cardId === card.id);

  // Current month invoice: all card expenses mapped to currentMonth
  const currentMonthInvoice = cardExpenses
    .filter((e) => e.referenceMonth === currentMonth)
    .reduce((acc, curr) => acc + (curr.amount || 0), 0);

  // Total used limit: all UNPAID card expenses across all months (pending current, past unpaid + future scheduled installments)
  const usedLimit = cardExpenses
    .filter((e) => e.status === 'PENDENTE')
    .reduce((acc, curr) => acc + (curr.amount || 0), 0);

  const availableLimit = Math.max(0, card.totalLimit - usedLimit);
  const usagePercentage = card.totalLimit > 0 
    ? Math.min(100, Math.round((usedLimit / card.totalLimit) * 100))
    : 0;

  return {
    card,
    totalLimit: card.totalLimit,
    usedLimit,
    currentMonthInvoice,
    availableLimit,
    usagePercentage,
  };
};

/**
 * Builds installment distribution given total amount, installment count, and starting month.
 * Supports both fixed installments (e.g. 12x) and Indefinite / Continuous recurrence (tempo indeterminado).
 */
export const generateInstallmentsPlan = (
  description: string,
  totalAmount: number,
  count: number,
  startMonth: string,
  categoryId: string,
  categoryName: string,
  cardId: string,
  purchaseId: string,
  userId: string,
  defaultDay: number = 10,
  isIndefinite: boolean = false,
  cardName?: string
): Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>[] => {
  const result: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>[] = [];

  if (isIndefinite) {
    // For indefinite installment/recurrence, generate initial 24 months projection that user can interrupt at any point
    const projectionMonths = 24;
    const monthlyVal = totalAmount; // For indefinite, totalAmount entered is the monthly amount

    for (let i = 0; i < projectionMonths; i++) {
      const installmentMonth = getAdjacentMonth(startMonth, i);
      const dayStr = String(Math.min(28, Math.max(1, defaultDay))).padStart(2, '0');
      const dateStr = `${installmentMonth}-${dayStr}`;

      result.push({
        userId,
        description: `${description} (Mês ${i + 1} - Indeterminado)`,
        amount: monthlyVal,
        date: dateStr,
        referenceMonth: installmentMonth,
        categoryId,
        categoryName,
        paymentMethod: 'CARTAO_CREDITO',
        cardId,
        cardName,
        isInstallment: true,
        isIndefinite: true,
        installmentPurchaseId: purchaseId,
        installmentNumber: i + 1,
        totalInstallments: 0, // 0 signifies indefinite
        status: 'PENDENTE',
        notes: `Lançamento contínuo por tempo indeterminado (Mês ${i + 1}). Pode ser interrompido a qualquer tempo.`,
      });
    }

    return result;
  }

  // Standard fixed installments (e.g. 2x to 36x)
  const parts = splitInstallments(totalAmount, count);

  for (let i = 0; i < count; i++) {
    const installmentMonth = getAdjacentMonth(startMonth, i);
    const dayStr = String(Math.min(28, Math.max(1, defaultDay))).padStart(2, '0');
    const dateStr = `${installmentMonth}-${dayStr}`;

    result.push({
      userId,
      description: `${description} (${i + 1}/${count})`,
      amount: parts[i],
      date: dateStr,
      referenceMonth: installmentMonth,
      categoryId,
      categoryName,
      paymentMethod: 'CARTAO_CREDITO',
      cardId,
      cardName,
      isInstallment: true,
      isIndefinite: false,
      installmentPurchaseId: purchaseId,
      installmentNumber: i + 1,
      totalInstallments: count,
      status: 'PENDENTE',
      notes: `Parcela ${i + 1} de ${count} da compra "${description}"`,
    });
  }

  return result;
};
