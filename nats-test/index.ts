import { connect } from "nats";

const server = "http://localhost:4222";

async function main() {
  const nc = await connect({ servers: server });
  nc.getServer();
  console.log("🚀 ~ main ~  nc.getServer():", nc.getServer());
  console.log("🚀 ~ main ~ nc:", nc);
}

main().catch((err) => {
  console.error("Error running NATS test:", err);
  // process.exit(1);
});
