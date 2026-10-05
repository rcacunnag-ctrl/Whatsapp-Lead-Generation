import { countyFromCity, countyFromZip, cleanCountyName } from './counties.js';
import { config } from './config.js';

const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';

/** Geocodificador gratuito del US Census (sin API key). Devuelve null si no hay coincidencia. */
export async function censusGeocode(address, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const params = new URLSearchParams({
    address,
    benchmark: 'Public_AR_Current',
    vintage: 'Current_Current',
    layers: 'Counties',
    format: 'json',
  });
  const res = await fetchImpl(`${CENSUS_URL}?${params}`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Census geocoder HTTP ${res.status}`);
  return parseCensusResponse(await res.json());
}

export function parseCensusResponse(json) {
  const match = json?.result?.addressMatches?.[0];
  if (!match) return null;
  const county = match.geographies?.Counties?.[0];
  return {
    matchedAddress: match.matchedAddress,
    county: cleanCountyName(county?.NAME),
    state: match.addressComponents?.state || null,
    zip: match.addressComponents?.zip || null,
    lat: match.coordinates?.y ?? null,
    lon: match.coordinates?.x ?? null,
  };
}

/**
 * Determina el condado sin servicios externos: ZIP -> condado, luego ciudad -> condado.
 * Opcional (USE_CENSUS_GEOCODER=true): consulta el Census Geocoder (gratuito, sin API key)
 * solo cuando las tablas no resuelven o el resultado es ambiguo.
 * @returns {Promise<{county, method, matchedAddress, lat, lon, zip, ambiguous}>}
 */
export async function resolveCounty(listing, { useCensus = config.useCensusGeocoder, ...opts } = {}) {
  const out = { county: null, method: 'none', matchedAddress: null, lat: null, lon: null, zip: null, ambiguous: false };

  const byZip = countyFromZip(listing.zip);
  const byCity = countyFromCity(listing.city);
  let local = null;
  if (byZip.county) local = { ...out, county: byZip.county, ambiguous: byZip.ambiguous, method: 'zip_table' };
  else if (byCity.county) local = { ...out, county: byCity.county, ambiguous: byCity.ambiguous, method: 'city_table' };
  // ZIP y ciudad apuntan a condados distintos: hay que revisar
  if (local && byZip.county && byCity.county && byZip.county !== byCity.county) local.ambiguous = true;

  if (useCensus && listing.street_address && (listing.city || listing.zip) && (!local || local.ambiguous)) {
    const oneLine = [listing.street_address, listing.city, listing.state || 'FL', listing.zip].filter(Boolean).join(', ');
    try {
      const geo = await censusGeocode(oneLine, opts);
      if (geo?.county) return { ...out, ...geo, method: 'census_geocoder' };
    } catch (err) {
      out.error = err.message;
    }
  }
  return local || out;
}
