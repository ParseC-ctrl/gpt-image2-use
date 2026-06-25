const STORAGE_PREFIX = "image2";

export function storageKey(key: string) {
  return `${STORAGE_PREFIX}.${key}`;
}

export function getStoredValue(key: string, fallback = "") {
  return localStorage.getItem(storageKey(key)) || fallback;
}

export function setStoredValue(key: string, value: string) {
  localStorage.setItem(storageKey(key), value);
}

export function removeStoredValue(key: string) {
  localStorage.removeItem(storageKey(key));
}
