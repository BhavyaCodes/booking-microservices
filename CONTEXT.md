# Booking

Event ticketing: organizers publish events and seating; buyers reserve and pay for tickets.

## Language

**Event**:
A scheduled performance or gathering that can be sold as tickets. Draft until published; then available for booking while its date is still in the future.
_Avoid_: Show, listing

**Seat Category**:
A priced block of seats within an Event (row range, seats per row, price).
_Avoid_: Section, tier (unless priced the same way)

**Ticket**:
One seat in a Seat Category for an Event. May be free, held by a user, or sold.
_Avoid_: Seat (when you mean the inventory row), booking

**Reservation**:
A temporary hold of one or more Tickets for a user until payment succeeds or the hold expires.
_Avoid_: Booking (ambiguous with sold tickets), order (belongs to payment/checkout)

**Event Catalog**:
The Events an organizer prepares and the published Events buyers can browse.
_Avoid_: Event list, inventory (too broad)

**Seat Layout**:
How an Event’s seating is divided into Seat Categories and the Tickets that fill them.
_Avoid_: Floor plan, seating chart (UI-only)
