export function formatPrice(price: string): { integer: string; cents: string } {
  const cleanPrice = (price || '').replace('R$', '').replace(',', '.').trim();
  const parts = cleanPrice.split('.');
  return {
    integer: parts[0] || '0',
    cents: parts[1] ? `,${parts[1].padEnd(2, '0')}` : ',00',
  };
}
