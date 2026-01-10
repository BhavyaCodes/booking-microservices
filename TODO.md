## Now

- [x] setup migration for drizzle tickets
- [x] add userId to tickets service (schema)
- [x] listen to tickets.created event on orders srv
  - [x] update infra to add new consumer for orders srv
  - [x] update base-listener to allow different consumer orders-service-durable
  - [x] listen on orders srv
  - [x] replicate tickets in orders service
  - [x] setup tests for listener
- [ ] update ticket/event/seat category id
  - [ ] endpoint in /api/tickets
  - [ ] emit event in tickets srv thru outbox -> NATS
  - [ ] receive event on orders srv
  - [ ] add endpoint to update draft mode to false
  - [ ] add versioning for updates in db

## Later

- [x] error helper to make HTTP error payload same across the app
- [ ] ack policy, retention etc
