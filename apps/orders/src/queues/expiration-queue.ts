import Bull = require("bull");
import { pl } from "../logger";

const expirationQueue = new Bull<{ orderId: string; ticketIds: string[] }>(
  "order:expiration",
  {
    redis: {
      host: process.env.REDIS_HOST,
    },
  },
);

expirationQueue.on("error", (err) => {
  pl.error(err, "Error in expiration queue");
});

expirationQueue.whenCurrentJobsFinished().then(() => {
  pl.info("All current jobs in expiration queue have finished");
});

expirationQueue.process(async (job: Bull.Job<{ orderId?: string }>) => {
  pl.info(
    {
      jobId: job.id,
      orderId: job.data?.orderId,
      queueName: job.queue.name,
    },
    "Processing expiration job",
  );
});

export { expirationQueue };
