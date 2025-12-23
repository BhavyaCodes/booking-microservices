import {
  connect,
  NatsError,
  RetentionPolicy,
  StorageType,
  StringCodec,
} from "nats";

const server = "http://localhost:4222";

async function main() {
  const nc = await connect({ servers: server, name: "publisher-client" });

  // const js = nc.jetstream();
  const jsm = await nc.jetstreamManager();
  const list = await jsm.streams.list().next();

  console.log("🚀 ~ main ~ list:", list);

  // const sc = StringCodec();

  // const streamName = "TEST_STREAM";
  // const subject = "test.*";

  // // const deleteResult = await jsm.streams.delete(streamName);
  // // console.log("🚀 ~ main ~ deleteResult:", deleteResult);

  // // try {
  // //   const streamInfo = await jsm.streams.info(streamName);
  // //   console.log("🚀 ~ main ~ streamInfo:", streamInfo);
  // // } catch {
  // //   // stream does not exist, create it

  // await jsm.streams.add({
  // 	name: streamName,
  // 	subjects: [subject],
  // 	retention: RetentionPolicy.Limits,
  // 	max_msgs: -1,
  // 	max_bytes: -1,
  // 	max_age: 0,
  // 	storage: StorageType.Memory,
  // 	num_replicas: 1,
  // });
  // console.log(`stream ${streamName} is ready`);
  // // Give the stream a moment to be fully ready
  // await new Promise((resolve) => setTimeout(resolve, 100));
  // // }

  // const subjectOrderCreated = "test.order-created";

  // try {
  // 	for (let i = 1; i <= 10; i++) {
  // 		// const msg = `order-${i}`;
  // 		const payload = {
  // 			id: i,
  // 			status: "created",
  // 			timestamp: new Date().toISOString(),
  // 		};

  // 		const pa = await js.publish(
  // 			subjectOrderCreated,
  // 			sc.encode(JSON.stringify(payload)),
  // 		);
  // 		console.log(
  // 			`published order  id=${payload.id} to stream=${pa.stream} with sequence ${pa.seq}`,
  // 		);
  // 	}
  // } catch (error) {
  // 	if (error instanceof NatsError) {
  // 		console.error(
  // 			error.message,
  // 			error.code,

  // 			error.name,
  // 		);
  // 	}

  // 	console.error("Error publishing messages:", error);
  // }
}

main().catch((err) => {
  console.error("Error running NATS test:", err);
});
