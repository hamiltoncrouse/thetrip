# Context Notes (Nov 17)

## Features recently added
- **Trip sharing**: New `TripCollaborator` model and `/api/trips/[tripId]/collaborators` route. Trips load if you own them or if your Gmail is in collaborators. Share UI lives next to trip selector; enter Gmail and click Share.
- **Hotels (Booking.com RapidAPI)**: Pagination (20 per page) with Load more, sorting (price/rating/distance), filters (min rating/max distance/max price). Cards show price/distance/rating and have a single solid "Open" CTA. When Booking throttles (429), we fall back to curated entries. Links now go to Booking search results with the hotel preselected.
- **Title autocomplete**: Optional toggle "Suggest places" on activity Title. Uses `/api/maps/autocomplete`; selecting a suggestion auto-fills Title and Address via `/api/maps/place`.
- **UI tweaks**: Fonda avatar 100px with white halo; activity titles shown above times.

## Known limitations
- Booking links land on searchresults page (not direct hotel deep-link) due to API constraints; we build a search URL with `selected_hotels`.
- RapidAPI Booking plan has quota limits; falls back to curated list on 429.

## Migrations applied
- TripCollaborator table added and deployed (`20251117170000`, `20251117170500`, `20251117171000`).

## Env keys in use
- Booking RapidAPI: `BOOKING_RAPIDAPI_KEY`, `BOOKING_RAPIDAPI_HOST` (booking-com15.p.rapidapi.com).
- Firebase auth required for trips (ID token header).

## Next ideas
- Improve hotel deep links if API exposes property URLs.
- Remove temporary Booking debug logs once verified.
- Role-based sharing (currently all collaborators have full edit).
