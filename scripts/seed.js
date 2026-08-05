require("dotenv").config();
const connectDB = require("../src/db/connection");
const Scholarship = require("../src/models/Scholarship");
const scholarships = require("../src/seeds/scholarships.seed");

async function seed() {
  await connectDB();
  console.log("🌱 Seeding scholarships...\n");

  let created = 0;
  let skipped = 0;

  for (const data of scholarships) {
    try {
      const existing = await Scholarship.findOne({ name: data.name });
      if (existing) {
        console.log(`  ⏭  Skipped (exists): ${data.name}`);
        skipped++;
        continue;
      }
      await Scholarship.create(data);
      console.log(`  ✅ Created: ${data.name}`);
      created++;
    } catch (err) {
      console.error(`  ❌ Error seeding "${data.name}":`, err.message);
    }
  }

  console.log(`\n📊 Seed complete: ${created} created, ${skipped} skipped`);
  console.log(`🎓 Total scholarships in DB: ${await Scholarship.countDocuments()}\n`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
