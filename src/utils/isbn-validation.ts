/**
 * ISBN Validation Utilities
 *
 * Provides checksum validation for ISBN-10 and ISBN-13 formats
 * following industry standard algorithms.
 *
 * Created: 2025-11-23 (Issue CR-3: DRY - extract duplicate validation logic)
 */

// ISBN validation regex constants (DRY principle - avoids duplication across functions)
const ISBN10_REGEX = /^\d{9}[\dX]$/i;
const ISBN13_REGEX = /^\d{13}$/;

/**
 * Validates an ISBN-10 string using the Modulo 11 checksum algorithm.
 * Assumes the input is a cleaned 10-character string (9 digits + 1 digit/X).
 *
 * @param cleanedIsbn - The 10-character ISBN-10 string without hyphens or spaces.
 * @returns True if the ISBN-10 is valid, false otherwise.
 */
export function isValidISBN10Checksum(cleanedIsbn: string): boolean {
  // Defensive check, though primary validation should happen before calling this
  if (cleanedIsbn.length !== 10 || !ISBN10_REGEX.test(cleanedIsbn)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanedIsbn[i], 10) * (10 - i);
  }

  const checkChar = cleanedIsbn[9].toUpperCase();
  const checkDigit = checkChar === "X" ? 10 : parseInt(checkChar, 10);

  return (sum + checkDigit) % 11 === 0;
}

/**
 * Validates an ISBN-13 string using the Modulo 10 checksum algorithm.
 * Assumes the input is a cleaned 13-digit string.
 *
 * @param cleanedIsbn - The 13-digit ISBN-13 string without hyphens or spaces.
 * @returns True if the ISBN-13 is valid, false otherwise.
 */
export function isValidISBN13Checksum(cleanedIsbn: string): boolean {
  // Defensive check, though primary validation should happen before calling this
  if (cleanedIsbn.length !== 13 || !ISBN13_REGEX.test(cleanedIsbn)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(cleanedIsbn[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }

  const checkDigit = parseInt(cleanedIsbn[12], 10);
  const calculatedCheckDigit = (10 - (sum % 10)) % 10;

  return calculatedCheckDigit === checkDigit;
}

/**
 * Validates an ISBN (International Standard Book Number) for both ISBN-10 and ISBN-13 formats,
 * including checksum validation.
 *
 * Removes hyphens and spaces before validation.
 *
 * @param isbn - The ISBN string to validate.
 * @returns True if the ISBN is valid (format and checksum), false otherwise.
 */
export function isValidISBN(isbn: string): boolean {
  if (!isbn || isbn.trim().length === 0) return false;

  const cleaned = isbn.replace(/[-\s]/g, "");

  // ISBN-13: exactly 13 digits
  if (cleaned.length === 13 && ISBN13_REGEX.test(cleaned)) {
    return isValidISBN13Checksum(cleaned);
  }

  // ISBN-10: 9 digits + (digit or X)
  if (cleaned.length === 10 && ISBN10_REGEX.test(cleaned)) {
    return isValidISBN10Checksum(cleaned);
  }

  return false;
}
