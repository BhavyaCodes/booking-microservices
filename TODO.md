## Now

- [x] setup migration for drizzle tickets
- [x] add userId to tickets service (schema)
- [ ] listen to tickets.created event on orders srv
  - [x] update infra to add new consumer for orders srv
  - [x] update base-listener to allow different consumer orders-service-durable
  - [x] listen on orders srv
  - [x] replicate tickets in orders service
  - [ ] setup tests for listener

## Later

- [x] error helper to make HTTP error payload same across the app
- [ ] ack policy, retention etc
