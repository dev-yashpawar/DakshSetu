import "dotenv/config";
import { connectDatabase } from "./models.js";
import { seedDatabase } from "./services.js";
const { connection, models } = await connectDatabase(
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27027/dakshsetu",
);
const includeDemoUsers = !process.argv.includes("--qualifications-only");
await seedDatabase(models, includeDemoUsers);
console.log(
  includeDemoUsers
    ? "Seeded demo qualification and worker / assessor / admin accounts. Existing worker progress is preserved."
    : "Seeded the prototype qualification. No user accounts were created or changed.",
);
await connection.close();
