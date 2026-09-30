/** Case code convention from the historical data: CC- plus at least 3 digits (CC-001 ... CC-114, CC-115 ...). */
export const formatCaseCode = (n: number) => `CC-${String(n).padStart(3, '0')}`;
