import { XMLParser } from 'fast-xml-parser';

export const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_"
});

export const API_KEY = '77KUX2NEZ7SIRLUVUKXR5EDA5U7TWM2I';
export const BASE_URL = '/api-presta/api'; 
export const IMAGE_BASE_URL = '/api-presta/api/images/products'; 

// --- UTILITAIRES ---
export function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function extractValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (value.language) {
      return Array.isArray(value.language) ? value.language[0]?.['#text'] ?? '' : value.language['#text'] ?? '';
    }
    if (value['#text'] !== undefined) return String(value['#text']);
    return '';
  }
  return String(value);
}

// --- CRUD DE BASE ---
export async function fetchPrestaData(resourcePath, limitStart = 0, limitCount = 50) {
  const hasQuery = resourcePath.includes('?');
  const hasDisplay = /(?:\?|&)display=/.test(resourcePath);
  const hasLimit = /(?:\?|&)limit=/.test(resourcePath);
  const separator = hasQuery ? '&' : '?';
  const extraParams = [
    `ws_key=${API_KEY}`,
    !hasDisplay ? 'display=full' : null,
    !hasLimit ? `limit=${limitStart},${limitCount}` : null,
  ].filter(Boolean).join('&');
  const url = `${BASE_URL}/${resourcePath}${separator}${extraParams}`;
  try {
    const response = await fetch(url);
    const responseText = await response.text();
    if (!response.ok) {
      const preview = responseText
        .replace(/\s+/g, ' ')
        .slice(0, 300);
      throw new Error(`Erreur API PrestaShop: statut ${response.status}${preview ? ` - ${preview}` : ''}`);
    }
    const jsonObj = parser.parse(responseText);
    return jsonObj.prestashop;
  } catch (error) {
    console.error(`Erreur GET sur ${resourcePath}:`, error);
    throw error;
  }
}

export async function updatePrestaData(resourcePath, id, xmlData) {
  const response = await fetch(`${BASE_URL}/${resourcePath}/${id}?ws_key=${API_KEY}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/xml' }, body: xmlData,
  });
  if (!response.ok) throw new Error(`Erreur PUT sur ${resourcePath}`);
  return response.text();
}

export async function deletePrestaItem(resourcePath, id) {
  const response = await fetch(`${BASE_URL}/${resourcePath}/${id}?ws_key=${API_KEY}`, { method: 'DELETE' });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Échec DELETE sur ${resourcePath} (ID: ${id}) - Statut: ${response.status} - Détail: ${errorText.substring(0, 300)}`);
  }
  return true;
}

export async function fetchPrestaDataJSON(resourcePath) {
  const separator = resourcePath.includes('?') ? '&' : '?';
  const url = `${BASE_URL}/${resourcePath}${separator}ws_key=${API_KEY}&output_format=JSON`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Erreur API: statut ${response.status}`);
    return await response.json(); // On parse directement en JSON natif
  } catch (error) {
    console.error(`Erreur GET sur ${resourcePath}:`, error);
    throw error;
  }
}