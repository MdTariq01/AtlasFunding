require("dotenv").config();
const fs = require("fs");
const path = require("path");
const connectDB = require("../src/db/connection");
const Scholarship = require("../src/models/Scholarship");

async function addManualScholarships() {
  await connectDB();
  
  const jsonPath = path.resolve(__dirname, "../my-scholarships.json");
  if (!fs.existsSync(jsonPath)) {
    console.error("❌ File not found: my-scholarships.json");
    process.exit(1);
  }

  const rawData = fs.readFileSync(jsonPath, "utf-8");
  const items = JSON.parse(rawData);

  console.log(`\n📦 Processing ${items.length} scholarship(s) from my-scholarships.json...\n`);

  let created = 0;
  let skipped = 0;

  for (const item of items) {
    if (!item.name) {
      console.warn("  ⚠️  Skipping item without name:", item);
      continue;
    }
    const existing = await Scholarship.findOne({ name: item.name });
    if (existing) {
      console.log(`  ⏭  Skipped (already exists): "${item.name}"`);
      skipped++;
      continue;
    }
    await Scholarship.create({ ...item, verified: true });
    console.log(`  ✅ Added: "${item.name}"`);
    created++;
  }

  console.log(`\n🎉 Done! Added ${created} new scholarship(s), ${skipped} skipped.`);
  console.log(`📊 Total scholarships in DB: ${await Scholarship.countDocuments()}\n`);
  process.exit(0);
}

addManualScholarships().catch(err => {
  console.error("❌ Error adding scholarships:", err.message);
  process.exit(1);
});
