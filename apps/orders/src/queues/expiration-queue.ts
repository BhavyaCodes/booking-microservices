import Bull = require("bull");
import { pl } from "../logger";

import { OrderExpiredEvent, Subjects } from "@booking/common";
import { orderExpiredPublisher } from "../events/order-expired-publisher";

const BULL_QUEUE_NAME = "order:expiration";

const expirationQueue = new Bull<OrderExpiredEvent["data"]>(BULL_QUEUE_NAME, {
  redis: {
    host: process.env.REDIS_HOST,
  },
});

expirationQueue.on("error", (err) => {
  pl.error(err, "Error in expiration queue");
});

expirationQueue.whenCurrentJobsFinished().then(() => {
  pl.info("All current jobs in expiration queue have finished");
});

expirationQueue.process(async (job, done) => {
  pl.info(
    {
      jobId: job.id,
      orderId: job.data?.orderId,
      ticketIds: job.data?.ticketIds,
      queueName: job.queue.name,
    },
    "Processing expiration job",
  );

  const pa = await orderExpiredPublisher(job.data).catch((err) => {
    done(err);
  });

  done(null, pa);
});

export { expirationQueue };
