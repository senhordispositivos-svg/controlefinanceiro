import { CreditCard, Expense } from '../types';

export interface CanonicalCardInfo {
  canonicalId: string;
  canonicalName: string;
  bank: string;
  color: string;
  isRegistered: boolean;
  registeredCard?: CreditCard;
}

/**
 * Normaliza e consolida variações de nomes de cartões (ex: "INTER", "BANCO INTER", "Banco Inter S.A.")
 * e associa com os cartões de crédito cadastrados pelo usuário.
 */
export function getCanonicalCardInfo(
  cardId?: string,
  cardName?: string,
  registeredCards: CreditCard[] = []
): CanonicalCardInfo {
  const rawName = (cardName || '').trim();
  const lowerName = rawName.toLowerCase();

  // 1. Tentar encontrar por ID exato no cadastro
  if (cardId) {
    const matchedById = registeredCards.find((c) => c.id === cardId);
    if (matchedById) {
      return {
        canonicalId: matchedById.id,
        canonicalName: matchedById.name.toUpperCase(),
        bank: matchedById.bank || 'Crédito',
        color: matchedById.color || '#8B5CF6',
        isRegistered: true,
        registeredCard: matchedById,
      };
    }
  }

  // 2. Tentar match inteligente nos cartões cadastrados pelo nome
  if (rawName) {
    const matchedByName = registeredCards.find((c) => {
      const cLower = c.name.toLowerCase().trim();
      if (cLower === lowerName) return true;
      if (cLower.includes('inter') && lowerName.includes('inter')) return true;
      if (
        (cLower.includes('nubank') || cLower.includes('nu ')) &&
        (lowerName.includes('nubank') || lowerName.includes('nu'))
      )
        return true;
      if (
        (cLower.includes('mercado') || cLower.includes('mp')) &&
        (lowerName.includes('mercado') || lowerName.includes('mp'))
      )
        return true;
      if (
        (cLower.includes('itau') || cLower.includes('itaú')) &&
        (lowerName.includes('itau') || lowerName.includes('itaú'))
      )
        return true;
      if (cLower.includes('bradesco') && lowerName.includes('bradesco')) return true;
      if (cLower.includes('santander') && lowerName.includes('santander')) return true;
      if (cLower.includes('c6') && lowerName.includes('c6')) return true;
      if (cLower.includes('caixa') && lowerName.includes('caixa')) return true;
      if (
        (cLower.includes('brasil') || cLower.includes('bb')) &&
        (lowerName.includes('brasil') || lowerName.includes('bb'))
      )
        return true;
      return false;
    });

    if (matchedByName) {
      return {
        canonicalId: matchedByName.id,
        canonicalName: matchedByName.name.toUpperCase(),
        bank: matchedByName.bank || 'Crédito',
        color: matchedByName.color || '#8B5CF6',
        isRegistered: true,
        registeredCard: matchedByName,
      };
    }
  }

  // 3. Normalização canônica por bancos conhecidos (caso não haja cadastro ou tenha nomes variados)
  let canonicalName = rawName || 'CARTÃO DE CRÉDITO';
  let bank = 'Crédito';
  let color = '#8B5CF6';

  if (lowerName.includes('inter')) {
    canonicalName = 'BANCO INTER';
    bank = 'Banco Inter';
    color = '#FF7A00';
  } else if (lowerName.includes('mercado') || lowerName.includes('mp')) {
    canonicalName = 'MERCADO PAGO';
    bank = 'Mercado Pago';
    color = '#009EE3';
  } else if (lowerName.includes('nubank') || lowerName.includes('roxinho') || lowerName === 'nu') {
    canonicalName = 'NUBANK';
    bank = 'Nubank';
    color = '#820AD1';
  } else if (lowerName.includes('itau') || lowerName.includes('itaú')) {
    canonicalName = 'ITAÚ';
    bank = 'Itaú Unibanco';
    color = '#EC7000';
  } else if (lowerName.includes('bradesco')) {
    canonicalName = 'BRADESCO';
    bank = 'Bradesco';
    color = '#CC092F';
  } else if (lowerName.includes('santander')) {
    canonicalName = 'SANTANDER';
    bank = 'Santander';
    color = '#EA1D25';
  } else if (lowerName.includes('c6')) {
    canonicalName = 'C6 BANK';
    bank = 'C6 Bank';
    color = '#1E293B';
  } else if (lowerName.includes('caixa')) {
    canonicalName = 'CAIXA';
    bank = 'Caixa Econômica';
    color = '#005CA9';
  } else if (lowerName.includes('brasil') || lowerName.includes('bb')) {
    canonicalName = 'BANCO DO BRASIL';
    bank = 'Banco do Brasil';
    color = '#EAB308';
  } else {
    canonicalName = rawName.toUpperCase();
  }

  const slug = canonicalName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const canonicalId = `canonical-card-${slug}`;

  return {
    canonicalId,
    canonicalName,
    bank,
    color,
    isRegistered: false,
  };
}

/**
 * Verifica se uma despesa pertence ao cartão canônico especificado
 */
export function isExpenseMatchingCard(
  expense: Expense,
  targetCanonicalId: string,
  targetCanonicalName: string,
  registeredCards: CreditCard[] = []
): boolean {
  if (expense.paymentMethod !== 'CARTAO_CREDITO') return false;

  const targetIdClean = (targetCanonicalId || '').trim();
  const targetNameClean = (targetCanonicalName || '').trim().toLowerCase();
  const expCardId = (expense.cardId || '').trim();
  const expCardNameClean = (expense.cardName || '').trim().toLowerCase();

  // 1. Match direto por ID
  if (targetIdClean && (expCardId === targetIdClean || expense.paymentMethodId === targetIdClean)) {
    return true;
  }

  // 2. Match direto por nome limpo
  if (expCardNameClean && targetNameClean) {
    if (expCardNameClean === targetNameClean) return true;
    if (expCardNameClean.includes(targetNameClean) || targetNameClean.includes(expCardNameClean)) return true;
  }

  // 3. Match canônico inteligente
  const info = getCanonicalCardInfo(expense.cardId, expense.cardName, registeredCards);

  if (targetIdClean && info.canonicalId === targetIdClean) return true;
  if (info.canonicalName.trim().toLowerCase() === targetNameClean) return true;
  if (targetNameClean && (info.canonicalName.trim().toLowerCase().includes(targetNameClean) || targetNameClean.includes(info.canonicalName.trim().toLowerCase()))) {
    return true;
  }
  if (info.registeredCard && (info.registeredCard.id === targetIdClean || info.registeredCard.name.trim().toLowerCase() === targetNameClean)) {
    return true;
  }

  // 4. Se targetCanonicalId for id de um cartão registrado na lista
  const targetCard = registeredCards.find((c) => c.id === targetIdClean || c.name.trim().toLowerCase() === targetNameClean);
  if (targetCard) {
    if (expCardId === targetCard.id) return true;
    if (expCardNameClean && (expCardNameClean === targetCard.name.trim().toLowerCase() || expCardNameClean.includes(targetCard.name.trim().toLowerCase()))) {
      return true;
    }
  }

  return false;
}
