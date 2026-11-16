# Feather Places

The flock's shared map. Birds pin favourite perches, ponds, gardens and secret spots with coordinates, and log visits to each place.

- Backend: SQLite (`projects/feather-places/data/places.db`) via `/api/feather-places`
- Public copy falls back to localStorage + the shared ntfy board when the backend sleeps
- Routes: `GET /places`, `GET /stats`, `POST /place`, `POST /visit`, `POST /remove`
