import { Employee } from '../types';

/**
 * Validates employee password flexibly:
 * Supports:
 * 1. DDMMYYYY (Tanggal Bulan Tahun Lahir, e.g. 16101989 or 21111999)
 * 2. DD/MM/YYYY or DD-MM-YYYY (e.g. 16/10/1989)
 * 3. YYYYMM (Tahun & Bulan Lahir, e.g. 198910 or 199911)
 * 4. YYYYMMDD (e.g. 19891016)
 * 5. DDMMYY (e.g. 161089)
 * 6. Direct match with employee.password
 */
export function verifyEmployeePassword(employee: Employee, input: string): boolean {
  if (!input || !employee) return false;
  const rawInput = input.trim();
  const digitsOnly = rawInput.replace(/\D/g, '');

  // 1. Direct password field match
  if (employee.password && (rawInput === employee.password.trim() || digitsOnly === employee.password.trim())) {
    return true;
  }

  // 2. Derive variants from birthDate (format DD/MM/YYYY)
  if (employee.birthDate) {
    const parts = employee.birthDate.trim().split(/[/.-]/);
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      const shortYear = year.slice(-2);

      const variants = [
        `${day}${month}${year}`, // DDMMYYYY (e.g., 16101989)
        `${day}/${month}/${year}`,
        `${day}-${month}-${year}`,
        `${year}${month}`, // YYYYMM (e.g., 198910)
        `${year}${month}${day}`, // YYYYMMDD
        `${day}${month}${shortYear}`, // DDMMYY (e.g., 161089)
        `${parseInt(day, 10)}${month}${year}`,
        `${month}${day}${year}`,
      ];

      if (variants.includes(rawInput) || variants.includes(digitsOnly)) {
        return true;
      }
    }
  }

  return false;
}
