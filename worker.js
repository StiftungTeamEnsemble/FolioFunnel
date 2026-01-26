// Standalone worker script for production
require("ts-node/register");
require("./src/lib/worker/index").startWorker();
