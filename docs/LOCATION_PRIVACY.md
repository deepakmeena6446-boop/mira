# Location request privacy boundary

MIRA browser requests send coordinates in POST bodies, never browser URLs. Server-to-provider requests differ by provider interface:

- Google Places and Routes and OpenStreetMap Overpass accept POST bodies, which MIRA uses.
- Nominatim reverse/search, Photon search, and Google Geocoding v3 reverse use GET interfaces with coordinates or a search bias in the URL. MIRA rounds these coordinates before requests and centralizes URL construction in `src/server/providers/geo/coordinate-url.ts`. These URLs must never be logged by MIRA; third-party services may have their own request logs. The app cannot claim coordinates never appear in *any* URL.
- Google Geocoding v4 also uses GET for reverse geocoding. Migrating versions would not remove this provider-level URL limitation.

This is a provider interface limitation, not a browser URL leak. Revisit provider selection if a strict no-coordinate-in-provider-URL policy becomes a release requirement.

## Safety updates

`POST /api/safety-updates` receives a point in the body: her location on Home, or a destination she picked. MIRA reverse-geocodes it through the same provider path as above, which rounds it. From that answer it keeps only the city name, or the region name when no city is known. Only that name reaches a news provider (GDELT today); the `SafetySearch` interface has no coordinate fields.

The point is not stored or logged. The results cache (`safety_intel_cache`) is keyed by a hash of country, city and window. It holds published headlines, not coordinates or user ids. `tests/integration/security.test.ts` checks that the posted coordinates appear in neither the response nor the cache. The design is in [SAFETY_UPDATES.md](SAFETY_UPDATES.md).
