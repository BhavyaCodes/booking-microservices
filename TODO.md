## Now

- [x] setup migration for drizzle tickets
- [x] add userId to tickets service (schema)
- [x] listen to tickets.created event on orders srv
  - [x] update infra to add new consumer for orders srv
  - [x] update base-listener to allow different consumer orders-service-durable
  - [x] listen on orders srv
  - [x] replicate tickets in orders service
  - [x] setup tests for listener
- [x] update ticket/event/seat category id
  - [x] endpoint in /api/tickets
    <!-- - [ ] emit event in tickets srv thru outbox -> NATS -->
    <!-- - [ ] receive event on orders srv -->
  - [x] add endpoint to update draft mode to false
  - [x] add versioning for updates in db
- [x] update vitest config in auth
- [x] manually test flow till edit event + edit seat category + publish + try edit event + try edit seat category
- [x] update 409 errors (check PR)
- [ ] add cron to outbox
- [ ] add name to seatCategory table
- [x] update names for waiting jobs

### Tickets src
 - [ ] update logic for user not being able to create two orders
   - [ ] can be done by adding additional params to ticket fields or creating new table

### Orders srv
#### payments
 - [x] create payment intent
 - [ ] handle stripe customers
 - [x] check status of payment api
 - [x] receive webhook for scenarios
  - [x] success
  - [x] failed/cancelled 
 - [ ] handle db after failure
 - [ ] emit events after webhook/status update of order
 - [x] replace bulljs with bullmq
##### Later
 - [ ] use a different queue for when payment is processing

#### Expiration of orders
 - [ ] integrate bulljs
 - [ ] send expired event

#### Client
 - [ ] don't use stripe client secret in url
 
## Later

- [x] error helper to make HTTP error payload same across the app
- [ ] ack policy, retention etc
- [ ] isolation levels for transactions
- [ ] test coverage
- [ ] Reliability config & error handling
  - [ ] handle NODE_ENV -> CI
  - [ ] Implement msg.term() handling in tickets-reserved-listener.ts (see TODO at line 51) and design dead letter queue
- [ ] video service
  - [ ] s3 local
  - [ ] upload video
    - [ ] format video -> create multiple variants and improve encoding for web friendly
- [ ] monitoring/logging (grafana?)


### NOTES
 - for stripe webhook -> kubectl port-forward service/orders-srv 3001:3000
                      -> ngrok http --url=<permanent-ngrok-url> 127.0.0.1:3001