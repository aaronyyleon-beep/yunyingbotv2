import path from "node:path";
import { loadRuntimeSnapshot, runOfflineAnalysis } from "@yunyingbot/application";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const snapshot = loadRuntimeSnapshot(repoRoot);
const analysis = runOfflineAnalysis(repoRoot);

console.log("Worker runtime snapshot:");
console.log(JSON.stringify(snapshot, null, 2));
console.log("");
console.log("Offline analysis sample:");
console.log(JSON.stringify(analysis, null, 2));
